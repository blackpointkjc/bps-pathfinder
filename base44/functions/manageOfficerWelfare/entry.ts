import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
const displayName = (u: any) => {
  const rank = String(u?.rank || '').trim();
  const last = String(u?.last_name || '').trim() || String(u?.full_name || '').trim().split(/\s+/).pop() || '';
  return [rank, last].filter(Boolean).join(' ') || 'Officer';
};
const commandAccess = (u: any) => {
  const roles = new Set((u?.additional_roles || []).map(lower));
  const rank = lower(u?.rank);
  return u?.role === 'admin' || u?.role === 'dispatch' || Boolean(u?.dispatch_role) || roles.has('dispatch') || roles.has('cad_access') || roles.has('full_access') || roles.has('supervisor') || ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'request');
    const now = new Date().toISOString();

    if (action === 'request') {
      if (!commandAccess(me)) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });
      const callId = String(body.call_id || '').trim();
      if (!callId) return Response.json({ error: 'call_id is required' }, { status: 400 });
      const call = await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
      if (!call || ['cleared','cancelled','closed','resolved','completed'].includes(lower(call.status))) return Response.json({ error: 'Active CAD call not found' }, { status: 404 });
      const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: callId }, '-assigned_at', 50).catch(() => []);
      const active = (assignments || []).filter((a: any) => !['cleared','cancelled'].includes(lower(a.status)));
      const requestedUnitId = String(body.unit_id || '').trim();
      const targets = requestedUnitId ? active.filter((a: any) => String(a.unit_id) === requestedUnitId) : active;
      if (!targets.length) return Response.json({ error: 'No active assigned officer is available for a welfare check' }, { status: 400 });
      const users = await base44.asServiceRole.entities.User.list('-updated_date', 1500);
      const userById = new Map((users || []).map((u: any) => [String(u.id), u]));
      const cad = String(call.agency_cad_number || call.bps_reference || call.call_id || call.id);
      const created: any[] = [];

      for (const assignment of targets) {
        const officer: any = userById.get(String(assignment.unit_id));
        if (!officer?.email) continue;
        const open = await base44.asServiceRole.entities.OfficerWelfareCheck.filter({ call_id: callId, unit_id: String(officer.id), status: 'pending' }, '-requested_at', 1).catch(() => []);
        if (open?.length) { created.push(open[0]); continue; }
        const eventKey = `welfare:${callId}:${officer.id}:${Date.now()}`;
        const name = displayName(officer);
        const check = await base44.asServiceRole.entities.OfficerWelfareCheck.create({
          call_id: callId,
          assignment_id: assignment.id,
          unit_id: String(officer.id),
          officer_email: lower(officer.email),
          officer_display_name: name,
          cad_number: cad,
          requested_at: now,
          requested_by: String(me.id || ''),
          requested_by_name: displayName(me),
          status: 'pending',
          event_key: eventKey,
        });
        created.push(check);
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: lower(officer.email),
          type: 'call_assignment',
          title: `Welfare Check · CAD ${cad}`,
          message: `Dispatch is requesting a welfare check from ${name}. Respond WELFARE OK or NEED ASSISTANCE in your Dispatch Queue.`,
          is_read: false,
          related_id: check.id,
          priority: 'critical',
          requires_acknowledgment: true,
          source_name: 'CAD Welfare',
        }).catch(() => null);
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: callId,
          incident_type: call.incident || '',
          location: call.location || '',
          old_status: call.status || '',
          new_status: call.status || 'Active',
          unit_id: String(officer.id),
          unit_name: name,
          notes: `WELFARE CHECK REQUESTED for ${name} by ${displayName(me)}.`,
          event_key: eventKey,
          event_type: 'welfare_overdue',
          announcement_text: `Welfare check requested for ${name}. CAD ${cad}.`,
          announcement_priority: 'high',
          cad_number: cad,
          triggering_action: 'manageOfficerWelfare.request',
          audio_enabled: true,
          sensitive: false,
        }).catch(() => null);
      }
      return Response.json({ success: true, checks: created });
    }

    const checkId = String(body.check_id || '').trim();
    if (!checkId) return Response.json({ error: 'check_id is required' }, { status: 400 });
    const check = await base44.asServiceRole.entities.OfficerWelfareCheck.get(checkId).catch(() => null);
    if (!check) return Response.json({ error: 'Welfare check not found' }, { status: 404 });
    const isOfficer = lower(me.email) === lower(check.officer_email) || String(me.id) === String(check.unit_id);
    if (!isOfficer && !commandAccess(me)) return Response.json({ error: 'Not authorized for this welfare check' }, { status: 403 });
    if (lower(check.status) !== 'pending' && action !== 'escalate') return Response.json({ success: true, check, duplicate: true });
    const call = await base44.asServiceRole.entities.DispatchCall.get(check.call_id).catch(() => null);
    const cad = String(check.cad_number || call?.agency_cad_number || call?.bps_reference || call?.call_id || check.call_id);

    if (action === 'ok') {
      if (!isOfficer && !commandAccess(me)) return Response.json({ error: 'Not authorized' }, { status: 403 });
      const updated = await base44.asServiceRole.entities.OfficerWelfareCheck.update(checkId, { status: 'ok', response_at: now, response_by: String(me.id || ''), response_note: String(body.note || 'Welfare OK').slice(0,1000) });
      await base44.asServiceRole.entities.CallStatusLog.create({ call_id: check.call_id, incident_type: call?.incident || '', location: call?.location || '', old_status: call?.status || '', new_status: call?.status || 'Active', unit_id: check.unit_id, unit_name: check.officer_display_name || 'Officer', notes: `WELFARE OK received from ${check.officer_display_name || 'officer'}.`, event_key: `${check.event_key}:ok`, event_type: 'unit_available', announcement_text: `Welfare check clear for ${check.officer_display_name || 'officer'}. CAD ${cad}.`, announcement_priority: 'normal', cad_number: cad, triggering_action: 'manageOfficerWelfare.ok', audio_enabled: true, sensitive: false }).catch(() => null);
      return Response.json({ success: true, check: updated });
    }

    if (action === 'assist' || action === 'unable_to_reach' || action === 'escalate') {
      const status = action === 'unable_to_reach' ? 'unable_to_reach' : 'escalated';
      const updated = await base44.asServiceRole.entities.OfficerWelfareCheck.update(checkId, { status, response_at: isOfficer ? now : check.response_at, response_by: isOfficer ? String(me.id || '') : check.response_by, response_note: String(body.note || (isOfficer ? 'Officer requested assistance' : 'Unable to reach officer')).slice(0,1000), escalated_at: now, escalated_by: String(me.id || '') });
      await base44.asServiceRole.entities.CallStatusLog.create({ call_id: check.call_id, incident_type: call?.incident || '', location: call?.location || '', old_status: call?.status || '', new_status: call?.status || 'Active', unit_id: check.unit_id, unit_name: check.officer_display_name || 'Officer', notes: `WELFARE ESCALATION: ${check.officer_display_name || 'Officer'} — ${String(body.note || (isOfficer ? 'NEED ASSISTANCE response' : 'No welfare response')).slice(0,500)}`, event_key: `${check.event_key}:escalated`, event_type: 'officer_emergency', announcement_text: `Emergency traffic. Welfare assistance required for ${check.officer_display_name || 'officer'}. CAD ${cad}.`, announcement_priority: 'emergency', cad_number: cad, triggering_action: 'manageOfficerWelfare.escalate', audio_enabled: true, sensitive: false }).catch(() => null);
      return Response.json({ success: true, check: updated });
    }

    return Response.json({ error: 'Unsupported welfare action' }, { status: 400 });
  } catch (error) {
    console.error('manageOfficerWelfare failed', error);
    return Response.json({ error: error?.message || 'Unable to manage welfare check' }, { status: 500 });
  }
});