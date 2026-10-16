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
    const existing = await base44.asServiceRole.entities.CallOut.filter({ officer_email: email, call_out_date: date }, '-created_date', 100);
    if ((existing || []).some(row => row.original_shift_id === shift.id && row.call_out_type === type && row.voided !== true)) {
      return Response.json({ error: 'This shift already has a recorded call-out of that type.' }, { status: 409 });
    }
    const users = await base44.asServiceRole.entities.User.filter({ email }, '-updated_date', 1);
    const officer = users?.[0];
    const callout = await base44.asServiceRole.entities.CallOut.create({
      officer_email: email, officer_name: officer?.full_name || [officer?.first_name,officer?.last_name].filter(Boolean).join(' ') || email,
      call_out_type: type, call_out_date: date, call_out_time: String(input.call_out_time || ''),
      reason: String(input.reason).trim(), location: shift.location, original_location: input.original_location || '',
      destination_location: input.destination_location || '', original_shift_id: shift.id,
      supervisor_email: actor.email, supervisor_name: actor.full_name || [actor.first_name,actor.last_name].filter(Boolean).join(' ') || actor.email,
      affects_pto: type !== 'reassigned', exclude_original_incident_metric: type === 'reassigned' || !!input.exclude_original_incident_metric,
      admin_notified: false,
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
    return Response.json({ success: true, callout_id: callout.id, shift_id: shift.id });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to record call-out' }, { status: 500 });
  }
});