import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const stable = (rows: any[]) => JSON.stringify((rows || []).map(row => ({
  id: row.id,
  call_id: row.call_id,
  unit_id: row.unit_id,
  status: row.status,
  assigned_at: row.assigned_at,
})).sort((a, b) => String(a.id).localeCompare(String(b.id))));
const unitState = (rows: any[]) => JSON.stringify((rows || []).map(row => ({
  id: row.id,
  officer_email: row.officer_email,
  status: row.status,
  current_call_info: row.current_call_info,
})).sort((a, b) => String(a.id).localeCompare(String(b.id))));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('dispatch') || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const { call_id, property_alert_id } = await req.json().catch(() => ({}));
    if (!call_id || !property_alert_id) return Response.json({ error: 'call_id and property_alert_id are required' }, { status: 400 });

    const [beforeAssignments, beforeUnits] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({ call_id }, '-assigned_at', 100),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
    ]);

    const firstResponse = await base44.functions.invoke('geofenceDispatchAssignment', { call_id, property_alert_id });
    const first = firstResponse?.data || firstResponse || {};
    if (first.error) throw new Error(first.error);
    const secondResponse = await base44.functions.invoke('geofenceDispatchAssignment', { call_id, property_alert_id });
    const second = secondResponse?.data || secondResponse || {};
    if (second.error) throw new Error(second.error);

    const [afterAssignments, afterUnits, evaluations] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({ call_id }, '-assigned_at', 100),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
      base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id, call_id }, '-evaluated_at', 20),
    ]);

    const checks = {
      shadow_mode_enforced: first.shadow_mode === true && second.shadow_mode === true,
      no_assignment_created: stable(beforeAssignments) === stable(afterAssignments) && first.assignment_created === false && second.assignment_created === false,
      no_unit_status_changed: unitState(beforeUnits) === unitState(afterUnits) && first.unit_status_changed === false && second.unit_status_changed === false,
      duplicate_evaluation_prevented: first.evaluation_id && first.evaluation_id === second.evaluation_id && evaluations.length === 1,
      exclusion_reasons_present: Array.isArray(first.excluded_units) && first.excluded_units.every((row: any) => Array.isArray(row.reasons) && row.reasons.length > 0),
      recommendation_has_distance_eta: Array.isArray(first.recommendations) && first.recommendations.every((row: any) => Number.isFinite(Number(row.distance_miles)) && Number.isFinite(Number(row.eta_minutes))),
    };
    const passed = Object.values(checks).every(Boolean);

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'AutoDispatchEvaluation',
      entity_id: first.evaluation_id || property_alert_id,
      action: 'update',
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Dispatcher',
      after_value: JSON.stringify(checks),
      field_changed: 'phase_2a_shadow_safety_test',
      timestamp: new Date().toISOString(),
      description: passed ? 'Phase 2A shadow safety test passed without creating an assignment or changing unit status.' : 'Phase 2A shadow safety test found a failure; live assignment remains locked.',
    }).catch(() => null);

    return Response.json({ success: passed, passed, checks, evaluation: first, tested_at: new Date().toISOString() });
  } catch (error) {
    console.error('testAutoDispatchShadow failed', error);
    return Response.json({ error: error?.response?.data?.error || error?.message || 'Shadow safety test failed' }, { status: 500 });
  }
});
