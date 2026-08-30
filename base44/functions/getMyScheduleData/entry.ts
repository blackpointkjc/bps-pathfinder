import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const roles = new Set((me.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
    let officer = me;
    if (body.preview_user_id) {
      if (me.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Preview access denied' }, { status: 403 });
      officer = await base44.asServiceRole.entities.User.get(String(body.preview_user_id)).catch(() => null);
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
    }
    const officerEmail = String(officer.work_email || officer.pathfinder_email || officer.email || '').trim().toLowerCase();

    const [schedules, weekStatuses, vehicleAssignments, dutySupervisorAssignments, locations, payrollPeriods, pto] = await Promise.all([
      base44.asServiceRole.entities.Schedule.filter({ officer_email: officerEmail }, '-shift_date', 1000),
      base44.asServiceRole.entities.ScheduleWeekStatus.list('-week_start_date', 500),
      base44.asServiceRole.entities.VehicleAssignment.list('-assignment_date', 1000).catch(() => []),
      base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date', 1000).catch(() => []),
      base44.asServiceRole.entities.Location.list('site_name', 1000).catch(() => []),
      base44.asServiceRole.entities.PayrollPeriod.list('-start_date', 200).catch(() => []),
      base44.asServiceRole.entities.TimeOffRequest.filter({ created_by_id: officer.id, status: 'approved' }, '-created_date', 500).catch(() => []),
    ]);

    return Response.json({
      schedules: schedules || [],
      weekStatuses: weekStatuses || [],
      vehicleAssignments: (vehicleAssignments || []).filter((a: any) => String(a.primary_officer_email || '').toLowerCase() === officerEmail || String(a.partner_officer_email || '').toLowerCase() === officerEmail),
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
