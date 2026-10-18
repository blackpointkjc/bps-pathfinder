import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (me.role !== 'admin' && !roles.has('accounting') && !roles.has('full_access')) {
      return Response.json({ error: 'Accounting access required' }, { status: 403 });
    }

    const input = await req.json().catch(() => ({}));
    const scope = String(input?.scope || 'full').trim().toLowerCase();
    // Load only the tables required by the active accounting screen; a full
    // 14-table read used to block every tab and exacerbate API 429s.
    const scopeTables: Record<string,string[]> = {
      payroll: ['users','periods','payrollEntries','configs','timeEntries'],
      invoices: ['users','invoices','locations','timeEntries','schedules'],
      expenses: ['users','expenseReports','companyExpenses','recurringBills'],
      profit: ['users','configs','timeEntries','invoices','locations','expenseReports','companyExpenses','recurringBills','ptoUsage','schedules'],
      overview: ['users','periods','payrollEntries','expenseReports','companyExpenses','recurringBills','invoices','timeEntries','locations','schedules'],
      finance: ['users','periods','payrollEntries','configs','timeEntries','invoices','locations','expenseReports','companyExpenses','recurringBills','ptoUsage','schedules'],
      full: ['users','periods','payrollEntries','configs','timeEntries','invoices','locations','expenseReports','companyExpenses','recurringBills','timeOffRequests','ptoUsage','w2Forms','schedules'],
    };
    const selected = scopeTables[scope] || scopeTables.full;
    const loadErrors: string[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const tableLoads: Record<string, { label:string; load:() => Promise<any[]> }> = {
      users: {label:'employee directory',load:()=>base44.asServiceRole.entities.User.list('last_name',1500)},
      periods: {label:'payroll periods',load:()=>base44.asServiceRole.entities.PayrollPeriod.list('-start_date',500)},
      payrollEntries: {label:'payroll entries',load:()=>base44.asServiceRole.entities.PayrollEntry.list('-created_date',3000)},
      configs: {label:'payroll configuration',load:()=>base44.asServiceRole.entities.PayrollConfig.list('config_name',50)},
      timeEntries: {label:'time entries',load:()=>base44.asServiceRole.entities.TimeEntry.list('-clock_in',5000)},
      invoices: {label:'client invoices',load:()=>base44.asServiceRole.entities.Invoice.list('-created_date',2000)},
      locations: {label:'locations',load:()=>base44.asServiceRole.entities.Location.list('site_name',1000)},
      expenseReports: {label:'expense reimbursements',load:()=>base44.asServiceRole.entities.ExpenseReport.list('-created_date',2000)},
      companyExpenses: {label:'company expenses',load:()=>base44.asServiceRole.entities.CompanyExpense.list('-expense_date',2000)},
      recurringBills: {label:'recurring monthly bills',load:()=>base44.asServiceRole.entities.RecurringCompanyBill.list('next_due_date',1000)},
      timeOffRequests: {label:'time-off requests',load:()=>base44.asServiceRole.entities.TimeOffRequest.list('-created_date',2000)},
      ptoUsage: {label:'PTO usage',load:()=>base44.asServiceRole.entities.PTOUsage.list('-usage_date',5000)},
      w2Forms: {label:'W-2 forms',load:()=>base44.asServiceRole.entities.W2Form.list('-tax_year',2000)},
      schedules: {label:'schedules',load:()=>base44.asServiceRole.entities.Schedule.list('-shift_date',5000)},
    };
    const result: Record<string,any[]> = {};
    // Bounded concurrency improves latency without dumping every entity call
    // into the Base44 rate limiter simultaneously.
    let cursor = 0;
    const worker = async () => {
      while (cursor < selected.length) {
        const key = selected[cursor++];
        const source = tableLoads[key];
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const rows = await source.load();
            result[key] = Array.isArray(rows) ? rows : [];
            break;
          } catch (error:any) {
            if (attempt < 3) { await delay((attempt+1)*900); continue; }
            console.error(`getAccountingData could not load ${source.label}`,error?.message || error);
            loadErrors.push(source.label);
            result[key] = [];
          }
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(2,selected.length)},()=>worker()));
    const {
      users=[], periods=[], payrollEntries=[], configs=[], timeEntries=[], invoices=[],
      locations=[], expenseReports=[], companyExpenses=[], recurringBills=[], timeOffRequests=[],
      ptoUsage=[], w2Forms=[], schedules=[],
    } = result;

    const clients = (users || []).filter((u: any) => {
      const r = new Set((u.additional_roles || []).map((x: string) => String(x).toLowerCase()));
      return !u.termination_date && (r.has('client') || String(u.rank || '').toLowerCase() === 'client' || String(u.user_type || '').toLowerCase() === 'client');
    });

    // A location's assigned_client_email can be an internal administrator and
    // must never automatically become the outgoing billing recipient.
    // Show only verified billing contacts and explicitly client-role accounts.
    const knownClients = new Set(clients.map((c:any)=>String(c.email||'').toLowerCase()));
    for (const site of locations || []) {
      const email=String(site.billing_contact_email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || knownClients.has(email)) continue;
      clients.push({email,full_name:String(site.assigned_client_name || site.client_name || email), billing_contact_only:true});
      knownClients.add(email);
    }

    // Server-calculated financial roll-up. Display only what was retrieved;
    // source failures are returned as partial and never silently treated as $0.
    let financialSummary: any = null;
    if (scope === 'overview' || scope === 'finance' || scope === 'full') {
      const now = new Date();
      const easternDay = (date:Date) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const today=easternDay(now);
      const current = periods.find((p:any)=>p.start_date<=today&&p.end_date>=today);
      const rangeStart='1900-01-01';
      const rangeEnd=today;
      const siteOf=(v:any)=>String(v||'').split(/\s*(?::|\s-\s)\s*/)[0].trim();
      const locationBySite=new Map(locations.map((row:any)=>[siteOf(row.site_name),row]));
      let serviceHours=0,earnedRevenue=0,onDuty=0,unverifiedRates=0;
      const approvedInvoiceRates=new Map<string,number>();
      for (const invoice of invoices) {
        if (!invoice.billing_rate_verified_at || !Number(invoice.billing_rate_verified_value) || ['void','cancelled'].includes(String(invoice.status||'').toLowerCase())) continue;
        let shifts:any[]=[];
        try {shifts=JSON.parse(invoice.shifts||'[]');}catch{}
        for(const shift of (Array.isArray(shifts)?shifts:[])) {
          if(shift.clockIn) approvedInvoiceRates.set(`${siteOf(invoice.site_name)}|${shift.clockIn}`,Number(shift.rate||invoice.billing_rate_verified_value));
        }
      }
      for (const entry of timeEntries) {
        if (!entry?.clock_in || entry.archived===true) continue;
        const day=easternDay(new Date(entry.clock_in));
        if(day<rangeStart||day>rangeEnd) continue;
        const start=Date.parse(entry.clock_in),end=entry.clock_out?Date.parse(entry.clock_out):Date.now();
        if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
        const breaks=(Array.isArray(entry.break_periods)?entry.break_periods:[]).reduce((sum:number,row:any)=>{
          const a=Date.parse(row.start), b=row.end?Date.parse(row.end):(entry.on_break?end:NaN);
          return Number.isFinite(a)&&Number.isFinite(b)&&b>a?sum+Math.max(0,Math.min(b,end)-Math.max(a,start)):sum;
        },0);
        const hours=Math.max(0,(end-start-breaks)/3600000);
        const site=siteOf(entry.location);
        const location=locationBySite.get(site) as any;
        const scheduled=schedules.find((shift:any)=>shift.archived!==true&&String(shift.officer_email||'').toLowerCase()===String(entry.officer_email||'').toLowerCase()&&siteOf(shift.location)===site&&String(shift.shift_date||'').slice(0,10)===day);
        const unarmed=/\bunarmed\b/i.test(`${scheduled?.site_details||''} ${scheduled?.special_instructions||''}`);
        const type=String(scheduled?.shift_type||'normal').toLowerCase();
        let field=unarmed?'site_bill_rate_unarmed':'site_bill_rate';
        if(type==='holiday_coverage')field=unarmed?'site_bill_rate_holiday_unarmed':'site_bill_rate_holiday_armed';
        else if(type==='rush_coverage')field=unarmed?'site_bill_rate_rush_unarmed':'site_bill_rate_rush_armed';
        const history=(Array.isArray(location?.site_rate_history)?location.site_rate_history:[]).filter((item:any)=>item.effective_date&&Number(item.rate)>0).sort((a:any,b:any)=>String(a.effective_date).localeCompare(String(b.effective_date)));
        const historical=history.filter((item:any)=>String(item.effective_date)<=day).at(-1);
        const standard=Number(historical?.rate)||Number(location?.site_bill_rate)||0;
        const special=type==='holiday_coverage'||type==='rush_coverage'||unarmed;
        const laterRateChange=history.some((item:any)=>String(item.effective_date)>day);
        const approved=approvedInvoiceRates.get(`${site}|${entry.clock_in}`);
        const rate=approved|| (special?(Number(location?.[field])||standard):standard);
        if (!location || rate<=0 || (!approved && ((history.length>0&&!historical) || (special&&laterRateChange)))) unverifiedRates++;
        serviceHours+=hours;earnedRevenue+=hours*rate;
        if(!entry.clock_out)onDuty++;
      }
      // One reconciled company-wide ledger is shared by the dashboard,
      // invoice center, payroll center and profitability. Duplicates for the
      // exact same site/service period count only once in financial totals.
      const canonical = new Map<string,any>();
      for (const invoice of invoices) {
        if(['void','cancelled'].includes(String(invoice.status||'').toLowerCase())) continue;
        const key=`${siteOf(invoice.site_name).toLowerCase()}|${invoice.period_start}|${invoice.period_end}`;
        const current=canonical.get(key);
        const priority=(record:any)=>String(record.status||'').toLowerCase()==='paid'?4:['sent','pending','partial','overdue'].includes(String(record.status||'').toLowerCase())?3:1;
        if(!current||priority(invoice)>priority(current)||(priority(invoice)===priority(current)&&String(invoice.created_date||'')<String(current.created_date||''))) canonical.set(key,invoice);
      }
      const uniqueInvoices=[...canonical.values()];
      const billableInvoices=uniqueInvoices.filter((row:any)=>['paid','sent','pending','partial','overdue'].includes(String(row.status||'').toLowerCase()));
      const billedTotal=billableInvoices.reduce((sum:number,row:any)=>sum+Number(row.total_amount||0),0);
      const clientPayments=billableInvoices.reduce((sum:number,row:any)=>{
        const paid=Number(row.amount_paid||0);
        return sum+(paid>0?Math.min(Number(row.total_amount||0),paid):String(row.status||'').toLowerCase()==='paid'?Number(row.total_amount||0):0);
      },0);
      const outstanding=Math.max(0,billedTotal-clientPayments);
      const recordedPayroll=(payrollEntries||[]).reduce((sum:number,row:any)=>sum+Number(row.gross_pay||0),0);
      const payrollPaid=(payrollEntries||[]).filter((row:any)=>String(row.status||'').toLowerCase()==='paid').reduce((sum:number,row:any)=>sum+Number(row.gross_pay||0),0);
      const reimbursable=(expenseReports||[]).filter((row:any)=>['approved','reimbursed','paid'].includes(String(row.status||'').toLowerCase())).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
      const operating=(companyExpenses||[]).filter((row:any)=>['paid','unpaid'].includes(String(row.status||'').toLowerCase())&&!String(row.reference_number||'').startsWith('OFFICER-EXP-')).reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
      const unpaid=companyExpenses.filter((row:any)=>String(row.status||'').toLowerCase()==='unpaid').reduce((sum:number,row:any)=>sum+Number(row.amount||0),0);
      const formatAmount=(amount:number)=>Math.round(amount*100)/100;
      const complete=loadErrors.length===0;
      financialSummary={period_start:rangeStart,period_end:rangeEnd,
        service_hours:formatAmount(serviceHours),period_service_hours:formatAmount(serviceHours),
        earned_service_revenue:formatAmount(earnedRevenue),on_duty:onDuty,
        billed_total:formatAmount(billedTotal),client_payments:formatAmount(clientPayments),
        outstanding_client_invoices:formatAmount(outstanding),unpaid_company_bills:formatAmount(unpaid),
        payroll_total:formatAmount(recordedPayroll),payroll_paid:formatAmount(payrollPaid),
        operating_expenses:formatAmount(operating+reimbursable),
        estimated_profit:formatAmount(earnedRevenue-recordedPayroll-operating-reimbursable),
        unverified_rate_shifts:unverifiedRates,invoice_count:uniqueInvoices.length,
        unverified_sent_count:uniqueInvoices.filter((row:any)=>['sent','pending','partial','overdue'].includes(String(row.status||'').toLowerCase())&&String(row.delivery_status||'').toLowerCase()!=='accepted').length,
        invoice_review_count:uniqueInvoices.filter((row:any)=>row.billing_review_required===true).length,
        invoice_draft_count:uniqueInvoices.filter((row:any)=>String(row.status||'').toLowerCase()==='draft').length,
        expense_count:companyExpenses.length,
        as_of:new Date().toISOString(),complete,load_errors:loadErrors,
      };
    }

    return Response.json({
      success: true,
      scope,
      as_of: new Date().toISOString(),
      financialSummary,
      partial: loadErrors.length > 0,
      load_errors: loadErrors,
      users: users || [],
      clients,
      timeEntries: timeEntries || [],
      payrollEntries: payrollEntries || [],
      payroll_entries: payrollEntries || [],
      config: configs?.[0] || null,
      payrollPeriods: periods || [],
      payroll_periods: periods || [],
      periods: periods || [],
      invoices: invoices || [],
      locations: locations || [],
      expenseReports: expenseReports || [],
      companyExpenses: companyExpenses || [],
      recurringBills: recurringBills || [],
      timeOffRequests: timeOffRequests || [],
      ptoUsage: ptoUsage || [],
      w2Forms: w2Forms || [],
      schedules: schedules || [],
    });
  } catch (error:any) {
    console.error('getAccountingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load accounting data' }, { status: 500 });
  }
});
