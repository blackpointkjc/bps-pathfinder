import { createClientFromRequest } from 'npm:@base44/sdk';

function rolesOf(user: any) {
  return new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const roles = rolesOf(me);
    if (!me || (me.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('accounting'))) {
      return Response.json({ error: 'Company analytics access required' }, { status: me ? 403 : 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.health_check === true) {
      // The hourly system scan only needs to prove that the analytics backend and
      // its core data services are reachable. Loading all 23 analytics datasets
      // for a health check caused connection-pool/rate-limit cascades.
      const users = await base44.asServiceRole.entities.User.list('-updated_date', 1);
      const timeEntries = await base44.asServiceRole.entities.TimeEntry.list('-clock_in', 1);
      return Response.json({
        success: true,
        health_check: true,
        users: Array.isArray(users) ? users : [],
        timeEntries: Array.isArray(timeEntries) ? timeEntries : [],
        service_errors: {},
      });
    }

    const errors: Record<string, string> = {};
    // Company Analytics is a current-month operating dashboard. Keep database
    // concurrency intentionally low and retry transient reads without turning a
    // short Base44 rate limit into a blank analytics page.
    let activeReads = 0;
    const readWaiters: Array<() => void> = [];
    const acquireReadSlot = async () => {
      if (activeReads >= 2) await new Promise<void>(resolve => readWaiters.push(resolve));
      activeReads += 1;
    };
    const releaseReadSlot = () => {
      activeReads = Math.max(0, activeReads - 1);
      readWaiters.shift()?.();
    };
    const transientReadError = (error:any) => /timed out|timeout|server selection|rate limit|too many requests|\b429\b|temporar/i.test(String(error?.message || error));
    const pause = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
    const safeRead = async (entityName:string, reader:() => Promise<any[]>) => {
      await acquireReadSlot();
      try {
        try {
          return await reader() || [];
        } catch (error) {
          if (!transientReadError(error)) throw error;
          await pause(350);
          return await reader() || [];
        }
      } catch (error) {
        errors[entityName] = error?.message || 'Unable to read data';
        return [];
      } finally {
        releaseReadSlot();
      }
    };
    const list = (entityName: string, sort?: string, limit = 1000) => safeRead(entityName, async () => {
      const entity = (base44.asServiceRole.entities as any)[entityName];
      if (!entity?.list) throw new Error(`${entityName} service is unavailable`);
      return entity.list(sort, limit);
    });
    const filter = (entityName: string, query:any, sort?: string, limit = 1000) => safeRead(entityName, async () => {
      const entity = (base44.asServiceRole.entities as any)[entityName];
      if (!entity?.filter) throw new Error(`${entityName} filter service is unavailable`);
      return entity.filter(query, sort, limit);
    });

    const activityCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setDate(monthStart.getDate() - 2);
    const monthDateCutoff = monthStart.toISOString().slice(0, 10);

    const [users, divisions, timeEntries, schedules, bids, trainingCompletions, trainingAssignments, trainingModules, qrScans, qrCheckpoints, incidentReports, dailyActivityReports, callOuts, callsForService, dispatchCallsLive, callHistory, propertyAlerts, dutyRules, locations, commendations, complaints, clientFeedback, performanceReviews] = await Promise.all([
      list('User', '-updated_date', 1000),
      list('Division', 'division_name', 500),
      filter('TimeEntry', { clock_in: { $gte: activityCutoff } }, '-clock_in', 2000),
      filter('Schedule', { shift_date: { $gte: monthDateCutoff } }, '-shift_date', 2000),
      filter('ShiftBid', { created_date: { $gte: activityCutoff } }, '-created_date', 1500),
      list('TrainingCompletion', '-completion_date', 1500),
      list('TrainingAssignment', '-assigned_date', 1500),
      list('TrainingModule', '-created_date', 1000),
      filter('QRScanEvent', { scanned_at: { $gte: activityCutoff } }, '-scanned_at', 2000),
      list('QRCheckpoint', 'property_site', 1000),
      filter('IncidentReport', { incident_date: { $gte: monthDateCutoff } }, '-incident_date', 1500),
      filter('DailyActivityReport', { report_date: { $gte: monthDateCutoff } }, '-report_date', 2000),
      filter('CallOut', { call_out_date: { $gte: monthDateCutoff } }, '-call_out_date', 1000),
      filter('CallForService', { call_time: { $gte: activityCutoff } }, '-call_time', 1000),
      list('DispatchCall', '-time_received', 750),
      filter('CallHistory', { archived_date: { $gte: activityCutoff } }, '-archived_date', 500),
      filter('PropertyAlert', { created_date: { $gte: activityCutoff } }, '-created_date', 1500),
      list('JobDutyRule', 'property_site', 1000),
      list('Location', 'site_name', 1000),
      filter('Commendation', { commendation_date: { $gte: monthDateCutoff } }, '-commendation_date', 1000),
      filter('Complaint', { complaint_date: { $gte: monthDateCutoff } }, '-complaint_date', 1000),
      filter('ClientFeedback', { feedback_date: { $gte: monthDateCutoff } }, '-feedback_date', 1000),
      filter('PerformanceReview', { review_date: { $gte: monthDateCutoff } }, '-review_date', 1000),
    ]);

    const alertByCall = new Map<string, any>();
    for (const alert of propertyAlerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCall.get(key);
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      const stamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && stamp > priorStamp)) alertByCall.set(key, alert);
    }
    const lower = (value:any) => String(value || '').trim().toLowerCase();
    const historyMatchForAlert = (alert:any) => {
      if (alert?.callTime || alert?.time_received) return null;
      const incident = lower(alert?.callIncident);
      const location = lower(alert?.callLocation);
      const alertStamp = new Date(alert?.created_date || 0).getTime();
      let best:any = null;
      let bestDistance = Infinity;
      for (const row of callHistory || []) {
        if (lower(row?.incident) !== incident || lower(row?.location) !== location) continue;
        const stamp = new Date(row?.time_received || row?.created_date || 0).getTime();
        if (!Number.isFinite(stamp) || !Number.isFinite(alertStamp)) continue;
        const distance = Math.abs(alertStamp - stamp);
        if (distance <= 24 * 60 * 60 * 1000 && distance < bestDistance) { best = row; bestDistance = distance; }
      }
      return best;
    };
    const callsByOriginalId = new Map<string, any>();
    for (const call of dispatchCallsLive || []) callsByOriginalId.set(String(call.id), { ...call, original_call_id: call.id });
    for (const call of callHistory || []) {
      const originalId = String(call.original_call_id || call.id || '');
      if (originalId && !callsByOriginalId.has(originalId)) callsByOriginalId.set(originalId, { ...call, id: originalId, original_call_id: originalId });
    }
    const dispatchCalls:any[] = [];
    const represented = new Set<string>();
    for (const [originalId, call] of callsByOriginalId.entries()) {
      const alert = alertByCall.get(originalId);
      if (!alert) continue;
      represented.add(originalId);
      dispatchCalls.push({
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
      dispatchCalls.push({
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

    return Response.json({
      success: true,
      users,
      divisions,
      timeEntries,
      schedules,
      bids,
      trainingCompletions,
      trainingAssignments,
      trainingModules,
      qrScans,
      qrCheckpoints,
      incidentReports,
      dailyActivityReports,
      callOuts,
      callsForService,
      dispatchCalls,
      dutyRules,
      locations,
      commendations,
      complaints,
      clientFeedback,
      performanceReviews,
      service_errors: errors,
    });
  } catch (error) {
    console.error('getCompanyAnalyticsData failed', error);
    return Response.json({ error: error?.message || 'Unable to load company analytics' }, { status: 500 });
  }
});
