import { createClientFromRequest } from 'npm:@base44/sdk';
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const supervisorRanks = new Set(['sergeant','first sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);
Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    const roles = new Set((actor?.additional_roles || []).map(lower));
    if (!actor || !(actor.role === 'admin' || actor.is_supervisor === true || roles.has('supervisor') || roles.has('full_access') || supervisorRanks.has(lower(actor.rank)))) {
      return Response.json({ error: 'Supervisor authorization required' }, { status: 403 });
    }
    const input = await req.json();
    const email = lower(input.officer_email);
    const date = String(input.call_out_date || '');
    const type = String(input.call_out_type || 'called_out');
    if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['called_out','sent_home','reassigned'].includes(type) || !String(input.reason || '').trim()) {
      return Response.json({ error: 'Officer, date, reason and valid type are required' }, { status: 400 });
    }
    const schedules = await base44.asServiceRole.entities.Schedule.list('-shift_date', 5000);
    const matching = (schedules || []).filter(shift => lower(shift.officer_email) === email && String(shift.shift_date || '').slice(0, 10) === date && !shift.archived && !shift.is_open && String(shift.id) === String(input.shift_id || '') && (!input.location || lower(shift.location).split(':')[0] === lower(input.location).split(':')[0]));
    if (!matching.length) return Response.json({ error: 'Scheduled shift not found for this officer/date. Choose an actual shift from the schedule.' }, { status: 409 });
    const shift = matching[0];
    if (type === 'reassigned' && (!input.destination_location || !/^\d{2}:\d{2}$/.test(input.destination_start_time || '') || !/^\d{2}:\d{2}$/.test(input.destination_end_time || ''))) return Response.json({error:'Destination site and start/end times are required'}, {status:400});

    const existing = await base44.asServiceRole.entities.CallOut.filter({ officer_email: email, call_out_date: date }, '-created_date', 100);
    if ((existing || []).some(row => row.original_shift_id === shift.id && row.call_out_type === type && row.voided !== true)) {
      return Response.json({ error: 'This shift already has a recorded call-out of that type.' }, { status: 409 });
    }
    const users = await base44.asServiceRole.entities.User.filter({ email }, '-updated_date', 1);
    const officer = users?.[0];
    const callout = await base44.asServiceRole.entities.CallOut.create({
      officer_email: email, officer_name: [officer?.rank,officer?.last_name].filter(Boolean).join(' ') || 'Officer',
      call_out_type: type, call_out_date: date, call_out_time: String(input.call_out_time || ''),
      reason: String(input.reason).trim(), location: shift.location, original_location: input.original_location || '',
      destination_location: input.destination_location || '', original_shift_id: shift.id,
      supervisor_email: actor.email, supervisor_name: [actor.rank,actor.last_name].filter(Boolean).join(' ') || 'Supervisor',
      affects_pto: type !== 'reassigned', exclude_original_incident_metric: type === 'reassigned' || !!input.exclude_original_incident_metric,
      admin_notified: false,
      destination_start_time: input.destination_start_time || '', destination_end_time: input.destination_end_time || '',
    });
    try {
      await base44.asServiceRole.entities.Schedule.update(shift.id, {
        attendance_status: type === 'called_out' ? 'called_out' : type,
        call_out_record_id: callout.id,
        attendance_updated_at: new Date().toISOString(),
        attendance_updated_by: actor.email,
      });
    } catch (error) {
      await base44.asServiceRole.entities.CallOut.update(callout.id, { voided: true }).catch(() => null);
      throw error;
    }
    // A complete call-out vacates the active roster. Keep the original shift
    // archived as evidence and create a separately assignable open coverage shift.
    // All three events vacate the remaining original coverage; an open shift lets relief accept the post.
    let coverageShiftId = '';
    if (['called_out','sent_home','reassigned'].includes(type)) {
      const remainingStart = type === 'called_out' ? shift.start_time : String(input.call_out_time || '').slice(0,5);
      if (!/^\d{2}:\d{2}$/.test(remainingStart)) throw new Error('A valid effective time is required to release remaining coverage.');
      const linkedOpen = (schedules || []).find(row => row.is_open === true && row.archived !== true && String(row.linked_shift_id || '') === String(shift.id));
      const openShift = linkedOpen || await base44.asServiceRole.entities.Schedule.create({
        officer_email: 'OPEN', shift_date: shift.shift_date, start_time: remainingStart,
        end_time: shift.end_time, location: shift.location, is_open: true,
        shift_type: shift.shift_type || 'normal', site_details: shift.site_details || '',
        special_instructions: shift.special_instructions || '', linked_shift_id: shift.id,
      });
      coverageShiftId = String(openShift.id);
      await base44.asServiceRole.entities.Schedule.update(shift.id, { archived: true });
      if (type === 'sent_home') {
        const stamp = new Date(`${date}T${String(input.call_out_time || '').slice(0,5)}:00-04:00`);
        // Apply the local reported time to any open time entry without deleting worked time.
        if (Number.isFinite(stamp.getTime())) {
          const entries = await base44.asServiceRole.entities.TimeEntry.filter({ officer_email: email }, '-clock_in', 50);
          for (const entry of entries || []) {
            if (entry.clock_in && !entry.clock_out && new Date(entry.clock_in).getTime() <= stamp.getTime()) {
              await base44.asServiceRole.entities.TimeEntry.update(entry.id, { clock_out: stamp.toISOString() });
            }
          }
        }
      }
      // Duty supervisor coverage is a separate entity, so remove only same-date
      // blocks for the called-out person. Never delete other supervisors' blocks.
      const blocks = await base44.asServiceRole.entities.DutySupervisorAssignment.filter({ supervisor_email: email, assignment_date: date }, '-start_time', 100).catch(() => []);
      for (const block of blocks) {
        if (lower(block.status) !== 'cancelled') await base44.asServiceRole.entities.DutySupervisorAssignment.update(block.id, { status: 'cancelled' });
      }
    }
    let destinationShiftId = '';
    if (type === 'reassigned') {
      const destination = await base44.asServiceRole.entities.Schedule.create({
        officer_email: email, shift_date: date, start_time: input.destination_start_time,
        end_time: input.destination_end_time, location: input.destination_location,
        is_open: false, linked_shift_id: shift.id, shift_type: shift.shift_type || 'normal',
      });
      destinationShiftId = String(destination.id);
      // The original assignment is historical; destination is the new active shift.
      await base44.asServiceRole.entities.Schedule.update(shift.id, { archived: true });
    }
    return Response.json({ success: true, callout_id: callout.id, shift_id: shift.id, coverage_shift_id: coverageShiftId, destination_shift_id: destinationShiftId });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to record call-out' }, { status: 500 });
  }
});