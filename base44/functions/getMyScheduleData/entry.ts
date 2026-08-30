import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [schedules, weekStatuses, vehicleAssignments, dutySupervisorAssignments, locations, payrollPeriods, pto] = await Promise.all([
      base44.asServiceRole.entities.Schedule.filter({ officer_email: me.email }, '-shift_date', 1000),
      base44.asServiceRole.entities.ScheduleWeekStatus.list('-week_start_date', 500),
      base44.asServiceRole.entities.VehicleAssignment.list('-assignment_date', 1000).catch(() => []),
      base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date', 1000).catch(() => []),
      base44.asServiceRole.entities.Location.list('site_name', 1000).catch(() => []),
      base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 200).catch(() => []),
      base44.asServiceRole.entities.TimeOffRequest.filter({ created_by_id: me.id, status: 'approved' }, '-created_date', 500).catch(() => []),
    ]);

    return Response.json({
      schedules: schedules || [],
      weekStatuses: weekStatuses || [],
      vehicleAssignments: (vehicleAssignments || []).filter((a: any) => a.primary_officer_email === me.email || a.partner_officer_email === me.email),
      dutySupervisorAssignments: dutySupervisorAssignments || [],
      locations: (locations || []).filter((location: any) => location.active !== false),
      payrollPeriods: payrollPeriods || [],
      approvedPTO: pto || [],
    });
  } catch (error) {
    console.error('getMyScheduleData failed', error);
    return Response.json({ error: error?.message || 'Unable to load schedule' }, { status: 500 });
  }
});
