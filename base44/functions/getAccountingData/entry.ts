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

    const [users, timeEntries, payrollEntries, configs, periods, invoices, locations, expenseReports, companyExpenses, timeOffRequests, w2Forms] = await Promise.all([
      base44.asServiceRole.entities.User.list(undefined, 1000),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 3000),
      base44.asServiceRole.entities.PayrollEntry.list('-created_date', 2000),
      base44.asServiceRole.entities.PayrollConfig.list(undefined, 50),
      base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 500),
      base44.asServiceRole.entities.Invoice.list('-created_date', 2000),
      base44.asServiceRole.entities.Location.list('site_name', 1000),
      base44.asServiceRole.entities.ExpenseReport.list('-created_date', 2000),
      base44.asServiceRole.entities.CompanyExpense.list('-expense_date', 2000),
      base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 2000),
      base44.asServiceRole.entities.W2Form.list('-tax_year', 2000),
    ]);

    const clients = (users || []).filter((u: any) => {
      const r = new Set((u.additional_roles || []).map((x: string) => String(x).toLowerCase()));
      return !u.termination_date && (r.has('client') || String(u.rank || '').toLowerCase() === 'client' || String(u.user_type || '').toLowerCase() === 'client');
    });

    return Response.json({
      users: users || [], clients, timeEntries: timeEntries || [], payrollEntries: payrollEntries || [],
      config: configs?.[0] || null, payrollPeriods: periods || [], invoices: invoices || [],
      locations: locations || [], expenseReports: expenseReports || [], companyExpenses: companyExpenses || [],
      timeOffRequests: timeOffRequests || [], w2Forms: w2Forms || [],
    });
  } catch (error) {
    console.error('getAccountingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load accounting data' }, { status: 500 });
  }
});
