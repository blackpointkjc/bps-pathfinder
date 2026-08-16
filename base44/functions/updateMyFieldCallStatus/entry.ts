import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (!roles.has('officer') && user.role !== 'admin') return Response.json({ error: 'Officer access required' }, { status: 403 });

    const { call_id, status } = await req.json().catch(() => ({}));
    const allowedStatuses = new Set(['Enroute', 'On Scene', 'Cleared']);
    if (!call_id || !allowedStatuses.has(status)) return Response.json({ error: 'Valid call and status are required' }, { status: 400 });
    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    if (!assigned.includes(user.id) && user.role !== 'admin') {
      return Response.json({ error: 'You must be assigned to this call before changing its status' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status };
    if (status === 'Enroute' && !call.time_enroute) update.time_enroute = now;
    if (status === 'On Scene' && !call.time_on_scene) update.time_on_scene = now;
    if (status === 'Cleared') {
      update.time_cleared = now;
      update.manual_dismissed = true;
      update.manual_dismissed_at = now;
    }
    await base44.asServiceRole.entities.DispatchCall.update(call_id, update);

    const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id: user.id }).catch(() => []);
    const assignmentStatus = status === 'Enroute' ? 'enroute' : status === 'On Scene' ? 'on_scene' : 'cleared';
    for (const assignment of assignments || []) {
      const patch: Record<string, unknown> = { status: assignmentStatus };
      if (status === 'Cleared') patch.cleared_at = now;
      await base44.asServiceRole.entities.CallAssignment.update(assignment.id, patch).catch(() => null);
    }

    return Response.json({ success: true, status });
  } catch (error) {
    console.error('updateMyFieldCallStatus failed', error);
    return Response.json({ error: error?.message || 'Unable to update call status' }, { status: 500 });
  }
});