import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('accounting') && !roles.has('full_access') && !roles.has('hr')) {
      return Response.json({ error: 'Payroll access required' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const start = String(body.start_date || '');
    const end = String(body.end_date || '');
    const officer = String(body.officer_email || '').toLowerCase();
    const rows = await base44.asServiceRole.entities.PTOUsage.list('-usage_date', 5000);
    const usage = (rows || []).filter((row: any) =>
      row.status === 'active' &&
      (!start || row.usage_date >= start) &&
      (!end || row.usage_date <= end) &&
      (!officer || officer === 'all' || String(row.officer_email || '').toLowerCase() === officer)
    );
    return Response.json({ success: true, usage });
  } catch (error) {
    console.error('getPayrollPTOUsage failed', error);
    return Response.json({ error: error?.message || 'Unable to load payroll PTO' }, { status: 500 });
  }
});