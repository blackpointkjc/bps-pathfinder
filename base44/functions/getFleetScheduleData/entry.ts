import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const manager = user.role === 'admin' || roles.has('full_access') || roles.has('fleet_manager');
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
    return Response.json({ error: error?.message || 'Unable to load fleet schedule' }, { status: 500 });
  }
});