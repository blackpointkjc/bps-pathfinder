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
  // Only a bid that actually results in the officer receiving the shift is scoreable.
  // Pending bids and admin non-selection/rejection are neutral and do not lower performance.
  const scoredTotal = accepted;
  const score = accepted > 0 ? 100 : null;
  return { total: monthly.length, scoredTotal, accepted, rejected, pending, withdrawn, score };
}

export function calculateTrainingScore(user, modules = [], completions = [], assignments = []) {
  if (!user?.email) return { completed: 0, pending: 0, total: 0, percentage: null, pendingNames: [] };
  const assignedModules = modules.filter(module => module.active !== false && (
    (module.assigned_to || []).some(email => emailKey(email) === emailKey(user.email)) ||
    (module.assigned_divisions || []).includes(user.division) ||
    (module.assigned_ranks || []).includes(user.rank) ||
    module.required === true
  ));
  const completedIds = new Set(completions.filter(item => item.completed && emailKey(item.officer_email) === emailKey(user.email)).map(item => String(item.training_module_id)));
  const moduleCompleted = assignedModules.filter(module => completedIds.has(String(module.id))).length;
  const officerAssignments = assignments.filter(item => emailKey(item.officer_email) === emailKey(user.email));
  const assignmentApproved = officerAssignments.filter(item => item.status === 'approved').length;
  const assignmentPending = officerAssignments.filter(item => item.status !== 'approved').length;
  const completed = moduleCompleted + assignmentApproved;
  const total = assignedModules.length + officerAssignments.length;
  const pending = Math.max(0, total - completed);
  const pendingNames = [
    ...assignedModules.filter(module => !completedIds.has(String(module.id))).map(module => module.title || 'Training module'),
    ...officerAssignments.filter(item => item.status !== 'approved').map(item => `${item.training_name || 'Compliance item'} (${String(item.status || 'pending').replaceAll('_', ' ')})`),
  ];
  return { completed, pending, total, percentage: total ? Math.round((completed / total) * 100) : null, assignmentApproved, assignmentPending, complianceApproved: assignmentApproved, compliancePending: assignmentPending, pendingNames };
}

export function calculateQrPatrol(timeEntries = [], scans = [], checkpoints = [], monthStart, monthEnd) {
  const completedEntries = timeEntries.filter(entry => entry.clock_in && entry.clock_out && (!monthStart || easternDateKey(entry.clock_in) >= monthStart) && (!monthEnd || easternDateKey(entry.clock_in) <= monthEnd));
  const siteKey = value => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
  const scansInWorkedTime = scans.filter(scan => {
    const stamp = new Date(scan.scanned_at).getTime();
    const localDate = scan.scanned_date || easternDateKey(scan.scanned_at);
    if (!Number.isFinite(stamp) || (monthStart && localDate < monthStart) || (monthEnd && localDate > monthEnd)) return false;
    return completedEntries.some(entry => stamp >= new Date(entry.clock_in).getTime() && stamp <= new Date(entry.clock_out).getTime());
  });

  let completedRounds = 0;
  let missedRounds = 0;
  completedEntries.forEach(entry => {
    const start = new Date(entry.clock_in);
    const end = new Date(entry.clock_out);
    const site = siteKey(entry.location);
    const required = checkpoints.filter(cp => cp.is_active !== false && cp.is_required !== false && siteKey(cp.property_site) === site);
    if (!required.length) return;
    const shiftScans = scansInWorkedTime.filter(scan => {
      const stamp = new Date(scan.scanned_at);
      return stamp >= start && stamp <= end && siteKey(scan.property_site) === site;
    });
    let windowStart = new Date(start);
    let guard = 0;
    while (windowStart < end && guard < 24) {
      guard++;
      const windowEnd = new Date(Math.min(end.getTime(), windowStart.getTime() + 30 * 60 * 1000));
      const scannedIds = new Set(shiftScans.filter(scan => scan.scan_status === 'success' && new Date(scan.scanned_at) >= windowStart && new Date(scan.scanned_at) <= windowEnd).map(scan => String(scan.checkpoint_id)));
      if (required.every(cp => scannedIds.has(String(cp.id)))) completedRounds++; else missedRounds++;
      windowStart = new Date(windowStart.getTime() + 60 * 60 * 1000);
    }
  });
  const totalRounds = completedRounds + missedRounds;
  return { totalScans: scansInWorkedTime.length, successScans: scansInWorkedTime.filter(scan => scan.scan_status === 'success').length, completedRounds, missedRounds, score: totalRounds ? Math.round((completedRounds / totalRounds) * 100) : null };
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
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd) && item.commendation === true;
  });
  const points = monthlyCommendations.reduce((sum, item) => sum + Number(item.points_awarded || 1), 0);
  const count = monthlyCommendations.length + positiveFeedback.length;
  // Recognition can lift the overall score when it exists; absence of recognition is never a deduction.
  return { count, points, commendations: monthlyCommendations, positiveFeedback, score: count ? 100 : null };
}

const siteKey = value => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();

function propertyForSite(site, locations = []) {
  const key = siteKey(site);
  return locations.find(loc => siteKey(loc.site_name) === key) || null;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const p1 = Number(lat1) * Math.PI / 180;
  const p2 = Number(lat2) * Math.PI / 180;
  const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dLng = (Number(lng2) - Number(lng1)) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat, lng, polygon = []) {
  const pts = (polygon || []).map(point => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point?.lat), Number(point?.lng)]).filter(pair => pair.every(Number.isFinite));
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [latI, lngI] = pts[i];
    const [latJ, lngJ] = pts[j];
    const intersects = ((lngI > lng) !== (lngJ > lng)) && (lat < ((latJ - latI) * (lng - lngI)) / ((lngJ - lngI) || Number.EPSILON) + latI);
    if (intersects) inside = !inside;
  }
  return inside;
}

function callMatchesProperty(call, site, locations = []) {
  if (call?.property_site && siteKey(call.property_site) === siteKey(site)) return true;
  const property = propertyForSite(site, locations);
  if (!property) return false;
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const polygon = property.property_monitoring_polygon?.length >= 3 ? property.property_monitoring_polygon : property.geofence_polygon;
    if (String(property.property_monitoring_boundary_type || '').toLowerCase() === 'polygon' && Array.isArray(polygon) && polygon.length >= 3) {
      if (pointInPolygon(lat, lng, polygon)) return true;
    }
    if (Number.isFinite(Number(property.latitude)) && Number.isFinite(Number(property.longitude))) {
      const radius = Number(property.property_monitoring_radius_meters || property.geofence_radius_meters || 100);
      if (distanceMeters(lat, lng, Number(property.latitude), Number(property.longitude)) <= radius) return true;
    }
  }
  const haystack = `${call?.location || ''} ${call?.address || ''}`.trim().toLowerCase();
  if (!haystack) return false;
  const names = [property.site_name, property.address, site].filter(Boolean).map(v => String(v).trim().toLowerCase());
  return names.some(name => name && (haystack.includes(name) || (haystack.length >= 5 && name.includes(haystack))));
}

function localWallMinute(dateKey, timeKey) {
  return wallClockMinute(dateKey, timeKey);
}

export function calculateJobDutyCompliance({
  officer = null,
  timeEntries = [],
  dailyReports = [],
  incidentReports = [],
  dispatchCalls = [],
  callOuts = [],
  qrScans = [],
  allTimeEntries = [],
  qrCheckpoints = [],
  dutyRules = [],
  locations = [],
  monthStart,
  monthEnd,
} = {}) {
  const officerEmail = emailKey(officer?.email);
  const evaluatedShifts = timeEntries.filter(entry => {
    if (!entry?.clock_in) return false;
    if (officerEmail && emailKey(entry.officer_email) !== officerEmail) return false;
    const d = easternDateKey(entry.clock_in);
    return d && (!monthStart || d >= monthStart) && (!monthEnd || d <= monthEnd);
  });

  const activeRules = dutyRules.filter(rule => rule.active !== false);
  const ruleFor = site => activeRules.find(rule => siteKey(rule.property_site) === siteKey(site)) || null;
  const officerDailyReports = dailyReports.filter(report => !officer || emailKey(report.officer_email) === officerEmail || String(report.created_by_id || '') === String(officer?.id || ''));
  // Incident compliance is tied to the property call itself. A submitted report linked to that call satisfies the call for all officers who were actively working that property at the time.
  const officerIncidents = incidentReports;
  const officerCallOuts = callOuts.filter(item => !officer || emailKey(item.officer_email) === officerEmail);
  const allWorkedEntries = allTimeEntries.length ? allTimeEntries : timeEntries;
  const scannerWasWorkingAtSite = (scan, site, stamp) => allWorkedEntries.some(work => {
    if (!work?.clock_in || emailKey(work.officer_email) !== emailKey(scan.officer_email)) return false;
    const start = new Date(work.clock_in).getTime();
    const end = work.clock_out ? new Date(work.clock_out).getTime() : Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && stamp >= start && stamp <= end && siteKey(work.location) === site;
  });
  const shiftDetails = [];
  const usedDarIds = new Set();
  let darRequired = 0, darCompleted = 0;
  let incidentRequired = 0, incidentCompleted = 0, incidentExcluded = 0;
  let qrRequired = 0, qrCompleted = 0, qrExcludedInvalid = 0;

  evaluatedShifts.forEach(entry => {
    const shiftDate = easternDateKey(entry.clock_in);
    const site = siteKey(entry.location);
    if (!site) return;
    const rule = ruleFor(site);
    const shiftStartMs = new Date(entry.clock_in).getTime();
    const isActiveShift = !entry.clock_out;
    const shiftEndMs = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
    const detail = {
      shift_id: entry.id,
      shift_date: shiftDate,
      active: isActiveShift,
      property: propertyForSite(site, locations)?.site_name || String(entry.location || '').split(' - ')[0].split(':')[0],
      daily_activity: { required: false, completed: false, report_id: null },
      incidents: { required: 0, completed: 0, excluded: 0, items: [] },
      qr: { required: 0, completed: 0, missed: 0, excluded_invalid: 0, excluded_items: [], required_checkpoint_names: [] },
    };

    const requiresDar = !isActiveShift && (rule ? rule.daily_activity_report_required !== false : true);
    if (requiresDar) {
      darRequired++;
      detail.daily_activity.required = true;
      const matchingDar = officerDailyReports.find(report => {
        if (report.status === 'draft' || usedDarIds.has(String(report.id))) return false;
        if (report.shift_id && String(report.shift_id) === String(entry.id)) return true;
        return !report.shift_id && report.report_date === shiftDate && siteKey(report.location) === site;
      });
      if (matchingDar) {
        usedDarIds.add(String(matchingDar.id));
        darCompleted++;
        detail.daily_activity.completed = true;
        detail.daily_activity.report_id = matchingDar.id;
      }
    }

    const calls = dispatchCalls.filter(call => {
      const stamp = new Date(call.time_received || call.created_date).getTime();
      if (!Number.isFinite(stamp) || stamp < shiftStartMs || stamp > shiftEndMs) return false;
      return callMatchesProperty(call, site, locations);
    });
    const allowedTypes = Array.isArray(rule?.incident_required_call_types) ? rule.incident_required_call_types.map(v => String(v).toLowerCase()) : [];
    const requireIncident = rule ? rule.incident_report_required_for_property_calls !== false : true;

    if (requireIncident) {
      calls.forEach(call => {
        const callType = String(call.incident || call.incident_type || call.call_type || call.type || '').toLowerCase();
        if (allowedTypes.length && !allowedTypes.includes(callType)) return;
        const callDate = easternDateKey(call.time_received || call.created_date);
        const callTime = easternTimeKey(call.time_received || call.created_date);
        const callWall = localWallMinute(callDate, callTime);
        const reassignment = officerCallOuts.find(item => {
          if (!['reassigned', 'sent_home', 'called_out'].includes(item.call_out_type)) return false;
          if (siteKey(item.original_location || item.location) !== site) return false;
          const outWall = localWallMinute(item.call_out_date, item.call_out_time || '00:00');
          return outWall != null && callWall != null && callWall >= outWall;
        });
        if (reassignment) {
          incidentExcluded++;
          detail.incidents.excluded++;
          detail.incidents.items.push({ call_id: call.id, call_number: call.call_id || call.agency_cad_number || call.bps_reference || '', status: 'excluded_reassignment', reason: reassignment.call_out_type === 'reassigned' ? `Excluded after reassignment to ${reassignment.destination_location || 'another assignment'}` : `Excluded after officer was ${reassignment.call_out_type === 'sent_home' ? 'sent home' : 'called out'}` });
          return;
        }
        incidentRequired++;
        detail.incidents.required++;
        const callNumbers = [call.call_id, call.agency_cad_number, call.bps_reference].filter(Boolean).map(String);
        const report = officerIncidents.find(ir =>
          String(ir.linked_call_id || '') === String(call.id || '') ||
          callNumbers.includes(String(ir.linked_call_number || '')) ||
          callNumbers.includes(String(ir.call_number || ''))
        );
        if (report && report.status !== 'draft') {
          incidentCompleted++;
          detail.incidents.completed++;
          detail.incidents.items.push({ call_id: call.id, call_number: call.call_id || call.agency_cad_number || call.bps_reference || '', status: 'completed', report_id: report.id });
        } else {
          detail.incidents.items.push({ call_id: call.id, call_number: call.call_id || call.agency_cad_number || call.bps_reference || '', status: 'missing', call_type: call.incident || call.incident_type || call.call_type || 'Call for service' });
        }
      });
    }

    const ruleCreatedMs = rule?.created_date ? new Date(rule.created_date).getTime() : NaN;
    const effectiveQrRule = rule && (!Number.isFinite(ruleCreatedMs) || ruleCreatedMs <= shiftEndMs) ? rule : null;
    const propertyCheckpoints = qrCheckpoints.filter(cp => {
      if (cp.is_active === false || siteKey(cp.property_site) !== site) return false;
      const created = cp.created_date ? new Date(cp.created_date).getTime() : NaN;
      return !Number.isFinite(created) || created <= shiftEndMs;
    });
    const explicitIds = new Set((effectiveQrRule?.required_checkpoint_ids || []).map(String));
    const mandatoryLabels = new Set((effectiveQrRule?.mandatory_location_labels || []).map(v => String(v).trim().toLowerCase()));
    let requiredCheckpoints = propertyCheckpoints.filter(cp => {
      if (explicitIds.size) return explicitIds.has(String(cp.id));
      if (mandatoryLabels.size) return mandatoryLabels.has(String(cp.location_label || '').trim().toLowerCase());
      return cp.is_required !== false;
    });
    // A duty rule can remain active after a checkpoint master row is removed. Do not
    // silently turn that into QR 0/0. Preserve explicit required checkpoint IDs and
    // recover their display names from historical scan snapshots when possible.
    if (explicitIds.size) {
      const knownIds = new Set(requiredCheckpoints.map(cp => String(cp.id)));
      for (const checkpointId of explicitIds) {
        if (knownIds.has(checkpointId)) continue;
        const snapshot = qrScans.find(scan => String(scan.checkpoint_id || '') === checkpointId && siteKey(scan.property_site) === site);
        requiredCheckpoints.push({
          id: checkpointId,
          checkpoint_name: snapshot?.checkpoint_name_snapshot || snapshot?.location_label_snapshot || `Checkpoint ${checkpointId.slice(-6)}`,
          location_label: snapshot?.location_label_snapshot || '',
          created_date: effectiveQrRule?.created_date || null,
          is_required: true,
          is_active: true,
        });
      }
    }
    const qrIsRequired = effectiveQrRule ? effectiveQrRule.qr_required === true : requiredCheckpoints.length > 0;
    if (qrIsRequired && requiredCheckpoints.length > 0) {
      const frequency = Math.max(1, Number(effectiveQrRule?.qr_frequency_minutes || 60));
      const windowMinutes = Math.max(1, Number(effectiveQrRule?.qr_window_minutes || 30));
      const siteSuccessfulScans = qrScans.filter(scan => {
        const stamp = new Date(scan.scanned_at).getTime();
        return scan.scan_status === 'success' && Number.isFinite(stamp) && stamp >= shiftStartMs && stamp <= shiftEndMs && siteKey(scan.property_site) === site;
      });
      const successful = siteSuccessfulScans.filter(scan => {
        const stamp = new Date(scan.scanned_at).getTime();
        return scannerWasWorkingAtSite(scan, site, stamp);
      });
      const excludedInvalid = siteSuccessfulScans.filter(scan => {
        const stamp = new Date(scan.scanned_at).getTime();
        return !scannerWasWorkingAtSite(scan, site, stamp);
      });
      qrExcludedInvalid += excludedInvalid.length;
      detail.qr.excluded_invalid = excludedInvalid.length;
      detail.qr.excluded_items = excludedInvalid.map(scan => ({
        scan_id: scan.id,
        officer_email: scan.officer_email,
        checkpoint_name: scan.checkpoint_name_snapshot || scan.location_label_snapshot || scan.checkpoint_id,
        scanned_at: scan.scanned_at,
        reason: 'Scanner was not clocked in at this property when the scan occurred',
      }));

      let obligationCount = 0;
      let obligationCompleted = 0;
      const missedObligations = [];
      const activationMs = Number.isFinite(ruleCreatedMs) && effectiveQrRule ? Math.max(shiftStartMs, ruleCreatedMs) : shiftStartMs;
      let windowStartMs = activationMs;
      let roundNumber = 1;
      while (windowStartMs < shiftEndMs && roundNumber <= 48) {
        const naturalWindowEndMs = windowStartMs + windowMinutes * 60000;
        const windowEndMs = Math.min(shiftEndMs, naturalWindowEndMs);
        // On an active shift, the current open QR window is pending rather than missed.
        if (isActiveShift && naturalWindowEndMs > Date.now()) break;
        for (const cp of requiredCheckpoints) {
          const cpCreatedMs = cp.created_date ? new Date(cp.created_date).getTime() : NaN;
          if (Number.isFinite(cpCreatedMs) && cpCreatedMs > windowEndMs) continue;
          obligationCount++;
          const scan = successful.find(item => {
            const stamp = new Date(item.scanned_at).getTime();
            return String(item.checkpoint_id) === String(cp.id) && stamp >= windowStartMs && stamp <= windowEndMs;
          });
          if (scan) obligationCompleted++;
          else missedObligations.push({
            round: roundNumber,
            checkpoint_id: cp.id,
            checkpoint_name: cp.checkpoint_name || cp.location_label || cp.id,
            window_start: new Date(windowStartMs).toISOString(),
            window_end: new Date(windowEndMs).toISOString(),
          });
        }
        windowStartMs += frequency * 60000;
        roundNumber++;
      }

      const ruleCoveredWholeShift = !Number.isFinite(ruleCreatedMs) || ruleCreatedMs <= shiftStartMs;
      const minimumPerShift = isActiveShift || !ruleCoveredWholeShift ? 0 : Math.max(0, Number(effectiveQrRule?.qr_scans_per_shift || 0));
      const requiredCount = Math.max(obligationCount, minimumPerShift);
      // Any successful site scan can satisfy only the extra minimum above the checkpoint/window obligations.
      const extraRequired = Math.max(0, minimumPerShift - obligationCount);
      const extraAvailable = Math.max(0, successful.length - obligationCompleted);
      const completedCount = Math.min(requiredCount, obligationCompleted + Math.min(extraRequired, extraAvailable));
      qrRequired += requiredCount;
      qrCompleted += completedCount;
      detail.qr.required = requiredCount;
      detail.qr.completed = completedCount;
      detail.qr.missed = Math.max(0, requiredCount - completedCount);
      detail.qr.required_checkpoint_names = requiredCheckpoints.map(cp => cp.checkpoint_name || cp.location_label || cp.id);
      detail.qr.missed_obligations = missedObligations;
      detail.qr.frequency_minutes = frequency;
      detail.qr.window_minutes = windowMinutes;
    }

    shiftDetails.push(detail);
  });

  const darScore = darRequired ? Math.round((darCompleted / darRequired) * 100) : null;
  const incidentScore = incidentRequired ? Math.round((incidentCompleted / incidentRequired) * 100) : null;
  const qrScore = qrRequired ? Math.round((qrCompleted / qrRequired) * 100) : null;
  const totalRequired = darRequired + incidentRequired + qrRequired;
  const totalMissed = Math.max(0, darRequired - darCompleted)
    + Math.max(0, incidentRequired - incidentCompleted)
    + Math.max(0, qrRequired - qrCompleted);
  // Job Duty must move when additional required duties are missed. A pure completion
  // ratio makes 0/8 and 0/15 both equal 0%, which hides the difference in performance.
  // Each missed required duty lowers Job Duty by 5 points, capped at zero.
  const score = totalRequired > 0 ? Math.max(0, 100 - (totalMissed * 5)) : null;

  return {
    score,
    dailyActivity: { required: darRequired, completed: darCompleted, missed: Math.max(0, darRequired - darCompleted), score: darScore },
    incidentReports: { required: incidentRequired, completed: incidentCompleted, missed: Math.max(0, incidentRequired - incidentCompleted), excluded: incidentExcluded, score: incidentScore },
    qrCompliance: { required: qrRequired, completed: qrCompleted, missed: Math.max(0, qrRequired - qrCompleted), excludedInvalid: qrExcludedInvalid, score: qrScore },
    shifts: shiftDetails,
  };
}

export function calculateCallOutAttendance(callOuts = [], schedules = [], monthStart, monthEnd) {
  const today = easternDateKey(new Date());
  const nowTime = easternTimeKey(new Date());
  const nowWall = wallClockMinute(today, nowTime);
  const monthlySchedules = schedules.filter(schedule => {
    if (schedule.archived === true || schedule.is_open === true || !schedule.shift_date || !schedule.start_time) return false;
    if (monthStart && schedule.shift_date < monthStart) return false;
    if (monthEnd && schedule.shift_date > monthEnd) return false;
    const startWall = wallClockMinute(schedule.shift_date, schedule.start_time);
    return startWall != null && nowWall != null && startWall <= nowWall;
  });
  const applicable = callOuts.filter(item => {
    if (item.call_out_type !== 'called_out') return false;
    const date = item.call_out_date || easternDateKey(item.created_date);
    return date && (!monthStart || date >= monthStart) && (!monthEnd || date <= monthEnd);
  });
  if (monthlySchedules.length === 0) return { score: null, count: applicable.length, scheduled: 0, items: applicable };
  const denominator = monthlySchedules.length;
  const score = Math.max(0, Math.round(((denominator - Math.min(denominator, applicable.length)) / denominator) * 100));
  return { score, count: applicable.length, scheduled: monthlySchedules.length, items: applicable };
}

const boundedMetricScore = value => value == null ? null : Math.max(0, Math.min(100, Math.round(value)));

export function buildOverallPerformance({ punctuality, trainingScore = null, jobDuty = null, callOutAttendance = null, bidStanding, clientFeedback, supervisorRating, recognition }) {
  const configured = [
    { label: 'On-Time Arrival', score: punctuality?.rate != null && punctuality.total > 0 ? boundedMetricScore(punctuality.rate) : null, baseWeight: 55 },
    { label: 'Job Duty / Performance', score: jobDuty?.score != null ? boundedMetricScore(jobDuty.score) : null, baseWeight: 15 },
    { label: 'Call-Out Attendance', score: callOutAttendance?.score != null ? boundedMetricScore(callOutAttendance.score) : null, baseWeight: 15 },
    { label: 'Training Completion', score: boundedMetricScore(trainingScore), baseWeight: 3 },
    { label: 'Bid Standing', score: boundedMetricScore(bidStanding?.score), baseWeight: 3 },
    { label: 'Client Feedback', score: boundedMetricScore(clientFeedback?.score), baseWeight: 3 },
    { label: 'Supervisor Rating', score: boundedMetricScore(supervisorRating?.score), baseWeight: 3 },
    { label: 'Recognition', score: recognition?.score != null ? boundedMetricScore(recognition.score) : null, baseWeight: 3 },
  ];
  const scoreable = configured.filter(item => item.score != null);
  const activeWeight = scoreable.reduce((sum, item) => sum + item.baseWeight, 0);
  if (!activeWeight) return { score: null, categories: [], omitted: configured.map(item => item.label) };
  const categories = scoreable.map(item => {
    const effectiveWeight = (item.baseWeight / activeWeight) * 100;
    return {
      label: item.label,
      score: item.score,
      baseWeight: item.baseWeight,
      weight: effectiveWeight,
      contribution: item.score * (effectiveWeight / 100),
    };
  });
  const score = Math.round(categories.reduce((sum, item) => sum + item.contribution, 0));
  return {
    score,
    categories,
    omitted: configured.filter(item => item.score == null).map(item => item.label),
    activeWeight,
  };
}
