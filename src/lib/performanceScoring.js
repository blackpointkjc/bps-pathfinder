const EASTERN_TIME_ZONE = 'America/New_York';

export const emailKey = value => String(value || '').trim().toLowerCase();

function dateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

export function easternDateKey(value) {
  const p = dateParts(value);
  return p ? `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` : '';
}

export function easternTimeKey(value) {
  const p = dateParts(value);
  return p ? `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` : '';
}

function wallClockMinute(dateKey, timeKey) {
  if (!dateKey || !timeKey) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = timeKey.split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 60000) + hh * 60 + mm;
}

export function matchTimeEntryToSchedule(entry, schedules = []) {
  if (!entry?.clock_in) return null;
  const email = emailKey(entry.officer_email);
  const clockDate = easternDateKey(entry.clock_in);
  const clockTime = easternTimeKey(entry.clock_in);
  const clockWall = wallClockMinute(clockDate, clockTime);
  if (clockWall == null) return null;

  const candidates = schedules
    .filter(s => emailKey(s.officer_email) === email && s.archived !== true && s.is_open !== true && s.shift_date && s.start_time && s.end_time)
    .map(schedule => {
      let start = wallClockMinute(schedule.shift_date, schedule.start_time);
      let end = wallClockMinute(schedule.shift_date, schedule.end_time);
      if (start == null || end == null) return null;
      if (end <= start) end += 1440;
      const inside = clockWall >= start && clockWall < end;
      const distance = Math.abs(clockWall - start);
      // Keep a broad window for genuinely late/early punches, but do not pair a punch
      // to an unrelated shift simply because it shares a calendar date.
      const plausible = clockWall >= start - 360 && clockWall <= end + 360;
      return plausible ? { schedule, start, end, inside, distance } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.inside !== b.inside) return a.inside ? -1 : 1;
      return a.distance - b.distance;
    });

  return candidates[0]?.schedule || null;
}

export function calculatePunctuality(timeEntries = [], schedules = [], monthStart, monthEnd) {
  const details = [];
  let onTime = 0;
  let late = 0;

  for (const entry of timeEntries) {
    if (!entry?.clock_in) continue;
    const localDate = easternDateKey(entry.clock_in);
    if (!localDate || (monthStart && localDate < monthStart) || (monthEnd && localDate > monthEnd)) continue;
    const schedule = matchTimeEntryToSchedule(entry, schedules);
    if (!schedule) continue;

    const actual = easternTimeKey(entry.clock_in);
    const actualWall = wallClockMinute(localDate, actual);
    const scheduledWall = wallClockMinute(schedule.shift_date, schedule.start_time);
    if (actualWall == null || scheduledWall == null) continue;
    const minutesLate = Math.max(0, actualWall - scheduledWall);
    const status = minutesLate <= 5 ? 'on_time' : 'late';
    if (status === 'on_time') onTime++; else late++;
    details.push({
      status,
      shift_date: schedule.shift_date,
      scheduled_start: schedule.start_time,
      actual_clock_in: actual,
      minutes_late: minutesLate,
      location: schedule.location || '',
      schedule_id: schedule.id,
      time_entry_id: entry.id,
    });
  }

  const total = onTime + late;
  return { rate: total ? Math.round((onTime / total) * 100) : null, onTime, late, total, details };
}

export function calculateBidStanding(bids = [], monthStart, monthEnd) {
  const monthly = bids.filter(bid => {
    const date = easternDateKey(bid.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd);
  });
  const accepted = monthly.filter(b => b.status === 'accepted').length;
  const rejected = monthly.filter(b => b.status === 'rejected').length;
  const pending = monthly.filter(b => b.status === 'pending').length;
  const withdrawn = monthly.filter(b => b.status === 'withdrawn').length;
  const scoredTotal = accepted + rejected + pending;
  // Pending means management has not decided the bid. It is neutral, not a failure.
  const score = scoredTotal ? Math.round(((accepted + pending) / scoredTotal) * 100) : null;
  return { total: monthly.length, scoredTotal, accepted, rejected, pending, withdrawn, score };
}

export function calculateClientFeedback(feedback = [], monthStart, monthEnd) {
  const monthly = feedback.filter(item => {
    const date = item.shift_date || easternDateKey(item.feedback_date || item.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd) && Number(item.rating) > 0;
  });
  const avgRating = monthly.length ? monthly.reduce((sum, item) => sum + Number(item.rating || 0), 0) / monthly.length : null;
  const score = avgRating == null ? null : Math.round((avgRating / 5) * 100);
  const positive = monthly.filter(item => item.commendation === true || Number(item.rating) >= 4).length;
  const complaints = monthly.filter(item => item.complaint === true).length;
  return { count: monthly.length, avgRating, score, positive, complaints, items: monthly };
}

export function calculateSupervisorRating(reviews = [], monthStart, monthEnd) {
  const monthly = reviews.filter(review => {
    const date = review.review_date || easternDateKey(review.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd) && Number(review.overall_rating) > 0;
  });
  const avgRating = monthly.length ? monthly.reduce((sum, review) => sum + Number(review.overall_rating || 0), 0) / monthly.length : null;
  return { count: monthly.length, avgRating, score: avgRating == null ? null : Math.round((avgRating / 5) * 100), items: monthly };
}

export function calculateRecognition(commendations = [], feedback = [], monthStart, monthEnd) {
  const monthlyCommendations = commendations.filter(item => {
    const date = easternDateKey(item.commendation_date || item.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd);
  });
  const positiveFeedback = feedback.filter(item => {
    const date = item.shift_date || easternDateKey(item.feedback_date || item.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd) && (item.commendation === true || Number(item.rating) >= 4);
  });
  const points = monthlyCommendations.reduce((sum, item) => sum + Number(item.points_awarded || 1), 0);
  const count = monthlyCommendations.length + positiveFeedback.length;
  // Recognition can lift the overall score when it exists; absence of recognition is never a deduction.
  return { count, points, commendations: monthlyCommendations, positiveFeedback, score: count ? 100 : null };
}

export function buildOverallPerformance({ punctuality, trainingScore = null, qrScore = null, bidStanding, clientFeedback, supervisorRating, recognition }) {
  const categories = [];
  if (punctuality?.rate != null && punctuality.total > 0) categories.push({ label: 'On-Time Arrival', score: punctuality.rate });
  if (trainingScore != null) categories.push({ label: 'Training Completion', score: Math.round(trainingScore) });
  if (qrScore != null) categories.push({ label: 'QR Patrol Completion', score: Math.round(qrScore) });
  if (bidStanding?.score != null && bidStanding.scoredTotal > 0) categories.push({ label: 'Bid Standing', score: bidStanding.score });
  if (clientFeedback?.score != null && clientFeedback.count > 0) categories.push({ label: 'Client Feedback', score: clientFeedback.score });
  if (supervisorRating?.score != null && supervisorRating.count > 0) categories.push({ label: 'Supervisor Rating', score: supervisorRating.score });
  if (recognition?.score != null && recognition.count > 0) categories.push({ label: 'Recognition', score: recognition.score });
  const score = categories.length ? Math.round(categories.reduce((sum, item) => sum + item.score, 0) / categories.length) : null;
  return { score, categories };
}
