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

    const errors: Record<string, string> = {};
    const list = async (entityName: string, sort?: string) => {
      try {
        const entity = (base44.asServiceRole.entities as any)[entityName];
        if (!entity?.list) throw new Error(`${entityName} service is unavailable`);
        return await entity.list(sort, 3000);
      } catch (error) {
        errors[entityName] = error?.message || 'Unable to read data';
        return [];
      }
    };

    const [users, divisions, timeEntries, schedules, bids, trainingCompletions, trainingAssignments, trainingModules, qrScans, qrCheckpoints, incidentReports, dailyActivityReports, callOuts, callsForService, dispatchCallsLive, callHistory, propertyAlerts, dutyRules, locations, commendations, complaints, clientFeedback, performanceReviews] = await Promise.all([
      list('User', '-updated_date'),
      list('Division', 'division_name'),
      list('TimeEntry', '-clock_in'),
      list('Schedule', '-shift_date'),
      list('ShiftBid', '-created_date'),
      list('TrainingCompletion', '-completion_date'),
      list('TrainingAssignment', '-assigned_date'),
      list('TrainingModule', '-created_date'),
      list('QRScanEvent', '-scanned_at'),
      list('QRCheckpoint', 'property_site'),
      list('IncidentReport', '-incident_date'),
      list('DailyActivityReport', '-report_date'),
      list('CallOut', '-call_out_date'),
      list('CallForService', '-call_time'),
      list('DispatchCall', '-time_received'),
      list('CallHistory', '-archived_date'),
      list('PropertyAlert', '-created_date'),
      list('JobDutyRule', 'property_site'),
      list('Location', 'site_name'),
      list('Commendation', '-commendation_date'),
      list('Complaint', '-complaint_date'),
      list('ClientFeedback', '-feedback_date'),
      list('PerformanceReview', '-review_date'),
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
