import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const minutes = (value: unknown) => {
  const [hours = 0, mins = 0] = String(value || '00:00').split(':').map(Number);
  return (hours * 60) + mins;
};
const overlaps = (aStart: unknown, aEnd: unknown, bStart: unknown, bEnd: unknown) => {
  const normalize = (start: unknown, end: unknown) => {
    const from = minutes(start);
    let to = minutes(end);
    if (to <= from) to += 1440;
    return [from, to];
  };
  const [as, ae] = normalize(aStart, aEnd);
  const [bs, be] = normalize(bStart, bEnd);
  return as < be && bs < ae;
};
const officerName = (user: any) =>
  [user?.rank, user?.last_name || user?.first_name].filter(Boolean).join(' ').trim()
  || user?.full_name || user?.email || 'Officer';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const manager = user.role === 'admin' || roles.has('full_access') || roles.has('fleet_manager');
    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'list');

    if (action === 'delete') {
      if (!manager) return Response.json({ error: 'Fleet manager access required.' }, { status: 403 });
      const id = String(body.id || '').trim();
      if (!id) return Response.json({ error: 'Assignment id is required.' }, { status: 400 });
      await base44.asServiceRole.entities.VehicleAssignment.delete(id);
      return Response.json({ success: true, deleted: id });
    }

    if (action === 'save') {
      if (!manager) return Response.json({ error: 'Fleet manager access required.' }, { status: 403 });
      const row = body.assignment || {};
      const required = ['assignment_date', 'start_time', 'end_time', 'vehicle_id', 'primary_officer_email'];
      for (const field of required) {
        if (!String(row[field] || '').trim()) return Response.json({ error: `${field.replaceAll('_', ' ')} is required.` }, { status: 400 });
      }

      const [vehicle, users, assignments] = await Promise.all([
        base44.asServiceRole.entities.Vehicle.get(String(row.vehicle_id)).catch(() => null),
        base44.asServiceRole.entities.User.list('-updated_date', 1000),
        base44.asServiceRole.entities.VehicleAssignment.filter(
          { assignment_date: String(row.assignment_date).slice(0, 10) },
          '-created_date',
          500,
        ).catch(() => []),
      ]);
      if (!vehicle) return Response.json({ error: 'Selected vehicle was not found.' }, { status: 404 });
      if (['maintenance', 'out of service', 'retired'].includes(lower(vehicle.status))) {
        return Response.json({ error: `${vehicle.vehicle_id || 'This vehicle'} is not available for assignment.` }, { status: 409 });
      }
      const primary = (users || []).find((person: any) => lower(person.email) === lower(row.primary_officer_email));
      const partner = (users || []).find((person: any) => lower(person.email) === lower(row.partner_officer_email));
      if (!primary) return Response.json({ error: 'Selected primary officer was not found.' }, { status: 400 });

      const conflict = (assignments || []).find((item: any) =>
        String(item.id || '') !== String(row.id || '')
        && String(item.vehicle_id || '') === String(vehicle.id)
        && lower(item.status) !== 'cancelled'
        && overlaps(item.start_time, item.end_time, row.start_time, row.end_time)
      );
      if (conflict) {
        return Response.json({
          error: `${vehicle.vehicle_id || 'Vehicle'} is already assigned from ${conflict.start_time}-${conflict.end_time}.`,
        }, { status: 409 });
      }

      const payload = {
        assignment_date: String(row.assignment_date).slice(0, 10),
        start_time: String(row.start_time).slice(0, 5),
        end_time: String(row.end_time).slice(0, 5),
        vehicle_id: String(vehicle.id),
        vehicle_label: String(vehicle.vehicle_id || vehicle.product_name || vehicle.id),
        primary_officer_email: lower(primary.email),
        primary_officer_name: officerName(primary),
        partner_officer_email: partner?.email ? lower(partner.email) : '',
        partner_officer_name: partner ? officerName(partner) : '',
        location: String(row.location || '').trim(),
        status: String(row.status || 'scheduled'),
        notes: String(row.notes || '').slice(0, 1000),
        created_by_email: lower(user.email),
      };
      const saved = row.id
        ? await base44.asServiceRole.entities.VehicleAssignment.update(String(row.id), payload)
        : await base44.asServiceRole.entities.VehicleAssignment.create(payload);
      return Response.json({ success: true, assignment: saved || payload });
    }

    const [vehicles, schedules, assignments] = await Promise.all([
      base44.asServiceRole.entities.Vehicle.list('vehicle_id', 500).catch(() => []),
      base44.asServiceRole.entities.Schedule.list('-shift_date', 1500).catch(() => []),
      base44.asServiceRole.entities.VehicleAssignment.list('-assignment_date', 1500).catch(() => []),
    ]);

    const email = lower(user.work_email || user.pathfinder_email || user.email);
    const visibleSchedules = manager ? schedules : (schedules || []).filter((row: any) =>
      lower(row.officer_email) === email || lower(row.partner_officer_email) === email
    );
    const visibleAssignments = manager ? assignments : (assignments || []).filter((row: any) =>
      lower(row.primary_officer_email) === email || lower(row.partner_officer_email) === email
    );

    return Response.json({
      success: true,
      vehicles: vehicles || [],
      schedules: visibleSchedules || [],
      assignments: visibleAssignments || [],
      manager,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('getFleetScheduleData failed', error);
    return Response.json({ error: error?.message || 'Unable to manage fleet schedule' }, { status: 500 });
  }
});
