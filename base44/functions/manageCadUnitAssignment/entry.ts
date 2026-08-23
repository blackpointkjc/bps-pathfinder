import { createClientFromRequest } from 'npm:@base44/sdk';

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

    // Resolve which officer (if any) sits behind this unit so the person
    // actually being assigned/unassigned can be notified. Units are not
    // always linked to a signed-in officer (e.g. a spare unit record), so
    // this is best-effort and never blocks the assignment itself.
    const resolveUnitOfficer = async () => {
      try {
        const unitRecord = await base44.asServiceRole.entities.Unit.get(unit_id);
        if (!unitRecord?.user_id) return null;
        const officer = await base44.asServiceRole.entities.User.get(unitRecord.user_id).catch(() => null);
        return officer?.email ? officer : null;
      } catch {
        return null;
      }
    };

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

        // Tell the assigned officer. Previously nothing informed them they had
        // been put on a call -- this Notification (read by GlobalMessageBanner,
        // which also speaks it aloud the same way property-monitoring alerts
        // are announced) is how they now find out.
        const officer = await resolveUnitOfficer();
        if (officer?.email) {
          const incident = call.incident || 'Call for service';
          const location = call.location || 'Address unavailable';
          const priorityText = call.priority ? ` Priority ${call.priority}.` : '';
          await base44.asServiceRole.entities.Notification.create({
            recipient_email: String(officer.email).trim().toLowerCase(),
            type: 'call_assignment',
            title: 'Assigned to Call',
            message: `You have been assigned to ${incident} at ${location}.${priorityText}`,
            is_read: false,
            related_id: call_id,
            priority: call.priority === 'high' || call.priority === 'emergency' ? 'critical' : 'high',
            source_name: 'Dispatch',
          }).catch((error: any) => console.error('manageCadUnitAssignment: failed to notify assigned officer', error?.message || error));
        }
      }
    } else {
      await base44.asServiceRole.entities.DispatchCall.update(call_id, { assigned_units: assigned.filter((id: string) => id !== unit_id) });
      const records = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id });
      for (const record of records || []) {
        if (record.status !== 'cleared') await base44.asServiceRole.entities.CallAssignment.update(record.id, { status: 'cleared', cleared_at: new Date().toISOString() });
      }

      const officer = await resolveUnitOfficer();
      if (officer?.email) {
        const incident = call.incident || 'Call for service';
        const location = call.location || 'Address unavailable';
        await base44.asServiceRole.entities.Notification.create({
          recipient_email: String(officer.email).trim().toLowerCase(),
          type: 'call_unassignment',
          title: 'Unassigned from Call',
          message: `You have been unassigned from ${incident} at ${location}.`,
          is_read: false,
          related_id: call_id,
          priority: 'normal',
          source_name: 'Dispatch',
        }).catch((error: any) => console.error('manageCadUnitAssignment: failed to notify unassigned officer', error?.message || error));
      }
    }

    return Response.json({ success: true, action });
  } catch (error) {
    console.error('manageCadUnitAssignment failed', error);
    return Response.json({ error: error?.message || 'Unable to update unit assignment' }, { status: 500 });
  }
});