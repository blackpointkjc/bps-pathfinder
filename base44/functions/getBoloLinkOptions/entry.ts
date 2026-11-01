import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if (!__portalCaller || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = me.role === 'admin' || ['dispatch','dispatcher'].includes(me.role) || Boolean(me.dispatch_role) || roles.has('dispatch') || roles.has('dispatcher') || roles.has('officer') || roles.has('supervisor') || roles.has('full_access') || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // These are only picker options inside the BOLO editor. Pulling 600 full
    // records made NEW/EDIT BOLO look frozen even though the form itself was ready.
    const [calls, reports] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.list('-created_date', 75),
      base44.asServiceRole.entities.IncidentReport.list('-created_date', 75),
    ]);
    return Response.json({ calls: calls || [], reports: reports || [] });
  } catch (error:any) {
    console.error('getBoloLinkOptions failed', error);
    return Response.json({ error: error?.message || 'Unable to load CAD/report links' }, { status: 500 });
  }
});
