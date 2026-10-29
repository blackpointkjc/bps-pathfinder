function easternMidnight(day:string) {
  const raw = Date.parse(day + 'T00:00:00.000Z');
  const zone = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(raw)).find(part=>part.type==='timeZoneName')?.value || 'GMT';
  const offset = Number(zone.replace('GMT','') || 0);
  return new Date(raw - offset * 3600000).toISOString();
}
import { createClientFromRequest } from 'npm:@base44/sdk';
// Self-contained company snapshot uses the same personal scoring data loader.

const lower = (v: any) => String(v || '').trim().toLowerCase();
const sameEmail = (row: any, field: string, aliases: Set<string>) => aliases.has(lower(row?.[field]));
const sameOfficer = (row: any, emailFields: string[], aliases: Set<string>, officerId: string, idFields: string[] = ['officer_id']) =>
  emailFields.some(field => sameEmail(row, field, aliases)) ||
  idFields.some(field => officerId && String(row?.[field] || '') === officerId);

const rowCache = new Map<string, { at:number; rows:any[] }>();
async function cachedRows(cacheKey:string, ttlMs:number, loader:() => Promise<any[]>) {
  const cached = rowCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ttlMs) return cached.rows;
  const rows = await loader();
  const normalized = Array.isArray(rows) ? rows : [];
  rowCache.set(cacheKey, { at:Date.now(), rows:normalized });
  return normalized;
}


async function loadPerformanceData(base44: any, officer: any, body: any, options: { sharedCompanyRead?: boolean } = {}) {
    const email = lower(officer.work_email || officer.pathfinder_email || officer.email);

    const serviceErrors: Record<string, string> = {};
    let activeReads = 0;
    const readWaiters: Array<() => void> = [];
    const acquireReadSlot = async () => {
      // Keep this bounded, but do not serialize 20+ monthly reads one-by-one.
      // Two service-role reads at a time cuts the long blank load substantially
      // without recreating the large fan-out that previously caused 429s.
      if (activeReads >= 1) await new Promise<void>(resolve => readWaiters.push(resolve));
      activeReads += 1;
    };
    const releaseReadSlot = () => {
      activeReads = Math.max(0, activeReads - 1);
      readWaiters.shift()?.();
    };
    const safeRead = async (entity: string, reader: () => Promise<any[]>) => {
      await acquireReadSlot();
      try {
        let lastError:any = null;
        const attempts = options.sharedCompanyRead ? 1 : 2;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          try {
            return await reader() || [];
          } catch (error: any) {
            lastError = error;
            const isRateLimit = error?.status === 429 || error?.response?.status === 429 || /rate.limit|429|too many requests/i.test(String(error?.message || ''));
            if (!isRateLimit || attempt === attempts - 1) break;
            await new Promise(resolve => setTimeout(resolve, 1800));
          }
        }
        throw lastError || new Error('Unable to read data');
      } catch (error: any) {
        serviceErrors[entity] = error?.message || 'Unable to read data';
        console.warn(`getMyPerformanceData ${entity} unavailable`, error?.message || error);
        return [];
      } finally {
        releaseReadSlot();
      }
    };
    const safeList = (entity: string, sort?: string, limit = 1000) => safeRead(entity, async () => {
      const service = (base44.asServiceRole.entities as any)[entity];
      if (!service?.list) throw new Error(`${entity} service is unavailable`);
      return service.list(sort, limit);
    });
    const safeFilter = (entity: string, query: any, sort?: string, limit = 1000) => safeRead(entity, async () => {
      const service = (base44.asServiceRole.entities as any)[entity];
      if (!service?.filter) throw new Error(`${entity} filter service is unavailable`);
      const shared = ['IncidentReport', 'QRScanEvent', 'DispatchCall', 'CallHistory', 'PropertyAlert', 'DailyActivityReport', 'ShiftReport'].includes(entity);
      return shared ? cachedRows(entity + ':' + JSON.stringify(query) + ':' + sort + ':' + limit, 30000, () => service.filter(query, sort, limit)) : service.filter(query, sort, limit);
    });

    // User is the canonical identity source. Linked work/Microsoft aliases are
    // persisted on the User record, so performance must not re-query Teams and
    // Outlook identity tables on every analytics refresh.
    const officerId = String(officer.id || '');
    const aliases = new Set<string>([
      email,
      lower(officer.email),
      lower(officer.work_email),
      lower(officer.pathfinder_email),
      lower(officer.microsoft_email),
      lower(officer.outlook_email),
      ...((officer.email_aliases || []).map(lower)),
    ].filter(Boolean));
    if (/@(?:officer|employee)\.blackpointkjc\.com$/i.test(email)) {
      const mailbox=email.split('@')[0];
      const directory=await cachedRows('performance-identity-directory',300000,()=>base44.asServiceRole.entities.User.list('-updated_date',1000)).catch(()=>[]);
      const owners=directory.filter((person:any)=>[person.email,person.work_email,person.pathfinder_email,...(person.email_aliases||[])].some((value:any)=>lower(value).split('@')[0]===mailbox));
      // The legacy @blackpointkjc.com address frequently carries the officer's
      // schedules and past time entries but has no User row of its own. Bridge it
      // unless another person genuinely owns that mailbox, otherwise those shifts
      // never reach the officer's own performance.
      if(!owners.some((person:any)=>String(person.id)!==officerId))aliases.add(mailbox+'@blackpointkjc.com');
    }
    const aliasValues = [...aliases];
    const officerEmailQuery = (field = 'officer_email') => ({ [field]: { $in: aliasValues } });
    const officerRecordQuery = (emailFields = ['officer_email'], idFields = ['officer_id']) => ({
      $or: [
        ...emailFields.map(field => officerEmailQuery(field)),
        ...idFields.map(field => ({ [field]: officerId })),
      ],
    });
    const validDate = (value:any) => {
      const raw = String(value || '');
      const date = new Date(raw + 'T00:00:00.000Z');
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === raw;
    };
    if ((body.start_date && !validDate(body.start_date)) || (body.end_date && !validDate(body.end_date))) return Response.json({ error:'Enter valid start and end dates.' }, { status:400 });
    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const monthDateCutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date || '')) ? String(body.start_date) : defaultStartDate;
    const monthDateEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(body.end_date || '')) ? String(body.end_date) : defaultEndDate;
    if (monthDateCutoff > monthDateEnd) return Response.json({ error: 'Start date must be on or before end date.' }, { status: 400 });
    const activityCutoff = easternMidnight(monthDateCutoff);
    const endExclusive = new Date(`${monthDateEnd}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const activityEndExclusive = easternMidnight(endExclusive.toISOString().slice(0,10));

    // Load the officer's core current-month duty context first. That tells us
    // which expensive operational datasets are actually relevant before we fan
    // out into secondary scoring sources.
    const [timeEntriesAll, schedulesAll, dutyRulesAll, locationsAll, modulesAll] = await Promise.all([
      safeFilter('TimeEntry', { $and: [officerEmailQuery(), { clock_in: { $gte: activityCutoff, $lt: activityEndExclusive } }] }, '-clock_in', 500),
      safeFilter('Schedule', { $and: [officerEmailQuery(), { shift_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-shift_date', 500),
      safeRead('JobDutyRule', () => cachedRows('dutyRules', 2 * 60 * 1000, () => base44.asServiceRole.entities.JobDutyRule.list('property_site', 500))),
      safeRead('Location', () => cachedRows('locations', 5 * 60 * 1000, () => base44.asServiceRole.entities.Location.list('site_name', 500))),
      safeRead('TrainingModule', () => cachedRows('trainingModules', 5 * 60 * 1000, () => base44.asServiceRole.entities.TrainingModule.list('-created_date', 500))),
    ]);

    const myTimeEntries = timeEntriesAll.filter((r:any) => sameEmail(r, 'officer_email', aliases) || String(r?.created_by_id || '') === officerId);
    const mySchedules = schedulesAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    const siteKey = (value:any) => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
    // Scheduled sites count too: officers who never clock in are scored from their
    // published shifts, so their properties must load calls and reports as well.
    const relevantSiteKeys = new Set([
      ...myTimeEntries.map((entry:any) => siteKey(entry.location)),
      ...mySchedules.map((schedule:any) => siteKey(schedule.location)),
    ].filter(Boolean));
    const relevantDutyRules = (dutyRulesAll || []).filter((rule:any) => rule.active !== false && relevantSiteKeys.has(siteKey(rule.property_site)));
    const qrRequired = relevantDutyRules.some((rule:any) => rule.qr_required === true);
    const trainingApplicable = (modulesAll || []).some((module:any) => module.active !== false);

    const [bidsAll, completionsAll, assignmentsAll, callOutsAll, scansAll, checkpointsAll, partnerTimeEntriesAll, incidentsAll, commendationsAll, complaintsAll, feedbackAll, reviewsAll, dailyReportsAll, shiftReportsAll, dispatchCallsAll, callHistoryAll, propertyAlertsAll, callAssignmentsAll] = await Promise.all([
      safeFilter('ShiftBid', { $and: [officerEmailQuery(), { created_date: { $gte: activityCutoff, $lt: activityEndExclusive } }] }, '-created_date', 500),
      trainingApplicable ? safeFilter('TrainingCompletion', officerEmailQuery(), '-completion_date', 500) : Promise.resolve([]),
      trainingApplicable ? safeFilter('TrainingAssignment', officerEmailQuery(), '-assigned_date', 500) : Promise.resolve([]),
      safeFilter('CallOut', { $and: [officerEmailQuery(), { call_out_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-call_out_date', 500),
      qrRequired ? safeFilter('QRScanEvent', { scanned_at: { $gte: activityCutoff, $lt: activityEndExclusive } }, '-scanned_at', 1000) : Promise.resolve([]),
      qrRequired ? safeRead('QRCheckpoint', () => cachedRows('qrCheckpoints', 5 * 60 * 1000, () => base44.asServiceRole.entities.QRCheckpoint.list('property_site', 500))) : Promise.resolve([]),
      qrRequired ? safeFilter('TimeEntry', { clock_in: { $gte: activityCutoff, $lt: activityEndExclusive } }, '-clock_in', 1500) : Promise.resolve(timeEntriesAll),
      // Property calls now create an incident obligation by default, so reports and
      // the property call feed are always read instead of only for ruled properties.
      safeFilter('IncidentReport', { incident_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }, '-incident_date', 500),
      safeFilter('Commendation', { $and: [officerRecordQuery(), { commendation_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-commendation_date', 250),
      safeFilter('Complaint', { $and: [officerRecordQuery(), { complaint_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-complaint_date', 250),
      safeFilter('ClientFeedback', { $and: [officerRecordQuery(), { feedback_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-feedback_date', 250),
      safeFilter('PerformanceReview', { $and: [officerRecordQuery(), { review_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }] }, '-review_date', 250),
      safeFilter('DailyActivityReport', { report_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }, '-report_date', 500),
      safeFilter('ShiftReport', { shift_date: { $gte: monthDateCutoff, $lte: monthDateEnd } }, '-shift_date', 500),
      safeFilter('DispatchCall', { time_received: { $gte: activityCutoff, $lt: activityEndExclusive } }, '-time_received', 500),
      safeFilter('CallHistory', { archived_date: { $gte: activityCutoff, $lt: activityEndExclusive } }, '-archived_date', 500),
      safeFilter('PropertyAlert', { created_date: { $gte: activityCutoff, $lt: activityEndExclusive } }, '-created_date', 750),
      Promise.resolve([]),
    ]);
    const myBids = bidsAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    const myCompletions = completionsAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    const myAssignments = assignmentsAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    const myCallOuts = callOutsAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    const myCallAssignments = callAssignmentsAll.filter((r:any) => String(r?.unit_id || '') === officerId);
    const myScans = scansAll.filter((r:any) => sameEmail(r, 'officer_email', aliases));
    // Return every successful scan that occurred at the officer's property while
    // the officer was working there. The scoring engine itself determines whether
    // the scanner was also clocked in at that property, so invalid partner scans
    // can be explained instead of silently disappearing from the analytics.
    const sharedQrScans = scansAll.filter((scan:any) => {
      const stamp = new Date(scan?.scanned_at || 0).getTime();
      if (!Number.isFinite(stamp) || scan?.scan_status !== 'success') return false;
      const scanSite = siteKey(scan.property_site);
      return myTimeEntries.some((entry:any) => {
        if (!entry?.clock_in || siteKey(entry.location) !== scanSite) return false;
        const start = new Date(entry.clock_in).getTime();
        const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
        return Number.isFinite(start) && Number.isFinite(end) && stamp >= start && stamp <= end;
      });
    }).map((scan:any) => ({
      id: scan.id,
      shift_id: scan.shift_id,
      officer_email: scan.officer_email,
      property_site: scan.property_site,
      checkpoint_id: scan.checkpoint_id,
      checkpoint_name_snapshot: scan.checkpoint_name_snapshot,
      location_label_snapshot: scan.location_label_snapshot,
      scanned_at: scan.scanned_at,
      scanned_date: scan.scanned_date,
      scanned_time: scan.scanned_time,
      scan_status: scan.scan_status,
    }));
    const partnerTimeEntries = partnerTimeEntriesAll.filter((entry:any) => relevantSiteKeys.has(siteKey(entry.location)) && entry.clock_in).map((entry:any) => ({ id: entry.id, officer_email: entry.officer_email, clock_in: entry.clock_in, clock_out: entry.clock_out, location: entry.location }));
    const myIncidents = incidentsAll.filter((r:any) => sameOfficer(r, ['officer_email', 'created_by'], aliases, officerId, ['officer_id', 'created_by_id']));
    const myCommendations = commendationsAll.filter((r:any) => sameOfficer(r, ['officer_email'], aliases, officerId));
    const myComplaints = complaintsAll.filter((r:any) => sameOfficer(r, ['officer_email'], aliases, officerId));
    const myFeedback = feedbackAll.filter((r:any) => sameOfficer(r, ['officer_email'], aliases, officerId));
    const myReviews = reviewsAll.filter((r:any) => sameOfficer(r, ['officer_email'], aliases, officerId));
    const normalizedDutyReports = [
      ...(dailyReportsAll || []).map((r:any) => ({ ...r, source_report_type: 'daily_activity_report' })),
      ...(shiftReportsAll || []).map((r:any) => ({
        ...r,
        source_report_type: 'shift_report',
        report_date: r.report_date || r.shift_date,
        hourly_entries: r.hourly_entries || r.activities || '',
      })),
    ];
    const myDailyReports = normalizedDutyReports.filter((r:any) => sameOfficer(r, ['officer_email'], aliases, officerId, ['officer_id', 'created_by_id']));

    // PropertyAlert is the authoritative property-to-call link. DispatchCall rows are
    // archived after an hour, so rebuild one durable call feed from live + history + alerts.
    const alertByCall = new Map<string, any>();
    for (const alert of propertyAlertsAll || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCall.get(key);
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      const stamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && stamp > priorStamp)) alertByCall.set(key, alert);
    }
    const historyMatchForAlert = (alert:any) => {
      if (alert?.callTime || alert?.time_received) return null;
      const incident = lower(alert?.callIncident);
      const location = lower(alert?.callLocation);
      const alertStamp = new Date(alert?.created_date || 0).getTime();
      let best:any = null;
      let bestDistance = Infinity;
      for (const row of callHistoryAll || []) {
        if (lower(row?.incident) !== incident || lower(row?.location) !== location) continue;
        const stamp = new Date(row?.time_received || row?.created_date || 0).getTime();
        if (!Number.isFinite(stamp) || !Number.isFinite(alertStamp)) continue;
        const distance = Math.abs(alertStamp - stamp);
        if (distance <= 24 * 60 * 60 * 1000 && distance < bestDistance) { best = row; bestDistance = distance; }
      }
      return best;
    };
    const callsByOriginalId = new Map<string, any>();
    for (const call of dispatchCallsAll || []) callsByOriginalId.set(String(call.id), { ...call, original_call_id: call.id });
    for (const call of callHistoryAll || []) {
      const originalId = String(call.original_call_id || call.id || '');
      if (originalId && !callsByOriginalId.has(originalId)) callsByOriginalId.set(originalId, { ...call, id: originalId, original_call_id: originalId });
    }
    const combinedPropertyCalls:any[] = [];
    const represented = new Set<string>();
    for (const [originalId, call] of callsByOriginalId.entries()) {
      const alert = alertByCall.get(originalId);
      if (!alert) continue;
      represented.add(originalId);
      combinedPropertyCalls.push({
        ...call,
        id: originalId,
        original_call_id: originalId,
        property_id: alert.propertyId || '',
        property_site: alert.propertyName || '',
        call_id: call.call_id || originalId,
        incident: call.incident || alert.callIncident || 'Property call',
        location: call.location || alert.callLocation || alert.propertyName || '',
        time_received: call.time_received || alert.callTime || alert.time_received || alert.created_date,
      });
    }
    for (const [originalId, alert] of alertByCall.entries()) {
      if (represented.has(originalId)) continue;
      const historyMatch = historyMatchForAlert(alert);
      combinedPropertyCalls.push({
        id: originalId,
        original_call_id: originalId,
        call_id: alert.cadNumber || originalId,
        property_id: alert.propertyId || '',
        property_site: alert.propertyName || '',
        incident: alert.callIncident || historyMatch?.incident || 'Property call',
        location: alert.callLocation || historyMatch?.location || alert.propertyName || '',
        latitude: historyMatch?.latitude,
        longitude: historyMatch?.longitude,
        time_received: alert.callTime || alert.time_received || historyMatch?.time_received || alert.created_date,
        status: historyMatch?.status || (alert.acknowledged ? 'Closed' : 'Pending'),
      });
    }
    const myWorkedSites = new Set([
      ...myTimeEntries.map((entry:any) => siteKey(entry.location)),
      ...mySchedules.map((schedule:any) => siteKey(schedule.location)),
    ].filter(Boolean));
    const sharedDailyReports = normalizedDutyReports.filter((r:any) => {
      const attachedEmails = new Set((r.attached_officer_emails || []).map((value:any) => lower(value)));
      const attachedIds = new Set((r.attached_officer_ids || []).map((value:any) => String(value)));
      return myWorkedSites.has(siteKey(r.location))
        || attachedEmails.has(email)
        || attachedIds.has(String(officerId || ''))
        || sameOfficer(r, ['officer_email'], aliases, officerId, ['officer_id', 'created_by_id']);
    });
    const myPropertyCalls = combinedPropertyCalls.filter((call:any) => myWorkedSites.has(siteKey(call.property_site)));
    const decisions = myPropertyCalls.length ? await safeFilter('CallPerformanceDecision', { call_id: { $in: myPropertyCalls.map((call:any) => String(call.id)) } }, '-created_date', 5000) : [];
    if (serviceErrors.CallPerformanceDecision) throw new Error('Unable to verify incident performance exclusions: ' + serviceErrors.CallPerformanceDecision);
    const decisionByCall = new Map<string, any>();
    for (const decision of decisions) if (!decisionByCall.has(String(decision.call_id))) decisionByCall.set(String(decision.call_id), decision);
    for (const call of myPropertyCalls) call.performance_decision = decisionByCall.get(String(call.id)) || null;
    const relevantCallIds = new Set(myPropertyCalls.flatMap((call:any) => [call.id, call.original_call_id, call.call_id, call.agency_cad_number, call.bps_reference].filter(Boolean).map(String)));
    // A report submitted later (or with a missing incident_date) still satisfies
    // its linked call. Resolve by durable IDs/numbers, not only the month filter.
    const linkedReports = relevantCallIds.size ? await safeFilter('IncidentReport', { $or: [
      { linked_call_id: { $in: [...relevantCallIds] } },
      { linked_call_number: { $in: [...relevantCallIds] } },
      { call_number: { $in: [...relevantCallIds] } },
    ] }, '-created_date', 1000) : [];
    const linkedPropertyIncidents = [...incidentsAll, ...linkedReports].filter((report:any) => relevantCallIds.has(String(report.linked_call_id || '')) || relevantCallIds.has(String(report.linked_call_number || '')) || relevantCallIds.has(String(report.call_number || '')));
    const relevantIncidents = [...new Map([...myIncidents, ...linkedPropertyIncidents].map((report:any) => [String(report.id), report])).values()];

    // Return one canonical officer identity so schedule, time, training, and
    // report records still join when they were saved under different linked emails.
    const canonicalMyRow = (row:any) => ({
      ...row,
      officer_email: email,
      ...(row?.created_by_email !== undefined ? { created_by_email: email } : {}),
      ...(row?.created_by && String(row.created_by).includes('@') && aliases.has(lower(row.created_by)) ? { created_by: email } : {}),
    });
    const canonicalPartnerRow = (row:any) => aliases.has(lower(row?.officer_email))
      ? { ...row, officer_email: email }
      : row;
    const canonicalModules = (modulesAll || []).map((module:any) => ({
      ...module,
      assigned_to: Array.isArray(module.assigned_to)
        ? module.assigned_to.map((value:any) => aliases.has(lower(value)) ? email : lower(value))
        : module.assigned_to,
    }));

    return Response.json({
      success: true,
      officer: { ...officer, email, email_aliases: aliasValues },
      generated_at: new Date().toISOString(),
      timeEntries: myTimeEntries.map(canonicalMyRow),
      schedules: mySchedules.map(canonicalMyRow),
      bids: myBids.map(canonicalMyRow),
      trainingCompletions: myCompletions.map(canonicalMyRow),
      trainingAssignments: myAssignments.map(canonicalMyRow),
      callOuts: myCallOuts.map(canonicalMyRow),
      qrScanEvents: myScans.map(canonicalMyRow),
      sharedQrScanEvents: sharedQrScans.map(canonicalPartnerRow),
      partnerTimeEntries: partnerTimeEntries.map(canonicalPartnerRow),
      checkpoints: checkpointsAll.filter((r:any) => r.is_active !== false),
      trainingModules: canonicalModules.filter((r:any) => r.active !== false),
      incidents: relevantIncidents,
      commendations: myCommendations.map(canonicalMyRow),
      complaints: myComplaints.map(canonicalMyRow),
      clientFeedback: myFeedback.map(canonicalMyRow),
      performanceReviews: myReviews.map(canonicalMyRow),
      dailyActivityReports: sharedDailyReports.map(canonicalPartnerRow),
      dispatchCalls: myPropertyCalls,
      callAssignments: myCallAssignments,
      jobDutyRules: dutyRulesAll.filter((r:any) => r.active !== false),
      locations: locationsAll,
      service_errors: serviceErrors,
      data_health: Object.keys(serviceErrors).length ? 'partial' : 'verified',
      missing_sources: Object.keys(serviceErrors),
      is_partial: Object.keys(serviceErrors).length > 0,
      last_verified_at: Object.keys(serviceErrors).length ? null : new Date().toISOString(),
      meta: {
        timeEntries: myTimeEntries.length,
        schedules: mySchedules.length,
        bids: myBids.length,
        trainingCompletions: myCompletions.length,
        trainingAssignments: myAssignments.length,
        qrScans: myScans.length,
        sharedQrScans: sharedQrScans.length,
        incidents: relevantIncidents.length,
        commendations: myCommendations.length,
        clientFeedback: myFeedback.length,
        performanceReviews: myReviews.length,
        dailyActivityReports: sharedDailyReports.length,
        dailyActivityReportRows: (dailyReportsAll || []).length,
        shiftReportRows: (shiftReportsAll || []).length,
        jobDutyRules: dutyRulesAll.length,
        propertyCalls: myPropertyCalls.length,
        callAssignments: myCallAssignments.length,
        identityAliases: aliases.size,
        serviceErrors: Object.keys(serviceErrors).length,
      },
    });
}

const sourceCache = new Map<string,{at:number;rows:any[]}>();
const sourcePending = new Map<string,Promise<any[]>>();
// One complete source read per entity for the entire company refresh.
// Apply the original officer/date queries locally; never treat a failed read as [].
function matchesQuery(row: any, query: any): boolean {
  return Object.entries(query || {}).every(([key, value]: any) => {
    if (key === '$and') return value.every((q: any) => matchesQuery(row, q));
    if (key === '$or') return value.some((q: any) => matchesQuery(row, q));
    const actual = row?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).every(([op, target]: any) => {
      if (op === '$in') return Array.isArray(actual) ? actual.some(v => target.includes(v)) : target.includes(actual);
      if (op === '$gte') return actual != null && actual >= target;
      if (op === '$gt') return actual != null && actual > target;
      if (op === '$lte') return actual != null && actual <= target;
      if (op === '$lt') return actual != null && actual < target;
      if (op === '$ne') return actual !== target;
      throw new Error('Unsupported performance query operator: ' + op);
    });
    return actual === value;
  });
}

function companyPerformanceEntities(entities: any, start: string, end: string) {
  const pending = new Map<string, Promise<any[]>>();
  const endDate = new Date(end + 'T00:00:00.000Z'); endDate.setUTCDate(endDate.getUTCDate() + 1);
  const startStamp = easternMidnight(start);
  const endStamp = easternMidnight(endDate.toISOString().slice(0,10));
  const dateFields: Record<string,string> = { Schedule:'shift_date', CallOut:'call_out_date', DailyActivityReport:'report_date', ShiftReport:'shift_date', Commendation:'commendation_date', Complaint:'complaint_date', ClientFeedback:'feedback_date', PerformanceReview:'review_date' };
  // CallHistory.archived_date is not indexed, so a month-wide filter over the whole
  // archive can exceed the database read timeout. The system created_date records
  // the same archiving moment and is always indexed.
  const stampFields: Record<string,string> = { TimeEntry:'clock_in', ShiftBid:'created_date', QRScanEvent:'scanned_at', DispatchCall:'time_received', CallHistory:'created_date', PropertyAlert:'created_date' };
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 25;
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const retryable = (error: any) => {
    const status = Number(error?.status || error?.response?.status || 0);
    if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
    return /429|rate.?limit|too many requests|timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up|temporarily unavailable|network/i.test(String(error?.message || ''));
  };
  let tail: Promise<any> = Promise.resolve();
  const read = (fn: () => Promise<any>) => {
    const task = tail.then(async () => {
      let lastError: any = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { return await fn(); }
        catch (error: any) {
          lastError = error;
          if (!retryable(error) || attempt === 1) throw error;
          const status = Number(error?.status || error?.response?.status || 0);
          // A rate limit is a wait, not a missing source: back off instead of
          // marking the whole source unavailable for every officer.
          const wait = status === 429 ? 4000 * (attempt + 1) : 800 * Math.pow(2, attempt);
          await pause(wait + Math.floor(Math.random() * 400));
        }
      }
      throw lastError || new Error('Unable to read data');
    });
    tail = task.catch(() => undefined);
    return task;
  };
  const shape = (result: any) => Array.isArray(result)
    ? { items: result, next: null }
    : { items: Array.isArray(result?.items) ? result.items : [], next: result?.next_cursor || null };
  const readPage = async (name: string, query: any, cursor: string | null) => {
    // The User entity only supports the positional read form; cursor options are
    // rejected there.
    if (name === 'User') {
      const result = query
        ? await entities.User.filter(query, '-created_date', PAGE_SIZE)
        : await entities.User.list('-created_date', PAGE_SIZE);
      return shape(result);
    }
    // A continuation cursor already contains its query and sort. Re-sending
    // either makes Base44 reject the second page of larger company datasets.
    if (cursor) return shape(await entities[name].list({ cursor, limit: PAGE_SIZE }));
    const options: any = { sort: '-created_date', limit: PAGE_SIZE };
    const result = query ? await entities[name].filter(query, options) : await entities[name].list(options);
    return shape(result);
  };
  // Calls are never swept as whole collections. The period's property alerts are
  // the authoritative index of the calls that can affect scoring, so only those
  // call ids are fetched (plus one recent page for live, not-yet-linked calls).
  // This replaces ~25 paged reads of a twelve-thousand-row collection.
  const readAlertLinkedCalls = async (name: string) => {
    const alerts = await allRows('PropertyAlert');
    const ids = [...new Set((alerts || []).map((alert: any) => String(alert?.callId || '')).filter(Boolean))];
    const rows: any[] = [];
    for (let index = 0; index < ids.length; index += 100) {
      const chunk = ids.slice(index, index + 100);
      const query = { $or: [{ id: { $in: chunk } }, { original_call_id: { $in: chunk } }, { call_id: { $in: chunk } }] };
      const page = await read(() => readPage(name, query, null));
      rows.push(...page.items);
    }
    const recent = await read(() => readPage(name, { [stampFields[name] || 'created_date']: { $gte: startStamp, $lt: endStamp } }, null));
    rows.push(...recent.items);
    const seen = new Set<string>();
    return rows.filter((row: any) => {
      const key = String(row?.id || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const allRows = (name: string) => {
    const key = name + ':' + start + ':' + end;
    const cached = sourceCache.get(key);
    if (cached && Date.now() - cached.at < 300000) return Promise.resolve(cached.rows);
    if (sourcePending.has(key)) return sourcePending.get(key)!;
    if (!pending.has(name)) {
      const task = (async () => {
        let rows: any[] = [];
        if (name === 'DispatchCall' || name === 'CallHistory') {
          rows = await readAlertLinkedCalls(name);
        } else {
          const date = dateFields[name], stamp = stampFields[name];
          const query = date ? { [date]: { $gte: start, $lte: end } } : stamp ? { [stamp]: { $gte: startStamp, $lt: endStamp } } : null;
          let cursor: string | null = null;
          for (let page = 0; page < MAX_PAGES; page += 1) {
            const result = await read(() => readPage(name, query, cursor));
            if (!result.items.length) break;
            rows.push(...result.items);
            if (!result.next) break;
            cursor = result.next;
          }
        }
        sourceCache.set(key, { at: Date.now(), rows });
        return rows;
      })().finally(() => sourcePending.delete(key));
      pending.set(name, task);
      sourcePending.set(key, task);
    }
    return pending.get(name)!;
  };
  const select = async (name: string, query: any, sort?: string, limit?: number) => {
    const rows = (await allRows(name)).filter(row => matchesQuery(row, query));
    if (sort) { const desc=sort.startsWith('-'), key=desc?sort.slice(1):sort; rows.sort((a,b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (desc?-1:1)); }
    // Unlike individual reads, do not truncate a complete company source.
    return rows;
  };
  return new Proxy(entities, { get(target, name: string) {
    if (typeof name !== 'string') return Reflect.get(target,name);
    return { ...target[name], list: (sort?: string, limit?: number) => select(name, {}, sort, limit), filter: (query: any, sort?: string, limit?: number) => select(name, query, sort, limit) };
  }});
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({error:'Unauthorized'}, {status:401});
    const roles = new Set((me.additional_roles || []).map((r: any) => String(r).toLowerCase()));
    if (me.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('accounting')) return Response.json({error:'Company analytics access required'}, {status:403});
    const body = await req.json().catch(() => ({}));
    const validDate = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
    if (!validDate(body.start_date) || !validDate(body.end_date) || body.start_date > body.end_date) return Response.json({error:'Valid start and end dates are required'}, {status:400});
    const entities = companyPerformanceEntities(base44.asServiceRole.entities, body.start_date, body.end_date);
    const users = await entities.User.list('-updated_date', 1000);
    const requested = new Set((body.officer_ids || []).map(String));
    const officers = users.filter((u: any) => requested.has(String(u.id)) && !u.termination_date);
    const snapshots: Record<string, any> = {}, errors: Record<string,string> = {};
    const client = { asServiceRole: { entities } };
    for (const officer of officers) {
      try {
        const response = await loadPerformanceData(client, officer, body, { sharedCompanyRead: true });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'Performance load failed');
        if (payload.is_partial) {
          console.warn('getCompanyPerformanceData partial source read', officer.id, JSON.stringify(payload.service_errors || {}));
          throw new Error('Sources unavailable: ' + Object.keys(payload.service_errors || {}).join(', '));
        }
        // The profile photo is a large base64 payload that the analytics views
        // never read from a snapshot; carrying it per officer inflated every
        // company refresh into megabytes.
        if (payload.officer) {
          const { profile_photo_url, profile_photo_original_url, ...identity } = payload.officer;
          payload.officer = identity;
        }
        snapshots[officer.id] = payload;
      } catch (error: any) { errors[officer.id] = error?.message || 'Unable to refresh performance'; }
    }
    for (const id of requested) if (!officers.some((u: any) => String(u.id) === id)) errors[String(id)] = 'Officer record is unavailable';
    return Response.json({success:true, snapshots, errors, generated_at:new Date().toISOString()});
  } catch (error: any) {
    console.error('getCompanyPerformanceData failed',error);
    return Response.json({error:error?.message || 'Unable to load company performance'}, {status:500});
  }
});