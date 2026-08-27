import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const primaryRole = String(user.role || '').toLowerCase();
    const allowed = ['admin', 'dispatch', 'officer', 'supervisor'].includes(primaryRole)
      || roles.has('officer')
      || roles.has('cad_access')
      || roles.has('supervisor')
      || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const { call_id, action } = await req.json();
    if (!call_id || !['join', 'leave'].includes(action)) {
      return Response.json({ error: 'call_id and valid action are required' }, { status: 400 });
    }

    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    const now = new Date().toISOString();

    if (action === 'join') {
      const assignedUnits = assigned.includes(user.id) ? assigned : [...assigned, user.id];
      if (!assigned.includes(user.id)) {
        await Promise.all([
          base44.asServiceRole.entities.DispatchCall.update(call_id, {
            assigned_units: assignedUnits,
            status: call.status === 'New' ? 'Dispatched' : call.status,
            time_dispatched: call.time_dispatched || now,
          }),
          base44.asServiceRole.entities.CallAssignment.create({
            call_id,
            unit_id: user.id,
            role: assigned.length ? 'backup' : 'primary',
            assigned_at: now,
            status: 'accepted',
          }),
        ]);
        const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
        const officer = user.unit_number ? `Unit ${user.unit_number}` : ([user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || 'Officer');
        const isAdditional = assigned.length > 0;
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id,
          incident_type: call.incident || '',
          location: call.location || '',
          old_status: call.status || '',
          new_status: call.status === 'New' ? 'Dispatched' : call.status,
          unit_id: user.id,
          unit_name: officer,
          notes: isAdditional ? 'Officer joined as additional unit' : 'Officer accepted primary assignment',
          event_key: `call:${call_id}:self-assignment:${user.id}:${now}`,
          event_type: isAdditional ? 'additional_unit' : 'unit_dispatched',
          announcement_text: `${isAdditional ? 'Additional unit assigned' : 'Unit dispatched'}. ${officer}. CAD number ${cadNumber}.`,
          announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
          cad_number: String(cadNumber),
          triggering_action: 'updateMyCallAssignment.join',
          audio_enabled: true,
          sensitive: false,
        });
      }
      return Response.json({ success: true, action, assigned_units: assignedUnits });
    }

    const assignedUnits = assigned.filter((id: string) => id !== user.id);
    await base44.asServiceRole.entities.DispatchCall.update(call_id, { assigned_units: assignedUnits });

    // Audit cleanup is non-critical to the field action. Keep the response fast and
    // let any matching assignment rows settle without blocking the officer UI.
    const records = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id: user.id }).catch(() => []);
    await Promise.all((records || [])
      .filter((record: any) => record.status !== 'cleared')
      .map((record: any) => base44.asServiceRole.entities.CallAssignment.update(record.id, {
        status: 'cleared',
        cleared_at: now,
      }).catch(() => null)));

    return Response.json({ success: true, action, assigned_units: assignedUnits });
  } catch (error) {
    console.error('updateMyCallAssignment failed', error);
    return Response.json({ error: error?.message || 'Assignment update failed' }, { status: 500 });
  }
});