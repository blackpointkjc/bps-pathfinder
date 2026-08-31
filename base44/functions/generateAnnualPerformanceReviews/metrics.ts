const TIME_ZONE = 'America/New_York';
const DAY_MINUTES = 1440;

const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function dateParts(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') % 24, minute: read('minute') };
}

export function easternDateKey(value: unknown) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = dateParts(value);
  return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : '';
}

function easternTimeKey(value: unknown) {
  const parts = dateParts(value);
  return parts ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : '';
}

function wallMinute(dateKey: string, timeKey: string) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  const match = String(timeKey || '').match(/^(\d{1,2}):(\d{2})/);
  if (![year, month, day].every(Number.isFinite) || !match) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 60000) + Number(match[1]) * 60 + Number(match[2]);
}

function inPeriod(value: unknown, start: string, end: string) {
  const key = easternDateKey(value);
  return Boolean(key && key >= start && key <= end);
}

function identityEmails(officer: any, teams: any[], outlook: any[]) {
  const values = [
    officer?.email,
    officer?.work_email,
    officer?.pathfinder_email,
    officer?.microsoft_email,
    officer?.outlook_email,
    ...(Array.isArray(officer?.email_aliases) ? officer.email_aliases : []),
  ];
  for (const row of teams || []) {
    if (String(row?.user_id || '') === String(officer?.id || '') || emailKey(row?.pathfinder_email) === emailKey(officer?.email)) {
      values.push(row?.pathfinder_email, row?.microsoft_email);
    }
  }
  for (const row of outlook || []) {
    if (String(row?.user_id || '') === String(officer?.id || '') || emailKey(row?.pathfinder_email) === emailKey(officer?.email)) {
      values.push(row?.pathfinder_email, row?.outlook_email);
    }
  }
  return new Set(values.map(emailKey).filter(Boolean));
}

function recordMatchesEmail(record: any, aliases: Set<string>, fields = ['officer_email']) {
  return fields.some(field => aliases.has(emailKey(record?.[field])));
}

function reportAuthoredBy(report: any, officer: any, aliases: Set<string>) {
  return Boolean(
    (officer?.id && [report?.created_by_id, report?.primary_officer_id].some(value => String(value || '') === String(officer.id))) ||
    recordMatchesEmail(report, aliases, ['officer_email', 'created_by', 'created_by_email'])
  );
}

function incidentWall(report: any) {
  const date = String(report?.incident_date || '').slice(0, 10);
  const match = String(report?.incident_time || report?.discovered_time || '').match(/\b(\d{1,2}):(\d{2})\b/);
  return date && match ? wallMinute(date, `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`) : null;
}

function incidentExcuses(incidents: any[], officer: any, aliases: Set<string>, windowStart: number, windowEnd: number) {
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) return false;
  return incidents.some(report => {
    const status = String(report?.status || '').toLowerCase();
    if (!reportAuthoredBy(report, officer, aliases) || status === 'draft' || status === 'rejected') return false;
    const incident = incidentWall(report);
    return incident != null && [incident - DAY_MINUTES, incident, incident + DAY_MINUTES]
      .some(candidate => candidate >= windowStart && candidate <= windowEnd);
  });
}

function breakMinutes(entry: any) {
  return (entry?.break_periods || []).reduce((total: number, period: any) => {
    const start = new Date(String(period?.start || '')).getTime();
    const end = new Date(String(period?.end || '')).getTime();
    return total + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : 0);
  }, 0);
}

function ratingFromScore(score: number | null, neutral = 3) {
  if (score == null || !Number.isFinite(score)) return neutral;
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  if (score >= 60) return 2;
  return 1;
}

function inspectionScore(value: unknown) {
  const key = String(value || '').toLowerCase();
  if (key === 'excellent') return 100;
  if (key === 'satisfactory') return 80;
  if (key === 'needs_improvement') return 55;
  if (key === 'unsatisfactory') return 25;
  return null;
}

function payRangeForRank(rank: unknown) {
  const key = String(rank || '').toLowerCase();
  if (key.includes('colonel') || key.includes('major')) return { min: 27.5, max: 27.5 };
  if (key.includes('captain')) return { min: 25, max: 27 };
  if (key.includes('lieutenant')) return { min: 24, max: 26 };
  if (key.includes('first sergeant')) return { min: 23, max: 25 };
  if (key.includes('sergeant')) return { min: 22, max: 24 };
  if (key.includes('corporal')) return { min: 21, max: 23 };
  if (key.includes('senior')) return { min: 20.5, max: 22.5 };
  if (key === 'officer') return { min: 19.5, max: 21.5 };
  return { min: 18, max: 20 };
}

function suggestedPay(overall: number, current: number, range: { min: number; max: number }) {
  const midpoint = (range.min + range.max) / 2;
  if (overall >= 5) return Math.min(current * 1.05, range.max);
  if (overall >= 4) return Math.min(current * 1.03, (midpoint + range.max) / 2);
  if (overall >= 3) return Math.min(current * 1.02, midpoint);
  return current;
}

async function safeList(base44: any, entityName: string, sort?: string, limit = 5000) {
  try {
    const entity = base44.asServiceRole.entities?.[entityName];
    return entity?.list ? await entity.list(sort, limit) : [];
  } catch {
    return [];
  }
}

export async function loadPerformanceMetricData(base44: any) {
  const [
    teams, outlook, timeEntries, schedules, incidents, commendations,
    complaints, inspections, writeUps,
  ] = await Promise.all([
    safeList(base44, 'MicrosoftTeamsIdentity', '-updated_at', 2000),
    safeList(base44, 'OutlookMailboxLink', '-last_verified_at', 2000),
    safeList(base44, 'TimeEntry', '-clock_in'),
    safeList(base44, 'Schedule', '-shift_date'),
    safeList(base44, 'IncidentReport', '-incident_date'),
    safeList(base44, 'Commendation', '-commendation_date'),
    safeList(base44, 'Complaint', '-complaint_date'),
    safeList(base44, 'InspectionReport', '-inspection_date'),
    safeList(base44, 'WriteUpReport', '-report_date'),
  ]);

  return { teams, outlook, timeEntries, schedules, incidents, commendations, complaints, inspections, writeUps };
}

export async function buildPerformanceMetrics(base44: any, officer: any, start: string, end: string, metricData: any = null) {
  if (!officer?.id || !start || !end || start > end) throw new Error('Officer and a valid review period are required.');

  const data = metricData || await loadPerformanceMetricData(base44);
  const {
    teams = [], outlook = [], timeEntries = [], schedules = [], incidents = [],
    commendations = [], complaints = [], inspections = [], writeUps = [],
  } = data;

  const aliases = identityEmails(officer, teams, outlook);
  const officerEntries = timeEntries.filter((row: any) => recordMatchesEmail(row, aliases) && row.archived !== true && row.clock_in && inPeriod(row.clock_in, start, end));
  const completedEntries = officerEntries.filter((row: any) => row.clock_out);
  const officerSchedules = schedules.filter((row: any) =>
    recordMatchesEmail(row, aliases) && row.archived !== true && row.is_open !== true &&
    row.shift_date >= start && row.shift_date <= end && row.start_time && row.end_time
  );
  const officerIncidents = incidents.filter((row: any) => reportAuthoredBy(row, officer, aliases));
  const periodCommendations = commendations.filter((row: any) => recordMatchesEmail(row, aliases) && inPeriod(row.commendation_date || row.created_date, start, end));
  const periodComplaints = complaints.filter((row: any) => recordMatchesEmail(row, aliases) && row.exclude_from_performance_review !== true && inPeriod(row.complaint_date || row.created_date, start, end));
  const periodInspections = inspections.filter((row: any) => recordMatchesEmail(row, aliases) && row.exclude_from_performance_review !== true && inPeriod(row.inspection_date || row.created_date, start, end));
  const periodWriteUps = writeUps.filter((row: any) => recordMatchesEmail(row, aliases) && row.status === 'approved' && row.exclude_from_performance_review !== true && inPeriod(row.report_date || row.created_date, start, end));

  const used = new Set<string>();
  const punctualityDetails: any[] = [];
  let onTime = 0;
  let violations = 0;
  let missed = 0;
  const now = dateParts(new Date());
  const nowWall = now ? wallMinute(`${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`, `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`) : null;

  for (const schedule of officerSchedules) {
    let scheduledStart = wallMinute(schedule.shift_date, schedule.start_time);
    let scheduledEnd = wallMinute(schedule.shift_date, schedule.end_time);
    if (scheduledStart == null || scheduledEnd == null) continue;
    if (scheduledEnd <= scheduledStart) scheduledEnd += DAY_MINUTES;
    if (nowWall == null || scheduledEnd > nowWall) continue;

    const candidates = completedEntries
      .filter((entry: any) => !used.has(String(entry.id || '')))
      .map((entry: any) => {
        const actual = wallMinute(easternDateKey(entry.clock_in), easternTimeKey(entry.clock_in));
        return { entry, actual, distance: actual == null ? Infinity : Math.abs(actual - scheduledStart!) };
      })
      .filter((item: any) => item.actual >= scheduledStart! - 360 && item.actual <= scheduledEnd! + 360)
      .sort((a: any, b: any) => a.distance - b.distance);

    const entry = candidates[0]?.entry;
    if (!entry) {
      missed += 1;
      punctualityDetails.push({ schedule_id: schedule.id, shift_date: schedule.shift_date, status: 'missed' });
      continue;
    }
    used.add(String(entry.id || ''));
    const actualStart = wallMinute(easternDateKey(entry.clock_in), easternTimeKey(entry.clock_in))!;
    const actualEnd = wallMinute(easternDateKey(entry.clock_out), easternTimeKey(entry.clock_out))!;
    const minutesLate = Math.max(0, actualStart - scheduledStart);
    const minutesEarly = Math.max(0, scheduledStart - actualStart);
    const minutesLateOut = Math.max(0, actualEnd - scheduledEnd);
    const earlyException = minutesEarly > 10 && incidentExcuses(officerIncidents, officer, aliases, actualStart, scheduledStart);
    const lateException = minutesLateOut > 10 && incidentExcuses(officerIncidents, officer, aliases, scheduledEnd, actualEnd);
    const performanceException = entry.performance_exception === true;
    const arrivalViolation = minutesLate > 5;
    const earlyViolation = minutesEarly > 10 && !earlyException;
    const lateOutViolation = minutesLateOut > 10
      && entry.performance_overage_counted === true
      && !performanceException
      && !lateException;
    const compliant = !arrivalViolation && !earlyViolation && !lateOutViolation;
    if (compliant) onTime += 1; else violations += 1;
    punctualityDetails.push({
      schedule_id: schedule.id,
      time_entry_id: entry.id,
      shift_date: schedule.shift_date,
      status: compliant ? 'on_time' : 'violation',
      minutes_late: minutesLate,
      minutes_early: minutesEarly,
      late_clock_out_minutes: minutesLateOut,
      early_incident_exception: earlyException,
      late_incident_exception: lateException,
      performance_exception: performanceException,
      performance_overage_counted: entry.performance_overage_counted === true,
    });
  }

  const scoredShifts = onTime + violations + missed;
  const onTimePercentage = scoredShifts ? Math.round((onTime / scoredShifts) * 100) : null;
  const totalHours = completedEntries.reduce((sum: number, entry: any) => {
    const startMs = new Date(entry.clock_in).getTime();
    const endMs = new Date(entry.clock_out).getTime();
    const minutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? Math.max(0, (endMs - startMs) / 60000 - breakMinutes(entry))
      : 0;
    return sum + minutes / 60;
  }, 0);

  const sustainedComplaints = periodComplaints.filter((row: any) => row.investigation_status === 'sustained').length;
  const uniformScores = periodInspections.map((row: any) => inspectionScore(row.uniform_appearance)).filter((value: any) => value != null);
  const professionalScores = periodInspections.map((row: any) => inspectionScore(row.professionalism)).filter((value: any) => value != null);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const conductScore = clamp(80 + periodCommendations.length * 5 - sustainedComplaints * 15 - periodWriteUps.length * 12);
  const professionalismScore = average(professionalScores as number[]) == null ? conductScore : clamp((average(professionalScores as number[])! + conductScore) / 2);
  const uniformScore = average(uniformScores as number[]);
  const initiativeScore = clamp(75 + periodCommendations.length * 6 - periodWriteUps.length * 10);

  const suggestedRatings = {
    punctuality_rating: ratingFromScore(onTimePercentage),
    professionalism_rating: ratingFromScore(professionalismScore),
    uniform_appearance_rating: ratingFromScore(uniformScore),
    communication_rating: 3,
    initiative_rating: ratingFromScore(initiativeScore),
  };
  const ratingValues = Object.values(suggestedRatings) as number[];
  const overallRating = round(ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length, 1);
  const performanceScore = Math.round(overallRating * 20);
  const payRange = payRangeForRank(officer.rank);
  const currentRate = Number(officer.hourly_rate || 0);

  return {
    officer_id: officer.id,
    officer_email: officer.email,
    officer_name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
    review_period_start: start,
    review_period_end: end,
    performance_score: performanceScore,
    suggested_ratings: { ...suggestedRatings, overall_rating: overallRating },
    commendations_count: periodCommendations.length,
    complaints_count: periodComplaints.length,
    sustained_complaints_count: sustainedComplaints,
    inspections_count: periodInspections.length,
    writeups_count: periodWriteUps.length,
    hours_worked: round(totalHours, 1),
    on_time_percentage: onTimePercentage,
    punctuality: { on_time: onTime, violations, missed, total: scoredShifts, details: punctualityDetails },
    current_hourly_rate: currentRate,
    suggested_hourly_rate: round(suggestedPay(overallRating, currentRate, payRange), 2),
    pay_range_min: payRange.min,
    pay_range_max: payRange.max,
    aliases_checked: Array.from(aliases),
  };
}

export function reviewPayloadFromMetrics(metrics: any, fields: any = {}) {
  const numberRating = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.min(5, numeric)) : fallback;
  };
  const ratings = metrics.suggested_ratings || {};
  return {
    officer_id: metrics.officer_id,
    officer_email: metrics.officer_email,
    officer_name: metrics.officer_name,
    review_period_start: metrics.review_period_start,
    review_period_end: metrics.review_period_end,
    professionalism_rating: numberRating(fields.professionalism_rating, ratings.professionalism_rating),
    punctuality_rating: numberRating(fields.punctuality_rating, ratings.punctuality_rating),
    uniform_appearance_rating: numberRating(fields.uniform_appearance_rating, ratings.uniform_appearance_rating),
    communication_rating: numberRating(fields.communication_rating, ratings.communication_rating),
    initiative_rating: numberRating(fields.initiative_rating, ratings.initiative_rating),
    overall_rating: numberRating(fields.overall_rating, ratings.overall_rating),
    strengths: String(fields.strengths || ''),
    areas_for_improvement: String(fields.areas_for_improvement || ''),
    goals: String(fields.goals || ''),
    supervisor_notes: String(fields.supervisor_notes || ''),
    pay_effective_date: fields.pay_effective_date || undefined,
    commendations_count: metrics.commendations_count,
    complaints_count: metrics.complaints_count,
    inspections_count: metrics.inspections_count,
    writeups_count: metrics.writeups_count,
    hours_worked: metrics.hours_worked,
    on_time_percentage: metrics.on_time_percentage,
    current_hourly_rate: metrics.current_hourly_rate,
    suggested_hourly_rate: metrics.suggested_hourly_rate,
    pay_range_min: metrics.pay_range_min,
    pay_range_max: metrics.pay_range_max,
    performance_score: metrics.performance_score,
    performance_snapshot: metrics,
    supervisor_review_pending: true,
    supervisor_review_completed: false,
    officer_acknowledged: false,
  };
}