import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (String(user.id) !== '6a72bbee2842d6338cbae513') {
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
