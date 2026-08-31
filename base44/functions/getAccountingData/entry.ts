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
    const payrollOnly = scope === 'payroll';
    const overviewOnly = scope === 'overview';
    const fullAccounting = !payrollOnly && !overviewOnly;
    const loadErrors: string[] = [];
    const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

    const safeList = async (label: string, loader: () => Promise<any[]>) => {
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const rows = await loader();
          return Array.isArray(rows) ? rows : [];
        } catch (error) {
          lastError = error;
          if (attempt < 2) await delay(700 * (attempt + 1));
        }
      }
      console.error(`getAccountingData could not load ${label}`, lastError);
      loadErrors.push(label);
      return [];
    };

    const load = async (label: string, loader: () => Promise<any[]>) => {
      const rows = await safeList(label, loader);
      await delay(175);
      return rows;
    };

    // Each scope loads only the records its screen uses. Reads are serialized and
    // retried so one transient Base44 rate limit cannot blank the whole center.
    const users = await load('employee directory', () => base44.asServiceRole.entities.User.list('last_name', 1500));
    const periods = await load('payroll periods', () => base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 500));
    const payrollEntries = await load('payroll entries', () => base44.asServiceRole.entities.PayrollEntry.list('-created_date', 3000));

    let configs: any[] = [];
    let timeEntries: any[] = [];
    let invoices: any[] = [];
    let locations: any[] = [];
    let expenseReports: any[] = [];
    let companyExpenses: any[] = [];
    let timeOffRequests: any[] = [];
    let ptoUsage: any[] = [];
    let w2Forms: any[] = [];
    let schedules: any[] = [];

    if (payrollOnly || fullAccounting) {
      configs = await load('payroll configuration', () => base44.asServiceRole.entities.PayrollConfig.list('config_name', 50));
      timeEntries = await load('time entries', () => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000));
    }
    if (overviewOnly || fullAccounting) {
      expenseReports = await load('expense reimbursements', () => base44.asServiceRole.entities.ExpenseReport.list('-created_date', 2000));
    }
    if (fullAccounting) {
      invoices = await load('client invoices', () => base44.asServiceRole.entities.Invoice.list('-created_date', 2000));
      locations = await load('locations', () => base44.asServiceRole.entities.Location.list('site_name', 1000));
      companyExpenses = await load('company expenses', () => base44.asServiceRole.entities.CompanyExpense.list('-expense_date', 2000));
      timeOffRequests = await load('time-off requests', () => base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 2000));
      ptoUsage = await load('PTO usage', () => base44.asServiceRole.entities.PTOUsage.list('-usage_date', 5000));
      w2Forms = await load('W-2 forms', () => base44.asServiceRole.entities.W2Form.list('-tax_year', 2000));
      schedules = await load('schedules', () => base44.asServiceRole.entities.Schedule.list('-shift_date', 5000));
    }

    const clients = (users || []).filter((u: any) => {
      const r = new Set((u.additional_roles || []).map((x: string) => String(x).toLowerCase()));
      return !u.termination_date && (r.has('client') || String(u.rank || '').toLowerCase() === 'client' || String(u.user_type || '').toLowerCase() === 'client');
    });

    return Response.json({
      success: true,
      scope,
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
