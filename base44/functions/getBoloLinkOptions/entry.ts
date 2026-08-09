import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = me.role === 'admin' || me.role === 'dispatch' || roles.has('officer') || roles.has('supervisor') || roles.has('full_access') || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [calls, reports] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.list('-created_date', 300),
      base44.asServiceRole.entities.IncidentReport.list('-created_date', 300),
    ]);
    return Response.json({ calls: calls || [], reports: reports || [] });
  } catch (error) {
    console.error('getBoloLinkOptions failed', error);
    return Response.json({ error: error?.message || 'Unable to load CAD/report links' }, { status: 500 });
  }
});
