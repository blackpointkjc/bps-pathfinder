import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending') || ['client','student','pending'].includes(String(user.user_type || '').toLowerCase());
    if (blocked) return Response.json({ error: 'Officer access required' }, { status: 403 });

    const { call_id, status, disposition = '' } = await req.json().catch(() => ({}));
    const allowedStatuses = new Set(['Acknowledged', 'Enroute', 'On Scene', 'Cleared']);
    if (!call_id || !allowedStatuses.has(status)) return Response.json({ error: 'Valid call and status are required' }, { status: 400 });
    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    // Never short-circuit a clear request. Even if the CAD call was already marked
    // Cleared by another unit/dispatcher, this officer's assignment and assigned_units
    // membership still must be closed so the call cannot return to their queue.
    if (!['Acknowledged','Cleared'].includes(status) && call.status === status) return Response.json({ success: true, status, duplicate_transition: true });

    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    if (!assigned.includes(user.id) && user.role !== 'admin') {
      return Response.json({ error: 'You must be assigned to this call before changing its status' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id: user.id }).catch(() => []);
    const assignmentStatus = status === 'Acknowledged' ? 'accepted' : status === 'Enroute' ? 'enroute' : status === 'On Scene' ? 'on_scene' : 'cleared';
    for (const assignment of assignments || []) {
      const patch: Record<string, unknown> = { status: assignmentStatus };
      if (status === 'Acknowledged' && !assignment.accepted_at) patch.accepted_at = now;
      if (status === 'Cleared') patch.cleared_at = now;
      if (status === 'Cleared' && disposition) patch.description = `${assignment.description || ''} Disposition: ${String(disposition).trim()}`.trim().slice(0, 1000);
      await base44.asServiceRole.entities.CallAssignment.update(assignment.id, patch);
    }

    // Acknowledgement is assignment-level only. En route/on-scene update the call,
    // while clearing one officer does not close the CAD call until all assigned
    // units have cleared.
    if (status !== 'Acknowledged') {
      const update: Record<string, unknown> = { status };
      if (status === 'Enroute' && !call.time_enroute) update.time_enroute = now;
      if (status === 'On Scene' && !call.time_on_scene) update.time_on_scene = now;
      if (status === 'Cleared') {
        const allAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id }).catch(() => []);
        const otherActive = (allAssignments || []).some((a: any) => String(a.unit_id) !== String(user.id) && !['cleared','cancelled'].includes(String(a.status || '').toLowerCase()));
        if (otherActive) {
          delete update.status;
        } else {
          update.time_cleared = now;
          update.manual_dismissed = true;
          update.manual_dismissed_at = now;
          if (disposition) update.disposition = String(disposition).trim().slice(0, 1000);
        }
      }
      if (status === 'Cleared') {
        update.assigned_units = assigned.filter((id: any) => String(id) !== String(user.id));
      }
      if (Object.keys(update).length) await base44.asServiceRole.entities.DispatchCall.update(call_id, update);
    }

    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const officer = user.unit_number ? `Unit ${user.unit_number}` : ([user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || 'Officer');
    const eventType = status === 'Acknowledged' ? 'unit_acknowledged' : status === 'Enroute' ? 'unit_enroute' : status === 'On Scene' ? 'unit_on_scene' : 'call_cleared';
    const wording = status === 'Acknowledged'
      ? `${officer} acknowledged the assignment. CAD number ${cadNumber}.`
      : status === 'Enroute'
        ? `${officer} en route. CAD number ${cadNumber}.`
        : status === 'On Scene'
          ? `${officer} on scene. CAD number ${cadNumber}.`
          : `${officer} cleared from the call. CAD number ${cadNumber}.`;
    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id,
      incident_type: call.incident || '',
      location: call.location || '',
      old_status: call.status || '',
      new_status: status,
      unit_id: user.id,
      unit_name: officer,
      notes: 'Verified officer field status transition',
      latitude: call.latitude,
      longitude: call.longitude,
      event_key: `call:${call_id}:unit:${user.id}:status:${status}:${now}`,
      event_type: eventType,
      announcement_text: wording,
      announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
      cad_number: String(cadNumber),
      triggering_action: 'updateMyFieldCallStatus',
      audio_enabled: true,
      sensitive: false,
    });

    if (status === 'Cleared') {
      // Move the officer directly to the next active queued assignment instead of
      // briefly marking them Available when another dispatched call is waiting.
      const remainingAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ unit_id: user.id }, '-assigned_at', 500).catch(() => []);
      const activeRemaining = (remainingAssignments || []).filter((a: any) => String(a.call_id) !== String(call_id) && !['cleared','cancelled'].includes(String(a.status || '').toLowerCase()));
      const priorityWeight: Record<string, number> = { critical:0, high:1, medium:2, low:3 };
      const candidates: any[] = [];
      for (const assignment of activeRemaining) {
        const queuedCall = await base44.asServiceRole.entities.DispatchCall.get(assignment.call_id).catch(() => null);
        if (!queuedCall || ['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(queuedCall.status || '').toLowerCase())) continue;
        candidates.push({ assignment, call:queuedCall });
      }
      candidates.sort((a,b) => {
        const p = (priorityWeight[String(a.call.priority || '').toLowerCase()] ?? 2) - (priorityWeight[String(b.call.priority || '').toLowerCase()] ?? 2);
        if (p) return p;
        return new Date(a.assignment.assigned_at || a.call.time_received || a.call.created_date || 0).getTime() - new Date(b.assignment.assigned_at || b.call.time_received || b.call.created_date || 0).getTime();
      });
      const next = candidates[0];
      const nextCad = next ? (next.call.agency_cad_number || next.call.bps_reference || next.call.call_id || next.call.id) : '';
      const nextStatus = next ? 'Dispatched' : 'Available';
      const nextInfo = next ? `${next.call.incident || 'Call for service'} · ${next.call.location || ''}`.slice(0, 500) : '';
      await base44.asServiceRole.entities.User.update(user.id, { status: nextStatus, current_call_id: next?.call?.id || '', current_call_info: nextInfo, status_since: now, last_updated: now }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) if (session.session_active !== false) await base44.asServiceRole.entities.ActiveOfficer.update(session.id, { status: nextStatus, current_call_info: nextInfo, last_update: now }).catch(() => null);
      if (next) {
        await base44.asServiceRole.entities.CallNote.create({ call_id:next.call.id, author_id:user.id, author_name:officer, note:`[QUEUE] Previous call cleared. This is now the officer's next active call (${nextCad}).`, note_type:'update' }).catch(()=>null);
      }
      return Response.json({ success:true, status, next_call_id:next?.call?.id || '', next_call_number:nextCad || '' });
    }

    return Response.json({ success: true, status });
  } catch (error) {
    console.error('updateMyFieldCallStatus failed', error);
    return Response.json({ error: error?.message || 'Unable to update call status' }, { status: 500 });
  }
});