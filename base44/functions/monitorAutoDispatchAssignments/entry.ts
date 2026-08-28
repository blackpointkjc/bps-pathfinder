import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const activeAssignment = (status: unknown) => !['cleared', 'cancelled'].includes(lower(status));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map(lower));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role)
      || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access');
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const now = Date.now();
    // Escalation monitoring is operationally important and should not create a
    // seven-read burst that competes with CAD/GPS traffic. Read sequentially.
    const evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ mode: 'live' }, '-evaluated_at', 1000);
    const alerts = await base44.asServiceRole.entities.PropertyAlert.list('-created_date', 2000);
    const assignments = await base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 3000);
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 3000);
    const locations = await base44.asServiceRole.entities.Location.list('-updated_date', 1000);
    const users = await base44.asServiceRole.entities.User.list('-updated_date', 1000);
    const notifications = await base44.asServiceRole.entities.Notification.list('-created_date', 5000);
    const alertById = new Map((alerts || []).map((item: any) => [String(item.id), item]));
    const callById = new Map((calls || []).map((item: any) => [String(item.id), item]));
    const locationById = new Map((locations || []).map((item: any) => [String(item.id), item]));
    const userById = new Map((users || []).map((item: any) => [String(item.id), item]));
    const activeCallIds = new Set((calls || []).filter((item: any) => !['cleared', 'cancelled', 'closed'].includes(lower(item.status))).map((item: any) => String(item.id)));
    const supervisors = (users || []).filter((item: any) => {
      const itemRoles = new Set((item.additional_roles || []).map(lower));
      return item.email && (item.role === 'admin' || itemRoles.has('supervisor') || itemRoles.has('full_access'));
    });

    let acknowledgementEscalations = 0;
    let responseEscalations = 0;
    const operationalEvaluations = (evaluations || []).filter((item: any) =>
      ['assigned', 'partially_assigned'].includes(lower(item.decision))
    );
    for (const evaluation of operationalEvaluations) {
      const callId = String(evaluation.call_id || '');
      if (!activeCallIds.has(callId)) continue;
      const alert = alertById.get(String(evaluation.property_alert_id || ''));
      const call = callById.get(callId);
      const property = locationById.get(String(evaluation.property_id || alert?.propertyId || ''));
      if (!alert || !call || !property) continue;
      const ackSeconds = Math.max(30, Number(property.auto_dispatch_acknowledgement_seconds || 120));
      const responseSeconds = Math.max(ackSeconds, Number(property.auto_dispatch_escalation_seconds || 300));
      const linkedAssignments = (assignments || []).filter((item: any) => item.call_id === callId && activeAssignment(item.status));
      const pending = linkedAssignments.filter((item: any) => {
        if (item.accepted_at || lower(item.status) !== 'pending') return false;
        const assignedAt = new Date(item.assigned_at || item.created_date || 0).getTime();
        return Number.isFinite(assignedAt) && now - assignedAt >= ackSeconds * 1000;
      });
      const acceptedNotResponding = linkedAssignments.filter((item: any) => {
        if (!item.accepted_at || !['accepted', 'pending'].includes(lower(item.status))) return false;
        const acceptedAt = new Date(item.accepted_at).getTime();
        return Number.isFinite(acceptedAt) && now - acceptedAt >= responseSeconds * 1000;
      });
      const cad = call.agency_cad_number || call.bps_reference || call.call_id || call.id;

      const emit = async (kind: string, affected: any[], message: string) => {
        const affectedUnitKey = affected.map((item: any) => String(item.unit_id)).sort().join('-') || 'unknown';
        const eventKey = `autodispatch:${alert.id}:escalation:${kind}:${affectedUnitKey}`;
        const existingLogs = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key: eventKey }, '-created_date', 1).catch(() => []);
        if (existingLogs?.length) return false;
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: callId,
          incident_type: call.incident || 'Property alert',
          location: call.location || property.address || '',
          old_status: call.status || 'Dispatched',
          new_status: call.status || 'Dispatched',
          notes: message,
          event_key: eventKey,
          event_type: kind === 'acknowledgement' ? 'welfare_overdue' : 'backup_requested',
          announcement_text: message,
          announcement_priority: 'critical',
          cad_number: String(cad),
          triggering_action: 'monitorAutoDispatchAssignments',
          audio_enabled: true,
          sensitive: false,
        });
        for (const recipient of supervisors) {
          const title = kind === 'acknowledgement' ? `Automatic dispatch not acknowledged · ${cad}` : `Automatic dispatch response overdue · ${cad}`;
          const exists = (notifications || []).some((item: any) => lower(item.recipient_email) === lower(recipient.email) && item.related_id === callId && item.title === title);
          if (!exists) await base44.asServiceRole.entities.Notification.create({
            recipient_email: lower(recipient.email),
            type: 'system_issue',
            title,
            message,
            is_read: false,
            related_id: callId,
            priority: 'critical',
            requires_acknowledgment: true,
            source_name: 'Automatic Property Dispatch',
          });
        }
        await base44.asServiceRole.entities.AuditLog.create({
          entity_type: 'CallAssignment',
          entity_id: affected.map((item: any) => item.id).join(',').slice(0, 500),
          action: 'status_change',
          actor_id: user.id,
          actor_name: 'Automatic Property Dispatch Monitor',
          before_value: JSON.stringify(affected.map((item: any) => ({ id: item.id, status: item.status }))),
          after_value: JSON.stringify({ escalation: kind, event_key: eventKey }),
          field_changed: kind,
          timestamp: new Date().toISOString(),
          description: message,
        }).catch(() => null);
        return true;
      };

      if (pending.length) {
        const unitLabels = pending.map((item: any) => userById.get(String(item.unit_id))?.unit_number || item.unit_id).join(', ');
        if (await emit('acknowledgement', pending, `Automatic dispatch acknowledgement overdue. Unit ${unitLabels}. CAD number ${cad}.`)) acknowledgementEscalations += 1;
      }
      if (acceptedNotResponding.length) {
        const unitLabels = acceptedNotResponding.map((item: any) => userById.get(String(item.unit_id))?.unit_number || item.unit_id).join(', ');
        if (await emit('response', acceptedNotResponding, `Automatic dispatch response overdue. Unit ${unitLabels}. CAD number ${cad}.`)) responseEscalations += 1;
      }
    }
    return Response.json({ success: true, acknowledgement_escalations: acknowledgementEscalations, response_escalations: responseEscalations });
  } catch (error) {
    console.error('monitorAutoDispatchAssignments failed', error);
    return Response.json({ error: error?.message || 'Unable to monitor automatic dispatch assignments' }, { status: 500 });
  }
});
