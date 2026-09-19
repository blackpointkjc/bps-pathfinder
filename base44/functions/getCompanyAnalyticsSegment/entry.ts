import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const cache = new Map<string, { at:number; rows:any[] }>();

function rolesOf(user:any) {
  return new Set((user?.additional_roles || []).map((role:any) => lower(role)));
}

async function cachedRows(key:string, ttlMs:number, loader:() => Promise<any[]>) {
  const found = cache.get(key);
  if (found && Date.now() - found.at < ttlMs) return found.rows;
  const rows = await loader();
  const normalized = Array.isArray(rows) ? rows : [];
  cache.set(key, { at: Date.now(), rows: normalized });
  return normalized;
}

function canonicalizer(users:any[]) {
  const byEmail = new Map<string,string>();
  const byId = new Map<string,string>();
  for (const user of users || []) {
    const primary = lower(user?.work_email || user?.pathfinder_email || user?.email);
    if (!primary) continue;
    if (user?.id) byId.set(String(user.id), primary);
    const aliases = [
      user?.email, user?.work_email, user?.pathfinder_email,
      user?.microsoft_email, user?.outlook_email,
      ...(Array.isArray(user?.email_aliases) ? user.email_aliases : []),
    ];
    for (const alias of aliases) {
      const key = lower(alias);
      if (key) byEmail.set(key, primary);
    }
  }
  const canonicalEmail = (value:any) => byEmail.get(lower(value)) || lower(value);
  const row = (record:any) => {
    if (!record) return record;
    const idEmail = byId.get(String(record.officer_id || record.user_id || record.created_by_id || ''));
    const primary = idEmail || canonicalEmail(record.officer_email || record.created_by_email || record.created_by);
    if (!primary) return record;
    return {
      ...record,
      ...(record.officer_email !== undefined || idEmail ? { officer_email: primary } : {}),
      ...(record.created_by_email !== undefined ? { created_by_email: canonicalEmail(record.created_by_email) } : {}),
      ...(record.created_by && String(record.created_by).includes('@') ? { created_by: canonicalEmail(record.created_by) } : {}),
    };
  };
  return {
    email: canonicalEmail,
    rows: (items:any[]) => (items || []).map(row),
    users: (users || []).map((user:any) => {
      const primary = byId.get(String(user.id || '')) || canonicalEmail(user.email);
      const aliases = [
        user.email, user.work_email, user.pathfinder_email,
        user.microsoft_email, user.outlook_email,
        ...(Array.isArray(user.email_aliases) ? user.email_aliases : []),
      ].map(canonicalEmail).filter(Boolean);
      return { ...user, email: primary, email_aliases: [...new Set(aliases)] };
    }),
  };
}

function buildDispatchCalls(dispatchCallsLive:any[], callHistory:any[], propertyAlerts:any[]) {
  const alertByCall = new Map<string,any>();
  for (const alert of propertyAlerts || []) {
    if (!alert?.callId) continue;
    const key = String(alert.callId);
    const prior = alertByCall.get(key);
    const hasTime = Boolean(alert.callTime || alert.time_received);
    const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
    const stamp = new Date(alert.created_date || 0).getTime();
    const priorStamp = new Date(prior?.created_date || 0).getTime();
    if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && stamp > priorStamp)) {
      alertByCall.set(key, alert);
    }
  }

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
      if (distance <= 24 * 60 * 60 * 1000 && distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    return best;
  };

  const byOriginalId = new Map<string,any>();
  for (const call of dispatchCallsLive || []) byOriginalId.set(String(call.id), { ...call, original_call_id: call.id });
  for (const call of callHistory || []) {
    const originalId = String(call.original_call_id || call.id || '');
    if (originalId && !byOriginalId.has(originalId)) byOriginalId.set(originalId, { ...call, id: originalId, original_call_id: originalId });
  }

  const result:any[] = [];
  const represented = new Set<string>();
  for (const [originalId, call] of byOriginalId.entries()) {
    const alert = alertByCall.get(originalId);
    if (!alert) continue;
    represented.add(originalId);
    result.push({
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
    const history = historyMatchForAlert(alert);
    result.push({
      id: originalId,
      original_call_id: originalId,
      call_id: originalId,
      property_id: alert.propertyId || '',
      property_site: alert.propertyName || '',
      incident: alert.callIncident || history?.incident || 'Property call',
      location: alert.callLocation || history?.location || alert.propertyName || '',
      latitude: history?.latitude,
      longitude: history?.longitude,
      time_received: alert.callTime || alert.time_received || history?.time_received || alert.created_date,
      status: history?.status || (alert.acknowledged ? 'Closed' : 'Pending'),
    });
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    const roles = rolesOf(me);
    if (!me || (me.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('accounting'))) {
      return Response.json({ error: 'Company analytics access required' }, { status: me ? 403 : 401 });
    }

    const body = await req.json().catch(() => ({}));
    const segment = lower(body.segment || 'core');
    const errors:Record<string,string> = {};
    let activeReads = 0;
    const waiters:Array<() => void> = [];
    const acquire = async () => {
      if (activeReads >= 2) await new Promise<void>(resolve => waiters.push(resolve));
      activeReads += 1;
    };
    const release = () => {
      activeReads = Math.max(0, activeReads - 1);
      waiters.shift()?.();
    };
    const safe = async (entityName:string, loader:() => Promise<any[]>) => {
      await acquire();
      try {
        const rows = await loader();
        return Array.isArray(rows) ? rows : [];
      } catch (error) {
        errors[entityName] = error?.message || 'Unable to read data';
        return [];
      } finally {
        release();
      }
    };
    const entity = (name:string) => (base44.asServiceRole.entities as any)[name];
    const list = (name:string, sort?:string, limit=1000) => safe(name, () => entity(name).list(sort, limit));
    const filter = (name:string, query:any, sort?:string, limit=1000) => safe(name, () => entity(name).filter(query, sort, limit));

    const activityCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0,0,0,0);
    monthStart.setDate(monthStart.getDate() - 2);
    const monthDateCutoff = monthStart.toISOString().slice(0,10);

    const getUsers = () => cachedRows('users', 2 * 60 * 1000, () => entity('User').list('-updated_date', 1000));

    if (segment === 'core') {
      const [users, divisions, timeEntries, schedules, incidentReports] = await Promise.all([
        safe('User', getUsers),
        safe('Division', () => cachedRows('divisions', 10 * 60 * 1000, () => entity('Division').list('division_name', 500))),
        filter('TimeEntry', { clock_in: { $gte: activityCutoff } }, '-clock_in', 2000),
        filter('Schedule', { shift_date: { $gte: monthDateCutoff } }, '-shift_date', 2000),
        filter('IncidentReport', { incident_date: { $gte: monthDateCutoff } }, '-incident_date', 1500),
      ]);
      const c = canonicalizer(users);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        users:c.users, divisions,
        timeEntries:c.rows(timeEntries), schedules:c.rows(schedules),
        incidentReports:c.rows(incidentReports), service_errors:errors,
      });
    }

    if (segment === 'training') {
      const [users, bids, trainingCompletions, trainingAssignments, trainingModules] = await Promise.all([
        safe('User', getUsers),
        filter('ShiftBid', { created_date: { $gte: activityCutoff } }, '-created_date', 1500),
        list('TrainingCompletion', '-completion_date', 1500),
        list('TrainingAssignment', '-assigned_date', 1500),
        safe('TrainingModule', () => cachedRows('trainingModules', 10 * 60 * 1000, () => entity('TrainingModule').list('-created_date', 1000))),
      ]);
      const c = canonicalizer(users);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        bids:c.rows(bids),
        trainingCompletions:c.rows(trainingCompletions),
        trainingAssignments:c.rows(trainingAssignments),
        trainingModules:(trainingModules || []).map((module:any) => ({
          ...module,
          assigned_to:Array.isArray(module.assigned_to) ? module.assigned_to.map(c.email) : module.assigned_to,
        })),
        service_errors:errors,
      });
    }

    if (segment === 'duty') {
      const [users, qrScans, qrCheckpoints, dailyActivityReports, callOuts, dutyRules, locations] = await Promise.all([
        safe('User', getUsers),
        filter('QRScanEvent', { scanned_at: { $gte: activityCutoff } }, '-scanned_at', 2000),
        safe('QRCheckpoint', () => cachedRows('qrCheckpoints', 10 * 60 * 1000, () => entity('QRCheckpoint').list('property_site', 1000))),
        filter('DailyActivityReport', { report_date: { $gte: monthDateCutoff } }, '-report_date', 2000),
        filter('CallOut', { call_out_date: { $gte: monthDateCutoff } }, '-call_out_date', 1000),
        safe('JobDutyRule', () => cachedRows('dutyRules', 10 * 60 * 1000, () => entity('JobDutyRule').list('property_site', 1000))),
        safe('Location', () => cachedRows('locations', 10 * 60 * 1000, () => entity('Location').list('site_name', 1000))),
      ]);
      const c = canonicalizer(users);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        qrScans:c.rows(qrScans), qrCheckpoints,
        dailyActivityReports:c.rows(dailyActivityReports),
        callOuts:c.rows(callOuts), dutyRules, locations,
        service_errors:errors,
      });
    }

    if (segment === 'calls') {
      const [dispatchCallsLive, callHistory, propertyAlerts] = await Promise.all([
        list('DispatchCall', '-time_received', 750),
        filter('CallHistory', { archived_date: { $gte: activityCutoff } }, '-archived_date', 500),
        filter('PropertyAlert', { created_date: { $gte: activityCutoff } }, '-created_date', 1500),
      ]);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        dispatchCalls:buildDispatchCalls(dispatchCallsLive, callHistory, propertyAlerts),
        service_errors:errors,
      });
    }

    if (segment === 'quality') {
      const [users, commendations, complaints, clientFeedback, performanceReviews] = await Promise.all([
        safe('User', getUsers),
        filter('Commendation', { commendation_date: { $gte: monthDateCutoff } }, '-commendation_date', 1000),
        filter('Complaint', { complaint_date: { $gte: monthDateCutoff } }, '-complaint_date', 1000),
        filter('ClientFeedback', { feedback_date: { $gte: monthDateCutoff } }, '-feedback_date', 1000),
        filter('PerformanceReview', { review_date: { $gte: monthDateCutoff } }, '-review_date', 1000),
      ]);
      const c = canonicalizer(users);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        commendations:c.rows(commendations), complaints:c.rows(complaints),
        clientFeedback:c.rows(clientFeedback), performanceReviews:c.rows(performanceReviews),
        service_errors:errors,
      });
    }

    return Response.json({ error:'Unknown analytics segment' }, { status:400 });
  } catch (error) {
    console.error('getCompanyAnalyticsSegment failed', error);
    return Response.json({ error:error?.message || 'Unable to load analytics segment' }, { status:500 });
  }
});