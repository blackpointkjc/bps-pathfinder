import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const { call_id, priority, reason } = await req.json().catch(() => ({}));
    const allowedPriorities = new Set(['low', 'medium', 'high', 'critical']);
    if (!call_id || !allowedPriorities.has(priority)) return Response.json({ error: 'Valid call and priority are required' }, { status: 400 });

    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    if (call.priority === priority) return Response.json({ success: true, priority, duplicate_transition: true });

    const weights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const upgraded = weights[priority] > weights[call.priority || 'medium'];
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.DispatchCall.update(call_id, { priority, priority_override: true });
    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;

    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id,
      incident_type: call.incident || '',
      location: call.location || '',
      old_status: call.status || '',
      new_status: call.status || '',
      unit_name: user.unit_number || user.full_name || user.email || 'Dispatch',
      notes: reason || `Priority changed from ${call.priority || 'medium'} to ${priority}`,
      event_key: `call:${call_id}:priority:${call.priority || 'medium'}:${priority}:${now}`,
      event_type: 'priority_upgraded',
      announcement_text: upgraded ? `Call priority upgraded to ${priority}. CAD number ${cadNumber}.` : '',
      announcement_priority: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'normal',
      cad_number: String(cadNumber),
      triggering_action: 'updateCadCallPriority',
      audio_enabled: upgraded,
      sensitive: false,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DispatchCall',
      entity_id: call_id,
      action: upgraded ? 'priority_upgrade' : 'priority_change',
      actor_id: user.id,
      actor_name: user.full_name || user.email,
      before_value: JSON.stringify({ priority: call.priority }),
      after_value: JSON.stringify({ priority }),
      notes: reason || '',
      timestamp: now,
    }).catch(() => null);

    return Response.json({ success: true, priority, upgraded });
  } catch (error) {
    console.error('updateCadCallPriority failed', error);
    return Response.json({ error: error?.message || 'Unable to update call priority' }, { status: 500 });
  }
});
