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

    // Sequential reads deliberately avoid creating a large login-time request burst.
    const mentions = operational ? await safe(() => base44.asServiceRole.entities.ChatMention.filter({ recipient_email: me.email, read: false }, '-created_date', 100)) : [];
    const announcements = await safe(() => base44.asServiceRole.entities.Announcement.list('-created_date', 100));
    const receipts = await safe(() => base44.asServiceRole.entities.AnnouncementReceipt.filter({ user_email: me.email }, '-read_at', 1000));
    const notifications = await safe(() => base44.asServiceRole.entities.Notification.filter({ recipient_email: me.email }, '-created_date', 150));
    const propertyAlerts = operational ? await safe(() => base44.asServiceRole.entities.PropertyAlert.list('-created_date', 200)) : [];
    const propertyAlertReceipts = operational ? await safe(() => base44.asServiceRole.entities.PropertyAlertReceipt.filter({ user_email: email }, '-dismissed_at', 300)) : [];
    const units = officerLike ? await safe(() => base44.asServiceRole.entities.Unit.filter({ user_id: me.id }, '-last_update_at', 10)) : [];
    const assignedTasks = supervisorLike ? await safe(() => base44.asServiceRole.entities.Task.filter({ assigned_to: me.id }, '-created_date', 100)) : [];
    const schedules = officerLike ? await safe(() => base44.asServiceRole.entities.Schedule.filter({ officer_email: me.email, shift_date: today }, '-shift_date', 30)) : [];
    const vehicleAssignments = officerLike ? await safe(() => base44.asServiceRole.entities.VehicleAssignment.filter({ assignment_date: today }, '-created_date', 100)) : [];
    const overrides = officerLike ? await safe(() => base44.asServiceRole.entities.OfficerStatusOverride.filter({ officer_id: me.id, active: true }, '-created_date', 10)) : [];
    const allUsers = operational ? await safe(() => base44.asServiceRole.entities.User.list('last_name', 750)) : [];
    const allUnits = operational ? await safe(() => base44.asServiceRole.entities.Unit.list('-last_update_at', 300)) : [];
    const allSchedules = operational ? await safe(() => base44.asServiceRole.entities.Schedule.filter({ shift_date: today }, '-shift_date', 500)) : [];
    const timeEntries = operational ? await safe(() => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 500)) : [];
    const dispatchCalls = operational ? await safe(() => base44.asServiceRole.entities.DispatchCall.list('-created_date', 300)) : [];

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