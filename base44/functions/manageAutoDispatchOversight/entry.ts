import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const action = lower(input.action);
    const alertId = String(input.property_alert_id || '');
    const reason = String(input.reason || '').trim();
    if (!alertId || !['document_override', 'resolve_false_alarm', 'mark_test'].includes(action)) {
      return Response.json({ error: 'property_alert_id and a valid action are required' }, { status: 400 });
    }
    if (!reason || reason.length < 5) return Response.json({ error: 'A documented reason of at least 5 characters is required' }, { status: 400 });

    const alert = await base44.asServiceRole.entities.PropertyAlert.get(alertId).catch(() => null);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });
    const call = alert.callId ? await base44.asServiceRole.entities.DispatchCall.get(alert.callId).catch(() => null) : null;
    const evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id: alertId }, '-evaluated_at', 20).catch(() => []);
    const latest = evaluations?.[0] || null;
    const now = new Date().toISOString();

    if (action === 'document_override') {
      if (!latest) return Response.json({ error: 'No automatic-dispatch evaluation exists for this alert' }, { status: 409 });
      await base44.asServiceRole.entities.AutoDispatchEvaluation.update(latest.id, {
        override_reason: reason,
        description: `${latest.description || ''} Dispatcher override: ${reason}`.trim().slice(0, 2000),
      });
    } else if (action === 'mark_test') {
      const assignments = call ? await base44.asServiceRole.entities.CallAssignment.filter({ call_id: call.id }, '-assigned_at', 100).catch(() => []) : [];
      if ((assignments || []).some((item: any) => !['cleared', 'cancelled'].includes(lower(item.status)))) {
        return Response.json({ error: 'An alert with an active production assignment cannot be converted to a test. Resolve or cancel the assignment first.' }, { status: 409 });
      }
      await base44.asServiceRole.entities.PropertyAlert.update(alertId, {
        acknowledged: true,
        lifecycle_status: 'test',
        is_test: true,
        resolved_at: now,
        resolved_by: user.id,
        resolution_reason: reason,
      });
    } else {
      await base44.asServiceRole.entities.PropertyAlert.update(alertId, {
        acknowledged: true,
        lifecycle_status: 'false_alarm',
        is_test: false,
        resolved_at: now,
        resolved_by: user.id,
        resolution_reason: reason,
      });
      if (call) {
        const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: call.id }, '-assigned_at', 100).catch(() => []);
        for (const assignment of assignments || []) {
          if (!['cleared', 'cancelled'].includes(lower(assignment.status))) {
            await base44.asServiceRole.entities.CallAssignment.update(assignment.id, { status: 'cleared', cleared_at: now, description: `${assignment.description || ''} False alarm resolved: ${reason}`.trim().slice(0, 1000) });
          }
        }
        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
          status: 'Cancelled',
          manual_dismissed: true,
          manual_dismissed_at: now,
          time_closed: now,
          time_cleared: now,
          disposition: `False alarm — ${reason}`.slice(0, 1000),
        });
        const cad = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
        const eventKey = `autodispatch:${alertId}:false-alarm-resolved`;
        const logs = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: eventKey }, '-created_date', 1).catch(() => []);
        if (!logs?.length) await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: call.id,
          incident_type: call.incident || 'Property alert',
          location: call.location || alert.callLocation || '',
          old_status: call.status || '',
          new_status: 'Cancelled',
          notes: `False alarm resolved: ${reason}`,
          event_key: eventKey,
          event_type: 'call_cancelled',
          announcement_text: `Call cancelled. Return 10-8. CAD number ${cad}.`,
          announcement_priority: 'high',
          cad_number: String(cad),
          triggering_action: 'manageAutoDispatchOversight.resolve_false_alarm',
          audio_enabled: true,
          sensitive: false,
        });
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'PropertyAlert',
      entity_id: alertId,
      action: 'update',
      actor_id: user.id,
      actor_name: user.full_name || user.email || 'Authorized dispatcher',
      before_value: JSON.stringify({ acknowledged: alert.acknowledged, lifecycle_status: alert.lifecycle_status, is_test: alert.is_test }),
      after_value: JSON.stringify({ action, reason }),
      field_changed: action,
      timestamp: now,
      description: `Automatic-dispatch oversight action: ${action}. ${reason}`.slice(0, 1000),
    });
    return Response.json({ success: true, action, property_alert_id: alertId });
  } catch (error) {
    console.error('manageAutoDispatchOversight failed', error);
    return Response.json({ error: error?.message || 'Unable to update automatic-dispatch oversight' }, { status: 500 });
  }
});
