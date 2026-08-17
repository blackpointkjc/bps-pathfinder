import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: any) => String(v || '').trim().toLowerCase();
const sameEmail = (row: any, field: string, email: string) => lower(row?.[field]) === email;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const email = lower(me.email);

    const safeList = async (entity: string, sort?: string, limit = 2000) => {
      try {
        return await (base44.asServiceRole.entities as any)[entity].list(sort, limit) || [];
      } catch (error) {
        console.warn(`getMyPerformanceData ${entity} unavailable`, error?.message || error);
        return [];
      }
    };

    const [timeEntriesAll, schedulesAll, bidsAll, completionsAll, assignmentsAll, notificationsAll, callOutsAll, scansAll, checkpointsAll, modulesAll, incidentsAll, commendationsAll, complaintsAll, feedbackAll, reviewsAll, dailyReportsAll, dispatchCallsAll, callHistoryAll, propertyAlertsAll, dutyRulesAll, locationsAll] = await Promise.all([
      safeList('TimeEntry', '-clock_in'),
      safeList('Schedule', '-shift_date'),
      safeList('ShiftBid', '-created_date'),
      safeList('TrainingCompletion', '-completion_date'),
      safeList('TrainingAssignment', '-assigned_date'),
      safeList('Notification', '-created_date'),
      safeList('CallOut', '-call_out_date'),
      safeList('QRScanEvent', '-scanned_at'),
      safeList('QRCheckpoint', 'property_site'),
      safeList('TrainingModule', '-created_date'),
      safeList('IncidentReport', '-incident_date'),
      safeList('Commendation', '-commendation_date'),
      safeList('Complaint', '-complaint_date'),
      safeList('ClientFeedback', '-feedback_date'),
      safeList('PerformanceReview', '-review_date'),
      safeList('DailyActivityReport', '-report_date'),
      safeList('DispatchCall', '-time_received'),
      safeList('CallHistory', '-archived_date'),
      safeList('PropertyAlert', '-created_date'),
      safeList('JobDutyRule', 'property_site'),
      safeList('Location', 'site_name'),
    ]);

    const myTimeEntries = timeEntriesAll.filter((r:any) => sameEmail(r, 'officer_email', email) || String(r?.created_by_id || '') === String(me.id || ''));
    const mySchedules = schedulesAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myBids = bidsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myCompletions = completionsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myAssignments = assignmentsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myNotifications = notificationsAll.filter((r:any) => sameEmail(r, 'recipient_email', email));
    const myCallOuts = callOutsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myScans = scansAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const siteKey = (value:any) => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
    const sharedQrScans = scansAll.filter((scan:any) => {
      const stamp = new Date(scan?.scanned_at || 0).getTime();
      if (!Number.isFinite(stamp) || scan?.scan_status !== 'success') return false;
      const scanSite = siteKey(scan.property_site);
      const overlapsMyShift = myTimeEntries.some((entry:any) => {
        if (!entry?.clock_in || siteKey(entry.location) !== scanSite) return false;
        const start = new Date(entry.clock_in).getTime();
        const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
        return Number.isFinite(start) && Number.isFinite(end) && stamp >= start && stamp <= end;
      });
      if (!overlapsMyShift) return false;
      return timeEntriesAll.some((entry:any) => {
        if (!entry?.clock_in || lower(entry.officer_email) !== lower(scan.officer_email) || siteKey(entry.location) !== scanSite) return false;
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
    const relevantSiteKeys = new Set(myTimeEntries.map((entry:any) => siteKey(entry.location)).filter(Boolean));
    const partnerTimeEntries = timeEntriesAll.filter((entry:any) => relevantSiteKeys.has(siteKey(entry.location)) && entry.clock_in).map((entry:any) => ({ id: entry.id, officer_email: entry.officer_email, clock_in: entry.clock_in, clock_out: entry.clock_out, location: entry.location }));
    const myIncidents = incidentsAll.filter((r:any) => sameEmail(r, 'officer_email', email) || sameEmail(r, 'created_by', email) || String(r?.created_by_id || '') === String(me.id || ''));
    const myCommendations = commendationsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myComplaints = complaintsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myFeedback = feedbackAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myReviews = reviewsAll.filter((r:any) => sameEmail(r, 'officer_email', email));
    const myDailyReports = dailyReportsAll.filter((r:any) => sameEmail(r, 'officer_email', email) || String(r?.created_by_id || '') === String(me.id || ''));

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
        call_id: originalId,
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
    const myWorkedSites = new Set(myTimeEntries.map((entry:any) => siteKey(entry.location)).filter(Boolean));
    const myPropertyCalls = combinedPropertyCalls.filter((call:any) => myWorkedSites.has(siteKey(call.property_site)));
    const relevantCallIds = new Set(myPropertyCalls.flatMap((call:any) => [call.id, call.original_call_id, call.call_id, call.agency_cad_number, call.bps_reference].filter(Boolean).map(String)));
    const linkedPropertyIncidents = incidentsAll.filter((report:any) => relevantCallIds.has(String(report.linked_call_id || '')) || relevantCallIds.has(String(report.linked_call_number || '')) || relevantCallIds.has(String(report.call_number || '')));
    const relevantIncidents = [...new Map([...myIncidents, ...linkedPropertyIncidents].map((report:any) => [String(report.id), report])).values()];

    return Response.json({
      success: true,
      timeEntries: myTimeEntries,
      schedules: mySchedules,
      bids: myBids,
      trainingCompletions: myCompletions,
      trainingAssignments: myAssignments,
      notifications: myNotifications,
      callOuts: myCallOuts,
      qrScanEvents: myScans,
      sharedQrScanEvents: sharedQrScans,
      partnerTimeEntries,
      checkpoints: checkpointsAll.filter((r:any) => r.is_active !== false),
      trainingModules: modulesAll.filter((r:any) => r.active !== false),
      incidents: relevantIncidents,
      commendations: myCommendations,
      complaints: myComplaints,
      clientFeedback: myFeedback,
      performanceReviews: myReviews,
      dailyActivityReports: myDailyReports,
      dispatchCalls: myPropertyCalls,
      jobDutyRules: dutyRulesAll.filter((r:any) => r.active !== false),
      locations: locationsAll,
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
        dailyActivityReports: myDailyReports.length,
        jobDutyRules: dutyRulesAll.length,
        propertyCalls: myPropertyCalls.length,
      },
    });
  } catch (error) {
    console.error('getMyPerformanceData failed', error);
    return Response.json({ error: error?.message || 'Unable to load performance data' }, { status: 500 });
  }
});
