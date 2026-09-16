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
      // Live CAD roster rows use the User id. Older/spare-unit workflows may pass
      // a Unit id. Support both so assignment notifications and voice alerts are
      // never lost just because the caller used the live roster identifier.
      const directUser = await base44.asServiceRole.entities.User.get(unit_id).catch(() => null);
      if (directUser?.email) return directUser;
      const unitRecord = await base44.asServiceRole.entities.Unit.get(unit_id).catch(() => null);
      if (!unitRecord) return null;
      if (unitRecord.user_id) {
        const officer = await base44.asServiceRole.entities.User.get(unitRecord.user_id).catch(() => null);
        if (officer?.email) return officer;
      }
      if (unitRecord.user_email) {
        const matches = await base44.asServiceRole.entities.User.filter({ email: unitRecord.user_email }, '-updated_date', 1).catch(() => []);
        if (matches?.[0]?.email) return matches[0];
      }
      return null;
    };

    if (action === 'assign') {
      if (!assigned.includes(unit_id)) {
        const assignedOfficer = await resolveUnitOfficer();
        if (assignedOfficer?.email) {
          const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter(
            { officer_email: String(assignedOfficer.email).trim().toLowerCase() },
            '-last_update',
            5,
          ).catch(() => []);
          const newestSession = (sessions || []).sort((a: any, b: any) =>
            new Date(b.last_update || b.updated_date || b.created_date || 0).getTime()
            - new Date(a.last_update || a.updated_date || a.created_date || 0).getTime()
          )[0];
          const sessionAt = new Date(newestSession?.last_update || newestSession?.updated_date || newestSession?.created_date || 0).getTime();
          const heartbeatFresh = newestSession?.session_active !== false
            && Number.isFinite(sessionAt)
            && sessionAt >= Date.now() - 15 * 60 * 1000;
          if (!heartbeatFresh) {
            return Response.json({
              error: 'This unit is still shown on the CAD roster, but its Pathfinder connection is stale. Wait for the device heartbeat to recover or contact the officer before assigning through Pathfinder.',
              code: 'UNIT_CONNECTION_STALE',
              officer_email: assignedOfficer.email,
            }, { status: 409 });
          }
        }

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

        const now = new Date().toISOString();
        const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
        const isBackup = (activeAssignments || []).some((a: any) => a.status !== 'cleared');
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id,
          incident_type: call.incident || '',
          location: call.location || '',
          old_status: call.status || '',
          new_status: call.status === 'New' ? 'Dispatched' : call.status,
          unit_id,
          unit_name: unit_id,
          notes: isBackup ? 'Additional unit assigned' : 'Primary unit assigned',
          latitude: call.latitude,
          longitude: call.longitude,
          event_key: `call:${call_id}:assignment:${unit_id}:${now}`,
          event_type: isBackup ? 'additional_unit' : 'unit_dispatched',
          announcement_text: `${isBackup ? 'Additional unit assigned' : 'Unit dispatched'}. ${call.incident || 'Call for service'}. CAD number ${cadNumber}.`,
          announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
          cad_number: String(cadNumber),
          triggering_action: 'manageCadUnitAssignment.assign',
          audio_enabled: true,
          sensitive: false,
        });

        // Tell the assigned officer. Previously nothing informed them they had
        // been put on a call -- this Notification (read by GlobalMessageBanner,
        // which also speaks it aloud the same way property-monitoring alerts
        // are announced) is how they now find out.
        if (assignedOfficer?.email) {
          const incident = call.incident || 'Call for service';
          const location = call.location || 'Address unavailable';
          const callNumber = call.agency_cad_number || call.bps_reference || call.call_id || 'reference pending';
          const priorityText = call.priority ? ` Priority ${call.priority}.` : '';
          const unitLabel = assignedOfficer.unit_number ? `Unit ${assignedOfficer.unit_number}. ` : '';
          await base44.asServiceRole.entities.Notification.create({
            recipient_email: String(assignedOfficer.email).trim().toLowerCase(),
            type: 'call_assignment',
            title: `Dispatch Assignment · ${callNumber}`,
            message: `${unitLabel}Assigned to ${callNumber}. ${incident} at ${location}.${priorityText}`,
            is_read: false,
            related_id: call_id,
            priority: call.priority === 'high' || call.priority === 'emergency' || call.priority === 'critical' ? 'critical' : 'high',
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

      const now = new Date().toISOString();
      const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
      await base44.asServiceRole.entities.CallStatusLog.create({
        call_id,
        incident_type: call.incident || '',
        location: call.location || '',
        old_status: call.status || '',
        new_status: call.status || '',
        unit_id,
        unit_name: unit_id,
        notes: 'Unit removed from assignment by authorized dispatcher',
        event_key: `call:${call_id}:unassignment:${unit_id}:${now}`,
        event_type: 'unit_reassigned',
        announcement_text: `Unit reassigned. CAD number ${cadNumber}.`,
        announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
        cad_number: String(cadNumber),
        triggering_action: 'manageCadUnitAssignment.unassign',
        audio_enabled: true,
        sensitive: false,
      });

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