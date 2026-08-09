import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access') || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'CAD assignment access required' }, { status: 403 });

    const { action, call_id, unit_id } = await req.json().catch(() => ({}));
    if (!call_id || !unit_id || !['assign', 'unassign'].includes(action)) {
      return Response.json({ error: 'call_id, unit_id, and valid action are required' }, { status: 400 });
    }
    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];

    if (action === 'assign') {
      if (!assigned.includes(unit_id)) {
        const activeAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id });
        await base44.asServiceRole.entities.CallAssignment.create({
          call_id,
          unit_id,
          role: (activeAssignments || []).some((a: any) => a.status !== 'cleared') ? 'backup' : 'primary',
          assigned_at: new Date().toISOString(),
          status: 'pending'
        });
        await base44.asServiceRole.entities.DispatchCall.update(call_id, {
          assigned_units: [...assigned, unit_id],
          status: call.status === 'New' ? 'Dispatched' : call.status,
          time_dispatched: call.time_dispatched || new Date().toISOString(),
        });
      }
    } else {
      await base44.asServiceRole.entities.DispatchCall.update(call_id, { assigned_units: assigned.filter((id: string) => id !== unit_id) });
      const records = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id });
      for (const record of records || []) {
        if (record.status !== 'cleared') await base44.asServiceRole.entities.CallAssignment.update(record.id, { status: 'cleared', cleared_at: new Date().toISOString() });
      }
    }

    return Response.json({ success: true, action });
  } catch (error) {
    console.error('manageCadUnitAssignment failed', error);
    return Response.json({ error: error?.message || 'Unable to update unit assignment' }, { status: 500 });
  }
});