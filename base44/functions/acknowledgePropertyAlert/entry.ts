import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access') || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'Property alert access required' }, { status: 403 });

    const { alert_id } = await req.json().catch(() => ({}));
    if (!alert_id) return Response.json({ error: 'alert_id is required' }, { status: 400 });
    const alert = await base44.asServiceRole.entities.PropertyAlert.get(alert_id);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });

    const updated = await base44.asServiceRole.entities.PropertyAlert.update(alert_id, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    });
    return Response.json({ success: true, alert: updated });
  } catch (error) {
    console.error('acknowledgePropertyAlert failed', error);
    return Response.json({ error: error?.message || 'Unable to acknowledge property alert' }, { status: 500 });
  }
});