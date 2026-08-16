import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || Boolean(user.dispatch_role) || user.role === 'dispatch';
    if (!allowed) return Response.json({ error: 'Dispatch or supervisor access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const callId = String(body.call_id || '');
    const newStatus = String(body.status || '');
    const allowedStatuses = new Set(['New','Dispatched','Enroute','On Scene','Cleared','Cancelled']);
    if (!callId || !allowedStatuses.has(newStatus)) return Response.json({ error: 'Valid call and status are required' }, { status: 400 });

    const call = await base44.asServiceRole.entities.DispatchCall.get(callId);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    const now = new Date().toISOString();
    const timeField: Record<string,string> = {
      Dispatched: 'time_dispatched',
      Enroute: 'time_enroute',
      'On Scene': 'time_on_scene',
      Cleared: 'time_cleared',
      Cancelled: 'time_closed',
    };
    const update: Record<string,unknown> = { status: newStatus };
    if (timeField[newStatus]) update[timeField[newStatus]] = now;
    if (newStatus === 'Cleared') {
      update.manual_dismissed = true;
      update.manual_dismissed_at = now;
    }
    await base44.asServiceRole.entities.DispatchCall.update(callId, update);

    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id: callId,
      incident_type: call.incident || '',
      location: call.location || '',
      old_status: call.status || '',
      new_status: newStatus,
      unit_name: user.unit_number || user.full_name || [user.rank, user.last_name].filter(Boolean).join(' ') || user.email || 'Dispatch',
      notes: `Status changed by ${user.email || 'authorized dispatcher'}`,
      latitude: call.latitude,
      longitude: call.longitude,
    }).catch(() => null);

    return Response.json({ success: true, status: newStatus, updated_at: now });
  } catch (error) {
    console.error('updateCadCallStatus failed', error);
    return Response.json({ error: error?.message || 'Unable to update call status' }, { status: 500 });
  }
});
