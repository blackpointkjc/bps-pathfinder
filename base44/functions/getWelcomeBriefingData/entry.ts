import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const email = lower(me.email);
    const roles = new Set([me.role, ...(me.additional_roles || [])].filter(Boolean).map(lower));
    const operational = !roles.has('client') && !roles.has('student') && me.user_type !== 'client';
    const officerLike = operational && (roles.has('officer') || roles.has('supervisor') || me.role === 'admin' || me.role === 'dispatch');
    const supervisorLike = me.role === 'admin' || roles.has('supervisor') || roles.has('full_access');

    const safe = async (loader: () => Promise<any>, fallback: any[] = []) => {
      try { return await loader(); } catch (error) {
        console.warn('Welcome briefing source skipped:', error?.message || error);
        return fallback;
      }
    };

    // Fetch a compact personal snapshot first, then the compact company snapshot.
    // The prior implementation made 16 large sequential reads (up to 1,000 rows
    // each), keeping the login request open long enough to consume the app's request
    // allowance and block Start Session with RATE_LIMITED.
    const [
      mentions, announcements, receipts, notifications, propertyAlertReceipts,
      assignedTasks, overrides, recentUserTimeEntries, liveOfficers,
    ] = await Promise.all([
      operational ? safe(() => base44.asServiceRole.entities.ChatMention.filter({ recipient_email: me.email, read: false }, '-created_date', 50)) : [],
      safe(() => base44.asServiceRole.entities.Announcement.list('-created_date', 50)),
      safe(() => base44.asServiceRole.entities.AnnouncementReceipt.filter({ user_email: me.email }, '-read_at', 250)),
      safe(() => base44.asServiceRole.entities.Notification.filter({ recipient_email: me.email }, '-created_date', 75)),
      operational ? safe(() => base44.asServiceRole.entities.PropertyAlertReceipt.filter({ user_email: email }, '-dismissed_at', 100)) : [],
      supervisorLike ? safe(() => base44.asServiceRole.entities.Task.filter({ assigned_to: me.id }, '-created_date', 50)) : [],
      officerLike ? safe(() => base44.asServiceRole.entities.OfficerStatusOverride.filter({ officer_id: me.id, active: true }, '-created_date', 5)) : [],
      officerLike ? safe(() => base44.asServiceRole.entities.TimeEntry.filter({ officer_email: me.email }, '-clock_in', 10)) : [],
      officerLike ? safe(() => base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: me.email }, '-last_update', 2)) : [],
    ]);

    const [
      propertyAlerts, vehicleAssignments, allUsers, allUnits, allSchedules,
      timeEntries, dispatchCalls,
    ] = await Promise.all([
      operational ? safe(() => base44.asServiceRole.entities.PropertyAlert.list('-created_date', 100)) : [],
      officerLike ? safe(() => base44.asServiceRole.entities.VehicleAssignment.filter({ assignment_date: today }, '-created_date', 50)) : [],
      operational ? safe(() => base44.asServiceRole.entities.User.list('last_name', 250)) : [],
      operational ? safe(() => base44.asServiceRole.entities.Unit.list('-last_update_at', 100)) : [],
      operational ? safe(() => base44.asServiceRole.entities.Schedule.filter({ shift_date: today }, '-shift_date', 150)) : [],
      operational ? safe(() => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 150)) : [],
      operational ? safe(() => base44.asServiceRole.entities.DispatchCall.list('-created_date', 150)) : [],
    ]);

    const units = officerLike ? allUnits.filter((unit: any) => String(unit.user_id || '') === String(me.id)) : [];
    const schedules = officerLike ? allSchedules.filter((shift: any) => lower(shift.officer_email) === email) : [];

    return Response.json({
      success: true,
      today,
      messages: [],
      mentions,
      announcements,
      receipts,
      notifications,
      propertyAlerts,
      propertyAlertReceipts,
      recentUserTimeEntries,
      liveOfficers,
      units,
      assignedTasks,
      schedules,
      vehicleAssignments,
      overrides,
      allUsers,
      allUnits,
      allSchedules,
      timeEntries,
      dispatchCalls,
    });
  } catch (error) {
    console.error('getWelcomeBriefingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load welcome briefing' }, { status: 500 });
  }
});