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
      expenses: ['users','expenseReports','companyExpenses'],
      profit: ['users','configs','timeEntries','invoices','locations','expenseReports','companyExpenses','ptoUsage','schedules'],
      overview: ['users','periods','payrollEntries','expenseReports','companyExpenses','invoices','timeEntries','locations','schedules'],
      full: ['users','periods','payrollEntries','configs','timeEntries','invoices','locations','expenseReports','companyExpenses','timeOffRequests','ptoUsage','w2Forms','schedules'],
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
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const rows = await source.load();
            result[key] = Array.isArray(rows) ? rows : [];
            break;
          } catch (error:any) {
            if (attempt === 0) { await delay(500); continue; }
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
      locations=[], expenseReports=[], companyExpenses=[], timeOffRequests=[],
      ptoUsage=[], w2Forms=[], schedules=[],
    } = result;

    const clients = (users || []).filter((u: any) => {
      const r = new Set((u.additional_roles || []).map((x: string) => String(x).toLowerCase()));
      return !u.termination_date && (r.has('client') || String(u.rank || '').toLowerCase() === 'client' || String(u.user_type || '').toLowerCase() === 'client');
    });

    // A site may have an assigned billing contact even when that contact has
    // not created a Pathfinder client-portal login. Do not hide billable sites
    // merely because the User directory contains no client-role accounts.
    const knownClients = new Set(clients.map((c:any)=>String(c.email||'').toLowerCase()));
    for (const site of locations || []) {
      const email=String(site.assigned_client_email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || knownClients.has(email)) continue;
      clients.push({email,full_name: String(site.assigned_client_name || site.client_name || email), billing_contact_only:true});
      knownClients.add(email);
    }

    // Server-calculated financial roll-up. Display only what was retrieved;
    // source failures are returned as partial and never silently treated as $0.
    let financialSummary: any = null;
    if (scope === 'overview') {
      const now = new Date();
      const easternDay = (date:Date) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const today=easternDay(now);
      const current = periods.find((p:any)=>p.start_date<=today&&p.end_date>=today);
      const rangeStart=current?.start_date||`${today.slice(0,7)}-01`;
      const rangeEnd=current?.end_date||today;
      const siteOf=(v:any)=>String(v||'').split(/\s*(?::|\s-\s)\s*/)[0].trim();
      const locationBySite=new Map(locations.map((row:any)=>[siteOf(row.site_name),row]));
      let serviceHours=0,earnedRevenue=0,onDuty=0;
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
        const rate=Number(location?.[field])||Number(unarmed?location?.site_bill_rate_unarmed:location?.site_bill_rate)||Number(location?.site_bill_rate)||0;
        serviceHours+=hours;earnedRevenue+=hours*rate;
        if(!entry.clock_out)onDuty++;
      }
      const outstanding=invoices.filter((item:any)=>['sent','overdue'].includes(String(item.status||'').toLowerCase()) && String(item.delivery_status||'').toLowerCase()==='accepted').reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.total_amount||0)-Number(item.amount_paid||0)),0);
      const unpaid=companyExpenses.filter((item:any)=>String(item.status||'').toLowerCase()==='unpaid').reduce((sum:number,item:any)=>sum+Number(item.amount||0),0);
      financialSummary={period_start:rangeStart,period_end:rangeEnd,service_hours:Math.round(serviceHours*100)/100,earned_service_revenue:Math.round(earnedRevenue*100)/100,on_duty: onDuty,outstanding_client_invoices:Math.round(outstanding*100)/100,unpaid_company_bills:Math.round(unpaid*100)/100,invoice_count:invoices.length,
        unverified_sent_count:invoices.filter((row:any)=>['sent','overdue'].includes(String(row.status||'').toLowerCase()) && String(row.delivery_status||'').toLowerCase()!=='accepted').length,
        invoice_review_count:invoices.filter((row:any)=>row.billing_review_required===true).length,
        invoice_draft_count:invoices.filter((row:any)=>String(row.status||'').toLowerCase()==='draft').length,
        expense_count:companyExpenses.length,as_of:new Date().toISOString(),complete:loadErrors.length===0};
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
