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
    const payrollOnly = input?.scope === 'payroll';

    // Payroll should not load every accounting dataset. The old 13-way Promise.all
    // created a large request burst and could turn a healthy payroll page into a 500.
    // Read the small payroll dataset sequentially; load the wider accounting center
    // datasets only when another accounting page explicitly needs them.
    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const periods = await base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 500);
    const configs = await base44.asServiceRole.entities.PayrollConfig.list(undefined, 50);
    const payrollEntries = await base44.asServiceRole.entities.PayrollEntry.list('-created_date', 2000);
    const timeEntries = await base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000);

    let invoices: any[] = [];
    let locations: any[] = [];
    let expenseReports: any[] = [];
    let companyExpenses: any[] = [];
    let timeOffRequests: any[] = [];
    let ptoUsage: any[] = [];
    let w2Forms: any[] = [];
    let schedules: any[] = [];
    if (!payrollOnly) {
      invoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 2000);
      locations = await base44.asServiceRole.entities.Location.list('site_name', 1000);
      expenseReports = await base44.asServiceRole.entities.ExpenseReport.list('-created_date', 2000);
      companyExpenses = await base44.asServiceRole.entities.CompanyExpense.list('-expense_date', 2000);
      timeOffRequests = await base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 2000);
      ptoUsage = await base44.asServiceRole.entities.PTOUsage.list('-usage_date', 5000);
      w2Forms = await base44.asServiceRole.entities.W2Form.list('-tax_year', 2000);
      schedules = await base44.asServiceRole.entities.Schedule.list('-shift_date', 5000);
    }

    const clients = (users || []).filter((u: any) => {
      const r = new Set((u.additional_roles || []).map((x: string) => String(x).toLowerCase()));
      return !u.termination_date && (r.has('client') || String(u.rank || '').toLowerCase() === 'client' || String(u.user_type || '').toLowerCase() === 'client');
    });

    return Response.json({
      users: users || [], clients, timeEntries: timeEntries || [], payrollEntries: payrollEntries || [],
      config: configs?.[0] || null, payrollPeriods: periods || [], invoices: invoices || [],
      locations: locations || [], expenseReports: expenseReports || [], companyExpenses: companyExpenses || [],
      timeOffRequests: timeOffRequests || [], ptoUsage: ptoUsage || [], w2Forms: w2Forms || [], schedules: schedules || [],
    });
  } catch (error) {
    console.error('getAccountingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load accounting data' }, { status: 500 });
  }
});
