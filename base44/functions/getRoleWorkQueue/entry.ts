import { createClientFromRequest } from 'npm:@base44/sdk';

const TIME_ZONE = 'America/New_York';
const normalized = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => normalized(role)));
const isPending = (row: any) => normalized(row?.status) === 'pending';
const displayName = (user: any) => [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
  || user?.full_name || user?.email || 'Employee';

function easternParts(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return { date: '', minutes: -1, year: 0 };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return {
    year,
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutes: (read('hour') % 24) * 60 + read('minute'),
  };
}

function parseWallMinutes(value: unknown) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
  if (!match) return -1;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = normalized(match[3]);
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOffset(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T12:00:00Z`).getTime();
  const to = new Date(`${toDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

function actualPaidHours(entry: any) {
  const start = new Date(entry?.clock_in || 0).getTime();
  const end = new Date(entry?.clock_out || 0).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const breaks = (Array.isArray(entry?.break_periods) ? entry.break_periods : []).reduce((sum: number, period: any) => {
    const breakStart = new Date(period?.start || 0).getTime();
    const breakEnd = new Date(period?.end || 0).getTime();
    if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd) || breakEnd <= breakStart) return sum;
    return sum + Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart));
  }, 0);
  return Math.max(0, (end - start - breaks) / 3600000);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = rolesOf(me);
    const canUseAdminQueue = me.role === 'admin' || roles.has('full_access');
    const canUseHrQueue = canUseAdminQueue || roles.has('hr') || normalized(me.rank) === 'human resources';
    if (!canUseHrQueue) return Response.json({ error: 'HR or administrator access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const requestedQueueRole = normalized(body?.queue_role);
    if (requestedQueueRole === 'admin' && !canUseAdminQueue) {
      return Response.json({ error: 'Administrator access required' }, { status: 403 });
    }
    const queueRole = requestedQueueRole === 'hr'
      ? 'hr'
      : requestedQueueRole === 'admin'
        ? 'admin'
        : canUseAdminQueue ? 'admin' : 'hr';
    const loadErrors: string[] = [];
    const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
    const safeList = async (label: string, loader: () => Promise<any[]>) => {
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const rows = await loader();
          return Array.isArray(rows) ? rows : [];
        } catch (error) {
          lastError = error;
          if (attempt < 2) await delay(300 * (attempt + 1) + Math.min(300, label.length * 7));
        }
      }
      console.error(`getRoleWorkQueue could not load ${label}`, lastError);
      loadErrors.push(label);
      return [];
    };
    const loadLimited = async (loaders: Array<() => Promise<any[]>>, concurrency = 2) => {
      const results: any[][] = [];
      for (let index = 0; index < loaders.length; index += concurrency) {
        const batch = loaders.slice(index, index + concurrency);
        results.push(...await Promise.all(batch.map(loader => loader())));
      }
      return results;
    };
    const settleLimited = async (actions: Array<() => Promise<any>>, concurrency = 2) => {
      for (let index = 0; index < actions.length; index += concurrency) {
        await Promise.allSettled(actions.slice(index, index + concurrency).map(action => action()));
      }
    };

    const states = await safeList('work queue completion history', () =>
      base44.asServiceRole.entities.WorkQueueState.list('-completed_at', 5000)
    );
    const roleStates = (states || []).filter((state: any) => normalized(state.queue_role) === queueRole);

    if (normalized(body?.action) === 'complete') {
      const taskKey = String(body?.task_key || '').trim();
      if (!taskKey || taskKey.length > 240) {
        return Response.json({ error: 'A valid task key is required' }, { status: 400 });
      }
      const completedAt = new Date().toISOString();
      const existing = roleStates.find((state: any) => String(state.task_key) === taskKey);
      const patch = {
        status: 'completed',
        completed_at: completedAt,
        completed_by: me.email || String(me.id),
        completion_note: String(body?.note || 'Marked done from the work queue').slice(0, 1000),
        last_seen_at: completedAt,
      };
      let saved;
      if (existing?.id) {
        saved = await base44.asServiceRole.entities.WorkQueueState.update(existing.id, patch);
      } else {
        saved = await base44.asServiceRole.entities.WorkQueueState.create({
          task_key: taskKey,
          queue_role: queueRole,
          title: String(body?.title || 'Work queue task').slice(0, 250),
          person: String(body?.person || '').slice(0, 250),
          source_kind: String(body?.kind || '').slice(0, 100),
          source_id: String(body?.source_id || '').slice(0, 250),
          ...patch,
        });
      }
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'WorkQueueState',
        entity_id: String(saved?.id || existing?.id || taskKey),
        action: 'status_change',
        actor_id: String(me.id || me.email),
        actor_name: displayName(me),
        before_value: JSON.stringify({ status: existing?.status || 'open' }),
        after_value: JSON.stringify({ status: 'completed', task_key: taskKey, queue_role: queueRole }),
        field_changed: 'status',
        timestamp: completedAt,
        description: `${queueRole.toUpperCase()} work item marked complete: ${String(body?.title || taskKey).slice(0, 500)}`,
      }).catch((error: any) => console.warn('Work queue completion audit skipped', error?.message || error));
      return Response.json({ success: true, task_key: taskKey, status: 'completed', completed_at: completedAt });
    }

    const users = await safeList('employee directory', () =>
      base44.asServiceRole.entities.User.list('-updated_date', 2000)
    );

    let schedules: any[] = [];
    let entries: any[] = [];
    let dailyReports: any[] = [];
    let timeOff: any[] = [];
    let availability: any[] = [];
    let accessRequests: any[] = [];
    let reviews: any[] = [];
    let shiftReports: any[] = [];
    let incidentReports: any[] = [];
    let trespassNotices: any[] = [];
    let parkingViolations: any[] = [];
    let criminalComplaints: any[] = [];
    let dispatcherLogs: any[] = [];
    let forceReports: any[] = [];
    let confidentialReports: any[] = [];
    let maintenanceReports: any[] = [];
    let openDoorReports: any[] = [];
    let expenseReports: any[] = [];
    let shiftBids: any[] = [];
    let specialCoverageRequests: any[] = [];
    let weekStatuses: any[] = [];

    if (queueRole === 'hr') {
      [schedules, entries, timeOff, reviews] = await loadLimited([
        () => safeList('schedules', () => base44.asServiceRole.entities.Schedule.list('-shift_date', 5000)),
        () => safeList('time entries', () => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000)),
        () => safeList('time-off requests', () => base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 1000)),
        () => safeList('performance reviews', () => base44.asServiceRole.entities.PerformanceReview.list('-review_date', 5000)),
      ]);
    } else {
      [
        schedules, entries, dailyReports, availability, accessRequests, shiftReports, incidentReports,
        trespassNotices, parkingViolations, criminalComplaints, dispatcherLogs, forceReports,
        confidentialReports, maintenanceReports, openDoorReports, expenseReports,
        shiftBids, specialCoverageRequests, weekStatuses,
      ] = await loadLimited([
        () => safeList('schedules for payroll exceptions', () => base44.asServiceRole.entities.Schedule.list('-shift_date', 5000)),
        () => safeList('time entries for report matching', () => base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000)),
        () => safeList('daily activity reports', () => base44.asServiceRole.entities.DailyActivityReport.list('-report_date', 5000)),
        () => safeList('availability requests', () => base44.asServiceRole.entities.AvailabilityRequest.list('-requested_at', 1000)),
        () => safeList('access requests', () => base44.asServiceRole.entities.AccessRequest.list('-created_date', 1000)),
        () => safeList('shift reports', () => base44.asServiceRole.entities.ShiftReport.list('-created_date', 1000)),
        () => safeList('incident reports', () => base44.asServiceRole.entities.IncidentReport.list('-created_date', 1000)),
        () => safeList('trespass notices', () => base44.asServiceRole.entities.TrespassingNotice.list('-created_date', 1000)),
        () => safeList('parking violations', () => base44.asServiceRole.entities.ParkingViolation.list('-created_date', 1000)),
        () => safeList('criminal complaints', () => base44.asServiceRole.entities.CriminalComplaint.list('-created_date', 1000)),
        () => safeList('dispatcher logs', () => base44.asServiceRole.entities.DispatcherShiftReport.list('-created_date', 1000)),
        () => safeList('use-of-force reports', () => base44.asServiceRole.entities.UseOfForceReport.list('-created_date', 1000)),
        () => safeList('confidential reports', () => base44.asServiceRole.entities.ConfidentialReport.list('-created_date', 1000)),
        () => safeList('maintenance reports', () => base44.asServiceRole.entities.MaintenanceReport.list('-created_date', 1000)),
        () => safeList('open-door reports', () => base44.asServiceRole.entities.OpenDoorReport.list('-created_date', 1000)),
        () => safeList('expense reports', () => base44.asServiceRole.entities.ExpenseReport.list('-created_date', 1000)),
        () => safeList('shift bids', () => base44.asServiceRole.entities.ShiftBid.list('-created_date', 1000)),
        () => safeList('special coverage requests', () => base44.asServiceRole.entities.SpecialCoverageRequest.list('-created_date', 1000)),
        () => safeList('schedule publication status', () => base44.asServiceRole.entities.ScheduleWeekStatus.list('-week_start_date', 100)),
      ]);
    }

    const now = easternParts();
    const fiveMinutesAgo = now.minutes - 5;
    const userByEmail = new Map((users || []).filter((user: any) => user?.email)
      .map((user: any) => [normalized(user.email), user]));
    const userById = new Map((users || []).filter((user: any) => user?.id)
      .map((user: any) => [String(user.id), user]));
    const personFor = (row: any) => {
      const email = normalized(row?.officer_email || row?.email || row?.created_by);
      const user = userByEmail.get(email) || userById.get(String(row?.created_by_id || ''));
      return {
        email: email || user?.email || '',
        name: row?.officer_name || row?.full_name || displayName(user),
      };
    };

    const activeEntries = (entries || []).filter((entry: any) => entry.clock_in && !entry.clock_out && entry.archived !== true);
    const todayEntries = (entries || []).filter((entry: any) => easternParts(entry.clock_in).date === now.date && entry.archived !== true);
    const missedClockIns = queueRole === 'hr' ? (schedules || []).filter((shift: any) => {
      if (shift.archived === true || shift.is_open === true || normalized(shift.officer_email) === 'open') return false;
      if (String(shift.shift_date || '') !== now.date) return false;
      const start = parseWallMinutes(shift.start_time);
      if (start < 0 || start > fiveMinutesAgo) return false;
      return !todayEntries.some((entry: any) => {
        if (normalized(entry.officer_email) !== normalized(shift.officer_email)) return false;
        const entryMinute = easternParts(entry.clock_in).minutes;
        const sameLocation = normalized(entry.location) === normalized(shift.location);
        return sameLocation || Math.abs(entryMinute - start) <= 240;
      });
    }) : [];

    const lateReviewCutoff = Date.now() - 21 * 86400000;
    const lateClockOuts = (entries || []).flatMap((entry: any) => {
      if (!entry?.id || !entry.clock_in || !entry.clock_out || entry.archived === true || entry.payroll_adjustment_decision) return [];
      if (new Date(entry.clock_out).getTime() < lateReviewCutoff) return [];
      const clockIn = easternParts(entry.clock_in);
      const clockOut = easternParts(entry.clock_out);
      const sameDaySchedules = (schedules || []).filter((shift: any) =>
        shift.archived !== true
        && normalized(shift.officer_email) === normalized(entry.officer_email)
        && String(shift.shift_date || '').slice(0, 10) === clockIn.date
      );
      if (!sameDaySchedules.length) return [];
      const sameLocationSchedules = sameDaySchedules.filter((shift: any) =>
        normalized(shift.location) && normalized(shift.location) === normalized(entry.location)
      );
      const pool = sameLocationSchedules.length ? sameLocationSchedules : sameDaySchedules;
      const scheduled = [...pool].sort((left: any, right: any) =>
        Math.abs(parseWallMinutes(left.start_time) - clockIn.minutes)
        - Math.abs(parseWallMinutes(right.start_time) - clockIn.minutes)
      )[0];
      const startMinutes = parseWallMinutes(scheduled?.start_time);
      const endWallMinutes = parseWallMinutes(scheduled?.end_time);
      if (startMinutes < 0 || endWallMinutes < 0) return [];
      const scheduledEndMinutes = endWallMinutes <= startMinutes ? endWallMinutes + 1440 : endWallMinutes;
      const actualEndMinutes = clockOut.minutes + dayOffset(clockIn.date, clockOut.date) * 1440;
      const lateMinutes = Math.round(actualEndMinutes - scheduledEndMinutes);
      return lateMinutes > 5 ? [{ entry, scheduled, lateMinutes }] : [];
    });

    const reportByShift = new Set((dailyReports || []).map((report: any) => String(report.shift_id || '')).filter(Boolean));
    const legacyReportKeys = new Set((dailyReports || []).map((report: any) =>
      `${normalized(report.officer_email || report.created_by)}|${String(report.report_date || '')}|${normalized(report.location)}`
    ));
    const recentCutoff = Date.now() - 21 * 86400000;
    const missingReports = queueRole === 'admin' ? (entries || []).filter((entry: any) => {
      if (!entry.clock_in || !entry.clock_out || entry.archived === true) return false;
      if (new Date(entry.clock_out).getTime() < recentCutoff) return false;
      if (reportByShift.has(String(entry.id))) return false;
      const key = `${normalized(entry.officer_email)}|${easternParts(entry.clock_in).date}|${normalized(entry.location)}`;
      return !legacyReportKeys.has(key);
    }) : [];

    const reportSources = [
      ['Shift Report', shiftReports, ['submitted']],
      ['Daily Activity Report', dailyReports, ['submitted']],
      ['Incident Report', incidentReports, ['submitted', 'pending']],
      ['Trespass Notice', trespassNotices, ['active']],
      ['Parking Violation', parkingViolations, ['issued']],
      ['Criminal Complaint', criminalComplaints, ['submitted']],
      ['Dispatcher Shift Log', dispatcherLogs, ['submitted']],
      ['Use of Force Report', forceReports, ['submitted']],
      ['Confidential Report', confidentialReports, ['new', 'submitted', 'pending']],
      ['Maintenance Report', maintenanceReports, ['reported', 'in_progress']],
      ['Open Door Report', openDoorReports, ['open', 'referred']],
    ];
    const pendingReports = queueRole === 'admin' ? reportSources.flatMap(([label, rows, statuses]: any[]) =>
      (rows || []).filter((row: any) => statuses.includes(normalized(row.status)))
        .map((row: any) => ({ ...row, queue_label: label }))
    ) : [];

    const openReviews = queueRole === 'hr'
      ? (reviews || []).filter((review: any) => normalized(review.workflow_stage) !== 'approved')
      : [];
    const annualDueMissing = queueRole === 'hr' ? (users || []).filter((user: any) => {
      if (!user?.hire_date || user?.termination_date || normalized(user.employment_status) === 'terminated') return false;
      const hire = String(user.hire_date).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!hire || now.year <= Number(hire[1])) return false;
      const due = `${now.year}-${hire[2]}-${hire[3]}`;
      if (due > now.date) return false;
      const key = `annual:${user.id}:${now.year}`;
      return !(reviews || []).some((review: any) => String(review.annual_review_key || '') === key);
    }) : [];

    const candidates: any[] = [];
    for (const shift of missedClockIns) {
      const person = personFor(shift);
      candidates.push({
        id: `missed-clock-${shift.id}`, source_id: String(shift.id), kind: 'missed_clock_in', priority: 'critical',
        title: 'Scheduled Officer Has Not Clocked In', person: person.name,
        detail: `${shift.start_time || 'Start time'} at ${shift.location || 'assigned location'} · over 5 minutes late`,
        page: 'ManageTimeEntries',
      });
    }
    for (const item of lateClockOuts) {
      const person = personFor(item.entry);
      candidates.push({
        id: `late-clock-out-${item.entry.id}`,
        source_id: String(item.entry.id),
        kind: 'late_clock_out',
        priority: 'high',
        title: 'Late Clock-Out Requires Decision',
        person: person.name,
        detail: `${item.lateMinutes} minutes past the scheduled ${item.scheduled.end_time || 'end time'} at ${item.entry.location || item.scheduled.location || 'assigned location'} · approve or reject payroll treatment`,
        page: 'ManageTimeEntries',
      });
    }
    for (const row of (timeOff || []).filter(isPending)) {
      const person = personFor(row);
      candidates.push({ id: `pto-${row.id}`, source_id: String(row.id), kind: 'pto', priority: 'normal', title: 'PTO / Leave Request', person: person.name, detail: row.reason || 'Request awaiting decision', page: 'AdminPTOApproval' });
    }
    for (const row of openReviews) {
      const person = personFor(row);
      const stage = normalized(row.workflow_stage).replace(/_/g, ' ');
      candidates.push({ id: `review-${row.id}`, source_id: String(row.id), kind: 'performance_review', priority: stage === 'higher reviewer required' ? 'critical' : 'normal', title: 'Performance Review Pending', person: person.name, detail: stage || 'Review workflow requires action', page: 'AdminPerformanceReviews' });
    }
    for (const officer of annualDueMissing) {
      candidates.push({ id: `annual-due-${officer.id}`, source_id: String(officer.id), kind: 'annual_review_due', priority: 'critical', title: 'Annual Review Due', person: displayName(officer), detail: `Review has been due since ${String(officer.hire_date).slice(5)} anniversary`, page: 'AdminPerformanceReviews' });
    }

    for (const entry of missingReports) {
      const person = personFor(entry);
      candidates.push({
        id: `missing-dar-${entry.id}`, source_id: String(entry.id), kind: 'missing_report', priority: 'high',
        title: 'Required Site Report Missing', person: person.name,
        detail: `${easternParts(entry.clock_in).date} · ${entry.location || 'Location not listed'} · ${actualPaidHours(entry).toFixed(2)} worked hours`,
        page: 'AdminReports',
      });
    }
    for (const row of (availability || []).filter(isPending)) {
      const person = personFor(row);
      candidates.push({ id: `availability-${row.id}`, source_id: String(row.id), kind: 'availability', priority: 'normal', title: 'Availability Request', person: person.name, detail: 'Availability or assignment change awaiting scheduling review', page: 'AdminOfficerManagement' });
    }
    for (const row of (accessRequests || []).filter(isPending)) {
      candidates.push({ id: `access-${row.id}`, source_id: String(row.id), kind: 'access', priority: 'high', title: 'Pending User Access', person: row.full_name || row.email || 'New user', detail: `${row.requested_category || 'unsure'} access requested`, page: 'AdminUsers' });
    }
    for (const row of pendingReports) {
      const person = personFor(row);
      candidates.push({ id: `report-${row.queue_label}-${row.id}`, source_id: String(row.id), kind: 'report_review', priority: 'high', title: row.queue_label, person: person.name, detail: row.location || row.report_number || 'Submitted site report awaiting administrative review', page: 'AdminReports' });
    }
    for (const row of (expenseReports || []).filter(isPending)) {
      const person = personFor(row);
      candidates.push({ id: `expense-${row.id}`, source_id: String(row.id), kind: 'expense', priority: 'normal', title: 'Expense Approval', person: person.name, detail: `$${Number(row.amount || 0).toFixed(2)} · ${row.description || row.expense_date || 'Expense awaiting decision'}`, page: 'AdminExpenseApproval' });
    }
    for (const row of (shiftBids || []).filter(isPending)) {
      const person = personFor(row);
      candidates.push({ id: `shift-bid-${row.id}`, source_id: String(row.id), kind: 'shift_bid', priority: 'normal', title: 'Shift Bid Pending', person: person.name, detail: row.shift_name || row.shift_id || 'Open-shift bid awaiting scheduling decision', page: 'AdminShiftBids' });
    }
    for (const row of (specialCoverageRequests || []).filter(isPending)) {
      candidates.push({ id: `special-coverage-${row.id}`, source_id: String(row.id), kind: 'special_coverage', priority: 'high', title: 'Special Coverage Request', person: row.client_email || 'Client request', detail: `${row.location || 'Location pending'} · ${row.start_date || 'Start date pending'}`, page: 'AdminSpecialRequests' });
    }

    const easternWeekday = new Date(`${now.date}T12:00:00Z`).getUTCDay();
    if (queueRole === 'admin' && easternWeekday === 3) {
      const upcomingFriday = addDays(now.date, 2);
      const published = (weekStatuses || []).some((row: any) =>
        String(row.week_start_date || '') === upcomingFriday && row.is_ready === true
      );
      if (!published) {
        candidates.push({
          id: `weekly-schedule-${upcomingFriday}`, source_id: upcomingFriday, kind: 'weekly_schedule', priority: 'high',
          title: 'Publish Upcoming Schedule', person: 'Administrative Scheduling',
          detail: `Review staffing and publish the week beginning ${upcomingFriday}`,
          page: 'AdminScheduling',
        });
      }
    }

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 };
    candidates.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    const stateByKey = new Map(roleStates.map((state: any) => [String(state.task_key), state]));
    const candidateKeys = new Set(candidates.map(task => String(task.id)));
    const observedAt = new Date().toISOString();

    await settleLimited(candidates.filter(task => !stateByKey.has(String(task.id))).map(task => () =>
      base44.asServiceRole.entities.WorkQueueState.create({
        task_key: String(task.id),
        queue_role: queueRole,
        status: 'open',
        title: String(task.title || '').slice(0, 250),
        person: String(task.person || '').slice(0, 250),
        source_kind: String(task.kind || '').slice(0, 100),
        source_id: String(task.source_id || '').slice(0, 250),
        last_seen_at: observedAt,
      })
    ));

    await settleLimited(candidates.filter(task =>
      normalized(stateByKey.get(String(task.id))?.status) === 'auto_completed'
    ).map(task => () =>
      base44.asServiceRole.entities.WorkQueueState.update(stateByKey.get(String(task.id)).id, {
        status: 'open',
        last_seen_at: observedAt,
      })
    ));

    if (loadErrors.length === 0) {
      await settleLimited(roleStates.filter((state: any) =>
        normalized(state.status) === 'open' && !candidateKeys.has(String(state.task_key))
      ).map((state: any) => () =>
        base44.asServiceRole.entities.WorkQueueState.update(state.id, {
          status: 'auto_completed',
          completed_at: observedAt,
          completed_by: 'system',
          completion_note: 'Automatically completed because the underlying record no longer requires action.',
          last_seen_at: observedAt,
        })
      ));
    }

    const tasks = candidates.filter(task => {
      const state = stateByKey.get(String(task.id));
      return normalized(state?.status) !== 'completed';
    });
    const recentCompleted = roleStates
      .filter((state: any) => normalized(state.status) === 'completed'
        || (normalized(state.status) === 'auto_completed' && !candidateKeys.has(String(state.task_key))))
      .sort((a: any, b: any) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')))
      .slice(0, 12);

    const countKind = (kind: string) => tasks.filter(task => task.kind === kind).length;
    return Response.json({
      success: true,
      generated_at: observedAt,
      role: queueRole,
      queue_name: queueRole === 'hr' ? 'HR workforce queue' : 'Administrative site and access queue',
      load_errors: loadErrors,
      tasks,
      recently_completed: recentCompleted,
      counts: {
        total: tasks.length,
        missed_clock_ins: countKind('missed_clock_in'),
        late_clock_outs: countKind('late_clock_out'),
        missing_reports: countKind('missing_report'),
        pending_reports: countKind('report_review'),
        time_off: countKind('pto'),
        availability: countKind('availability'),
        access_requests: countKind('access'),
        performance_reviews: countKind('performance_review'),
        annual_reviews_due: countKind('annual_review_due'),
        expenses: countKind('expense'),
        shift_bids: countKind('shift_bid'),
        special_coverage: countKind('special_coverage'),
        weekly_schedule: countKind('weekly_schedule'),
        clocked_in: activeEntries.length,
        active_employees: (users || []).filter((user: any) => !user.termination_date).length,
      },
      active_entries: activeEntries,
      employees: users || [],
    });
  } catch (error) {
    console.error('getRoleWorkQueue failed', error);
    return Response.json({ error: error?.message || 'Unable to load the work queue' }, { status: 500 });
  }
});
