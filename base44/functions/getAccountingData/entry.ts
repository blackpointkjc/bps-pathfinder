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

    return Response.json({
      success: true,
      scope,
      as_of: new Date().toISOString(),
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
  } catch (error) {
    console.error('getAccountingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load accounting data' }, { status: 500 });
  }
});
