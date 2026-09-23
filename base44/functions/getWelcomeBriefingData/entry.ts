import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

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
    const sourceErrors: string[] = [];

    async function loadSource(label: string, loader: () => Promise<any>, options: { required?: boolean; fallback?: any; reportError?: boolean } = {}) {
      const fallback = options.fallback ?? [];
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await loader();
          return result ?? fallback;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await delay(500 * (attempt + 1));
        }
      }
      console.error(`getWelcomeBriefingData could not load ${label}`, lastError);
      if (options.reportError !== false) sourceErrors.push(label);
      if (options.required) throw lastError || new Error(`Unable to load ${label}`);
      return fallback;
    }

    // IMPORTANT: keep these reads serialized. This snapshot runs at login and feeds
    // many cards at once. Parallel service-role bursts previously triggered 429s;
    // the old safe() wrapper then replaced the failed sources with empty arrays,
    // causing false "0 / none found" briefing results.
    const recentUserTimeEntries = officerLike
      ? await loadSource('your time entries', () => base44.asServiceRole.entities.TimeEntry.filter({ officer_email: me.email }, '-clock_in', 20), { required: true })
      : [];

    const liveOfficers = officerLike
      ? await loadSource('your live duty session', () => base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: me.email }, '-last_update', 5), { required: true })
      : [];

    const allSchedules = operational
      ? await loadSource("today's schedule", () => base44.asServiceRole.entities.Schedule.filter({ shift_date: today }, 'start_time', 250), { required: true })
      : [];

    const timeEntries = operational
      ? await loadSource('active staffing/time entries', () => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 250), { required: true })
      : [];

    const allUsers = operational
      ? await loadSource('company users', () => base44.asServiceRole.entities.User.list('last_name', 500), { required: true })
      : [];

    const allUnits = operational
      ? await loadSource('CAD units', () => base44.asServiceRole.entities.Unit.list('-last_update_at', 250), { required: true })
      : [];

    const allLiveOfficers = operational
      ? await loadSource('live officer sessions', () => base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 250), { required: true })
      : [];

    const vehicleAssignments = officerLike
      ? await loadSource('vehicle assignments', () => base44.asServiceRole.entities.VehicleAssignment.filter({ assignment_date: today }, '-created_date', 100))
      : [];

    const overrides = officerLike
      ? await loadSource('status overrides', () => base44.asServiceRole.entities.OfficerStatusOverride.filter({ officer_id: me.id, active: true }, '-created_date', 10))
      : [];

    // Communications and secondary briefing sources are optional, but failures are
    // reported to the UI instead of being indistinguishable from a genuine zero.
    const mentions = operational
      ? await loadSource('Teams mentions', () => base44.asServiceRole.entities.ChatMention.filter({ recipient_email: me.email, read: false }, '-created_date', 100))
      : [];

    const announcements = await loadSource('announcements', () => base44.asServiceRole.entities.Announcement.list('-created_date', 100));
    const receipts = await loadSource('announcement receipts', () => base44.asServiceRole.entities.AnnouncementReceipt.filter({ user_email: me.email }, '-read_at', 300));
    const notifications = await loadSource('notifications', () => base44.asServiceRole.entities.Notification.filter({ recipient_email: me.email }, '-created_date', 150));

    const assignedTasks = supervisorLike
      ? await loadSource('assigned tasks', () => base44.asServiceRole.entities.Task.filter({ assigned_to: me.id }, '-created_date', 100))
      : [];

    const propertyAlertReceipts = operational
      ? await loadSource('property alert receipts', () => base44.asServiceRole.entities.PropertyAlertReceipt.filter({ user_email: email }, '-dismissed_at', 150))
      : [];
    const propertyAlerts = operational
      ? await loadSource('property alerts', () => base44.asServiceRole.entities.PropertyAlert.list('-created_date', 150))
      : [];

    // The briefing only needs DispatchCall rows to verify the current status of
    // property-alert calls. Pulling the latest 200 calls on every login was wasteful
    // and made this optional enrichment the most common source of briefing warnings.
    // Query only the call IDs referenced by the already-loaded PropertyAlert rows.
    const propertyCallIds = Array.from(new Set((propertyAlerts || [])
      .map((alert: any) => String(alert?.callId || '').trim())
      .filter(Boolean)))
      .slice(0, 150);
    const dispatchCalls = operational && propertyCallIds.length
      ? await loadSource(
          'dispatch calls',
          () => base44.asServiceRole.entities.DispatchCall.filter({
            id: propertyCallIds.length === 1 ? propertyCallIds[0] : { $in: propertyCallIds },
          }, '-created_date', 200),
          // PropertyAlert stores its own call/lifecycle snapshot, so a transient
          // verification failure must not mark the entire briefing incomplete.
          { reportError: false },
        )
      : [];

    const units = officerLike ? (allUnits || []).filter((unit: any) => String(unit.user_id || '') === String(me.id)) : [];
    const schedules = officerLike ? (allSchedules || []).filter((shift: any) => lower(shift.officer_email) === email) : [];

    return Response.json({
      success: true,
      today,
      sourceErrors,
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
      allLiveOfficers,
      allSchedules,
      timeEntries,
      dispatchCalls,
    });
  } catch (error) {
    console.error('getWelcomeBriefingData failed', error);
    return Response.json({ error: error?.message || 'Unable to load welcome briefing' }, { status: 500 });
  }
});
