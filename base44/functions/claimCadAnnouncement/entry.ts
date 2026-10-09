import { createClientFromRequest } from 'npm:@base44/sdk';

const clean = (value: unknown) => String(value || '').trim();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const eventKey = clean(body.event_key);
    const userEmail = clean(user.email).toLowerCase();
    if (!eventKey) return Response.json({ error: 'event_key is required' }, { status: 400 });

    if (body.action === 'finalize') {
      const receiptId = clean(body.receipt_id);
      if (!receiptId) return Response.json({ error: 'receipt_id is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.CadAnnouncementReceipt.get(receiptId).catch(() => null);
      if (!existing || clean(existing.user_email).toLowerCase() !== userEmail || clean(existing.event_key) !== eventKey) {
        return Response.json({ error: 'Announcement receipt not found' }, { status: 404 });
      }
      const allowedStates = new Set(['played', 'quiet', 'blocked', 'failed', 'disabled']);
      const state = allowedStates.has(clean(body.state)) ? clean(body.state) : 'failed';
      const updated = await base44.asServiceRole.entities.CadAnnouncementReceipt.update(receiptId, {
        state,
        error: clean(body.error).slice(0, 500),
        processed_at: new Date().toISOString(),
      });
      return Response.json({ success: true, receipt: updated });
    }


    // Routine call changes are private to the assigned officers. Resolve legacy
    // Unit/ActiveOfficer IDs as well as the canonical User ID, on the server.
    const routineTypes = new Set(['unit_dispatched', 'additional_unit', 'unit_reassigned',
      'unit_acknowledged', 'unit_enroute', 'unit_on_scene', 'unit_cleared',
      'unit_available', 'priority_upgraded', 'call_cancelled', 'call_cleared', 'call_updated']);
    let announcementText = '';
    if (routineTypes.has(clean(body.event_type))) {
      const event = await base44.asServiceRole.entities.CallStatusLog.get(clean(body.event_id)).catch(() => null);
      if (!event || clean(event.event_key) !== eventKey || !routineTypes.has(clean(event.event_type))) {
        return Response.json({ success: true, claimed: false, not_recipient: true });
      }
      const call = await base44.asServiceRole.entities.DispatchCall.get(event.call_id).catch(() => null);
      const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: event.call_id });
      const ids = new Set((call?.assigned_units || []).map(String));
      for (const assignment of assignments || []) {
        if (!['cleared', 'cancelled'].includes(clean(assignment.status).toLowerCase())) ids.add(String(assignment.unit_id));
      }
      // The departing officer must still hear their own unassignment/clear.
      if (['unit_reassigned', 'unit_cleared', 'call_cleared'].includes(event.event_type) && event.unit_id) ids.add(String(event.unit_id));
      let assigned = ids.has(String(user.id)) || ids.has(userEmail);
      for (const id of assigned ? [] : ids) {
        const unit = await base44.asServiceRole.entities.Unit.get(id).catch(() => null);
        if (String(unit?.user_id || '') === String(user.id) || clean(unit?.user_email).toLowerCase() === userEmail) { assigned = true; break; }
        const session = await base44.asServiceRole.entities.ActiveOfficer.get(id).catch(() => null);
        if (clean(session?.officer_email).toLowerCase() === userEmail) { assigned = true; break; }
      }
      if (!assigned) return Response.json({ success: true, claimed: false, not_recipient: true });
      announcementText = event.event_type === 'unit_reassigned'
        ? 'You have been unassigned from the call.'
        : event.event_type === 'call_cancelled'
          ? 'Your assigned call has been cancelled. Return 10-8.'
          : event.event_type === 'call_cleared'
            ? 'Your assigned call has been cleared.'
            : ['unit_dispatched','additional_unit'].includes(event.event_type)
              ? 'You have been assigned a call. Check your mobile data terminal.'
              : 'Your call has been updated. Check your mobile data terminal.';
    }

    const existing = await base44.asServiceRole.entities.CadAnnouncementReceipt.filter(
      { event_key: eventKey, user_email: userEmail },
      '-processed_at',
      5,
    );
    if (existing?.length) {
      return Response.json({ success: true, claimed: false, receipt: existing[0] });
    }

    const receipt = await base44.asServiceRole.entities.CadAnnouncementReceipt.create({
      event_key: eventKey,
      event_id: clean(body.event_id),
      user_email: userEmail,
      device_id: clean(body.device_id).slice(0, 250),
      state: 'quiet',
      processed_at: new Date().toISOString(),
      cad_number: clean(body.cad_number),
      event_type: clean(body.event_type),
    });

    // Self-heal: a concurrent claim for the same user/event can pass the
    // existence check above at the same instant and create a duplicate receipt.
    // Re-query and keep only the earliest; the audit flags duplicates of this
    // exact user_email|event_key pair.
    const allFor = await base44.asServiceRole.entities.CadAnnouncementReceipt.filter(
      { event_key: eventKey, user_email: userEmail },
      'created_date',
      10,
    );
    if (allFor?.length > 1) {
      const [earliest, ...extras] = allFor;
      await Promise.all(extras.map((r: any) =>
        base44.asServiceRole.entities.CadAnnouncementReceipt.delete(r.id).catch(() => null)
      ));
      // Only the request that created the surviving earliest receipt owns audio.
      // A concurrent request whose newly-created receipt was removed must return
      // claimed:false or two devices can both speak the same event.
      const ownsClaim = String(earliest.id) === String(receipt.id);
      return Response.json({ success: true, claimed: ownsClaim, announcement_text: announcementText, receipt: earliest, deduplicated: extras.length });
    }
    return Response.json({ success: true, claimed: true, announcement_text: announcementText, receipt });
  } catch (error) {
    console.error('claimCadAnnouncement failed', error);
    return Response.json({ error: error?.message || 'Unable to claim announcement' }, { status: 500 });
  }
});