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
    const hasAccess = me.role === 'admin' || roles.has('hr') || roles.has('full_access')
      || normalized(me.rank) === 'human resources';
    if (!hasAccess) return Response.json({ error: 'HR or administrator access required' }, { status: 403 });

    const [
      users, schedules, entries, dailyReports, timeOff, availability, accessRequests, reviews,
      shiftReports, incidentReports, trespassNotices, parkingViolations, criminalComplaints,
      dispatcherLogs, forceReports,
    ] = await Promise.all([
      base44.asServiceRole.entities.User.list('-updated_date', 5000),
      base44.asServiceRole.entities.Schedule.list('-shift_date', 5000),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 5000),
      base44.asServiceRole.entities.DailyActivityReport.list('-report_date', 5000),
      base44.asServiceRole.entities.TimeOffRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.AvailabilityRequest.list('-requested_at', 1000),
      base44.asServiceRole.entities.AccessRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.PerformanceReview.list('-review_date', 5000),
      base44.asServiceRole.entities.ShiftReport.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.IncidentReport.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.TrespassingNotice.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.ParkingViolation.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.CriminalComplaint.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.DispatcherShiftReport.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.UseOfForceReport.list('-created_date', 1000).catch(() => []),
    ]);

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
    const today'sEntries = (entries || []).filter((entry: any) => easternParts(entry.clock_in).date === now.date && entry.archived !== true);
    const missedClockIns = (schedules || []).filter((shift: any) => {
      if (shift.archived === true || shift.is_open === true || normalized(shift.officer_email) === 'open') return false;
      if (String(shift.shift_date || '') !== now.date) return false;
      const start = parseWallMinutes(shift.start_time);
      if (start < 0 || start > fiveMinutesAgo) return false;
      return !today'sEntries.some((entry: any) => {
        if (normalized(entry.officer_email) !== normalized(shift.officer_email)) return false;
        const entryMinute = easternParts(entry.clock_in).minutes;
        const sameLocation = normalized(entry.location) === normalized(shift.location);
        return sameLocation || Math.abs(entryMinute - start) <= 240;
      });
    });

    const reportByShift = new Set((dailyReports || []).map((report: any) => String(report.shift_id || '')).filter(Boolean));
    const legacyReportKeys = new Set((dailyReports || []).map((report: any) =>
      `${normalized(report.officer_email || report.created_by)}|${String(report.report_date || '')}|${normalized(report.location)}`
    ));
    const recentCutoff = Date.now() - 21 * 86400000;
    const missingReports = (entries || []).filter((entry: any) => {
      if (!entry.clock_in || !entry.clock_out || entry.archived === true) return false;
      if (new Date(entry.clock_out).getTime() < recentCutoff) return false;
      if (reportByShift.has(String(entry.id))) return false;
      const key = `${normalized(entry.officer_email)}|${easternParts(entry.clock_in).date}|${normalized(entry.location)}`;
      return !legacyReportKeys.has(key);
    });

    const reportSources = [
      ['Shift Report', shiftReports, ['submitted']],
      ['Daily Activity Report', dailyReports, ['submitted']],
      ['Incident Report', incidentReports, ['submitted', 'pending']],
      ['Trespass Notice', trespassNotices, ['active']],
      ['Parking Violation', parkingViolations, ['issued']],
      ['Criminal Complaint', criminalComplaints, ['submitted']],
      ['Dispatcher Shift Log', dispatcherLogs, ['submitted']],
      ['Use of Force Report', forceReports, ['submitted']],
    ];
    const pendingReports = reportSources.flatMap(([label, rows, statuses]: any[]) =>
      (rows || []).filter((row: any) => statuses.includes(normalized(row.status)))
        .map((row: any) => ({ ...row, queue_label: label }))
    );

    const openReviews = (reviews || []).filter((review: any) => normalized(review.workflow_stage) !== 'approved');
    const annualDueMissing = (users || []).filter((user: any) => {
      if (!user?.hire_date || user?.termination_date || normalized(user.employment_status) === 'terminated') return false;
      const hire = String(user.hire_date).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!hire || now.year <= Number(hire[1])) return false;
      const due = `${now.year}-${hire[2]}-${hire[3]}`;
      if (due > now.date) return false;
      const key = `annual:${user.id}:${now.year}`;
      return !(reviews || []).some((review: any) => String(review.annual_review_key || '') === key);
    });

    const tasks: any[] = [];
    for (const shift of missedClockIns) {
      const person = personFor(shift);
      tasks.push({
        id: `missed-clock-${shift.id}`, kind: 'missed_clock_in', priority: 'critical',
        title: 'Scheduled Officer Has Not Clocked In', person: person.name,
        detail: `${shift.start_time || 'Start time'} at ${shift.location || 'assigned location'} · over 5 minutes late`,
        page: 'ManageTimeEntries',
      });
    }
    for (const entry of missingReports) {
      const person = personFor(entry);
      tasks.push({
        id: `missing-dar-${entry.id}`, kind: 'missing_report', priority: 'high',
        title: 'Required Daily Report Missing', person: person.name,
        detail: `${easternParts(entry.clock_in).date} · ${entry.location || 'Location not listed'} · ${actualPaidHours(entry).toFixed(2)} worked hours`,
        page: 'MissingReportsCheck',
      });
    }
    for (const row of (timeOff || []).filter(isPending)) {
      const person = personFor(row);
      tasks.push({ id: `pto-${row.id}`, kind: 'pto', priority: 'normal', title: 'PTO / Leave Request', person: person.name, detail: row.reason || 'Request awaiting decision', page: 'AdminPTOApproval' });
    }
    for (const row of (availability || []).filter(isPending)) {
      const person = personFor(row);
      tasks.push({ id: `availability-${row.id}`, kind: 'availability', priority: 'normal', title: 'Availability Request', person: person.name, detail: 'Availability or assignment change awaiting decision', page: 'AdminOfficerManagement' });
    }
    for (const row of (accessRequests || []).filter(isPending)) {
      tasks.push({ id: `access-${row.id}`, kind: 'access', priority: 'high', title: 'Pending User Access', person: row.full_name || row.email || 'New user', detail: `${row.requested_category || 'unsure'} access requested`, page: 'AdminUserManagement' });
    }
    for (const row of pendingReports) {
      const person = personFor(row);
      tasks.push({ id: `report-${row.queue_label}-${row.id}`, kind: 'report_review', priority: 'high', title: row.queue_label, person: person.name, detail: row.location || row.report_number || 'Submitted report awaiting review', page: 'AdminReports' });
    }
    for (const row of openReviews) {
      const person = personFor(row);
      const stage = normalized(row.workflow_stage).replace(/_/g, ' ');
      tasks.push({ id: `review-${row.id}`, kind: 'performance_review', priority: stage === 'higher reviewer required' ? 'critical' : 'normal', title: 'Performance Review Pending', person: person.name, detail: stage || 'Review workflow requires action', page: 'AdminPerformanceReviews' });
    }
    for (const officer of annualDueMissing) {
      tasks.push({ id: `annual-due-${officer.id}`, kind: 'annual_review_due', priority: 'critical', title: 'Annual Review Due', person: displayName(officer), detail: `Review has been due since ${String(officer.hire_date).slice(5)} anniversary`, page: 'AdminPerformanceReviews' });
    }

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 };
    tasks.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    return Response.json({
      success: true,
      generated_at: new Date().toISOString(),
      role: me.role === 'admin' ? 'admin' : 'hr',
      tasks,
      counts: {
        total: tasks.length,
        missed_clock_ins: missedClockIns.length,
        missing_reports: missingReports.length,
        pending_reports: pendingReports.length,
        time_off: (timeOff || []).filter(isPending).length,
        availability: (availability || []).filter(isPending).length,
        access_requests: (accessRequests || []).filter(isPending).length,
        performance_reviews: openReviews.length,
        annual_reviews_due: annualDueMissing.length,
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
