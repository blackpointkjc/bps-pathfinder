import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('dispatch') || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });
    const [evaluations, propertyAlerts] = await Promise.all([
      base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 50),
      base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000),
    ]);
    const verifiedAlertIds = new Set((propertyAlerts || []).map((item: any) => String(item.id)));
    const linked = (evaluations || []).filter((item: any) => verifiedAlertIds.has(String(item.property_alert_id)));
    const operational = linked.filter((item: any) => item.configuration_snapshot?.simulation !== true && !String(item.event_key || '').endsWith(':simulation'));
    const safetyTests = linked.filter((item: any) => item.configuration_snapshot?.simulation === true || String(item.event_key || '').endsWith(':simulation'));
    return Response.json({ success: true, evaluations: operational, latest_safety_test: safetyTests[0] || null });
  } catch (error) {
    console.error('getAutoDispatchEvaluations failed', error);
    return Response.json({ error: error?.message || 'Unable to load automatic-dispatch evaluations' }, { status: 500 });
  }
});
