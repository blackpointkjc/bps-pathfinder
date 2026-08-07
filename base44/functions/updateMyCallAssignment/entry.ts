import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (!roles.has('officer') || !roles.has('cad_access')) return Response.json({ error: 'CAD officer access required' }, { status: 403 });

    const { call_id, action } = await req.json();
    if (!call_id || !['join','leave'].includes(action)) return Response.json({ error: 'call_id and valid action are required' }, { status: 400 });
    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];

    if (action === 'join') {
      if (!assigned.includes(user.id)) {
        const activeAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id });
        await base44.asServiceRole.entities.CallAssignment.create({
          call_id,
          unit_id: user.id,
          role: activeAssignments?.some((a: any) => a.status !== 'cleared') ? 'backup' : 'primary',
          assigned_at: new Date().toISOString(),
          status: 'accepted'
        });
        await base44.asServiceRole.entities.DispatchCall.update(call_id, {
          assigned_units: [...assigned, user.id],
          status: call.status === 'New' ? 'Dispatched' : call.status,
          time_dispatched: call.time_dispatched || new Date().toISOString()
        });
      }
    } else {
      await base44.asServiceRole.entities.DispatchCall.update(call_id, { assigned_units: assigned.filter((id: string) => id !== user.id) });
      const records = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id: user.id });
      for (const record of records || []) {
        if (record.status !== 'cleared') await base44.asServiceRole.entities.CallAssignment.update(record.id, { status: 'cleared', cleared_at: new Date().toISOString() });
      }
    }

    return Response.json({ success: true, action });
  } catch (error) {
    console.error('updateMyCallAssignment failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
