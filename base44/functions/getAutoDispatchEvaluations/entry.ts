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
    let [evaluations, propertyAlerts, activeCalls, locations] = await Promise.all([
      base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 200),
      base44.asServiceRole.entities.PropertyAlert.list('-created_date', 1000),
      base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000),
      base44.asServiceRole.entities.Location.list('site_name', 1000),
    ]);
    const activeCallIds = new Set((activeCalls || []).map((item: any) => String(item.id)));
    const propertyById = new Map((locations || []).map((item: any) => [String(item.id), item]));
    const latestByAlert = new Map<string, any>();
    for (const evaluation of evaluations || []) {
      const alertId = String(evaluation.property_alert_id || '');
      if (alertId && !latestByAlert.has(alertId)) latestByAlert.set(alertId, evaluation);
    }

    // Self-heal a missed creation trigger while the dispatch feed is open. This is
    // the same idempotent evaluator used by ingestion and manual call creation;
    // it only runs for unresolved alerts tied to a currently active CAD call.
    const now = Date.now();
    const dueAlerts = (propertyAlerts || []).filter((alert: any) => {
      const lifecycle = lower(alert.lifecycle_status || 'active');
      if (!activeCallIds.has(String(alert.callId)) || ['resolved', 'false_alarm', 'test'].includes(lifecycle)) return false;
      const property: any = propertyById.get(String(alert.propertyId));
      if (!property || property.auto_dispatch_enabled !== true || property.auto_dispatch_mode !== 'live') return false;
      if (!property.auto_dispatch_live_approved_at || !property.auto_dispatch_live_approved_by) return false;
      const latest = latestByAlert.get(String(alert.id));
      if (latest?.mode === 'live' && latest?.decision === 'assigned') return false;
      const lastAt = new Date(latest?.evaluated_at || latest?.updated_date || 0).getTime();
      const intervalMs = Math.max(30, Number(property.auto_dispatch_recheck_seconds || 60)) * 1000;
      return !Number.isFinite(lastAt) || now - lastAt >= intervalMs;
    }).slice(0, 20);

    if (dueAlerts.length) {
      await Promise.all(dueAlerts.map((alert: any) =>
        base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', {
          call_id: alert.callId,
          property_alert_id: alert.id,
        }).catch((error: any) => {
          console.error('Automatic property-dispatch feed recovery failed', {
            call_id: alert.callId,
            property_alert_id: alert.id,
            error: error?.message || String(error),
          });
          return null;
        })
      ));
      evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.list('-evaluated_at', 200);
    }

    const verifiedAlertIds = new Set((propertyAlerts || []).map((item: any) => String(item.id)));
    const propertyModeById = new Map((locations || []).map((item: any) => [String(item.id), item.auto_dispatch_enabled === true ? String(item.auto_dispatch_mode || 'shadow') : 'disabled']));
    const linked = (evaluations || []).filter((item: any) => verifiedAlertIds.has(String(item.property_alert_id)));
    const operational = linked.filter((item: any) => activeCallIds.has(String(item.call_id))
      && item.configuration_snapshot?.simulation !== true
      && !String(item.event_key || '').endsWith(':simulation')
      && String(item.mode) === String(propertyModeById.get(String(item.property_id)) || item.mode));
    const safetyTests = linked.filter((item: any) => item.configuration_snapshot?.simulation === true || String(item.event_key || '').endsWith(':simulation'));
    return Response.json({ success: true, evaluations: operational, latest_safety_test: safetyTests[0] || null });
  } catch (error) {
    console.error('getAutoDispatchEvaluations failed', error);
    return Response.json({ error: error?.message || 'Unable to load automatic-dispatch evaluations' }, { status: 500 });
  }
});
