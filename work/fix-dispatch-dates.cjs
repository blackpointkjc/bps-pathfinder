const fs=require('fs');
const edit=(p,f)=>{let s=fs.readFileSync(p,'utf8'),n=f(s);if(s===n)throw Error('unchanged '+p);fs.writeFileSync(p,n)};
const r=(s,a,b)=>{if(!s.includes(a))throw Error('missing '+a.slice(0,90));return s.replace(a,b)};
edit('base44/functions/geofenceDispatchAssignment/entry.ts',s=>r(s,`    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });`, `    let user = await base44.auth.me().catch(() => null);
    // Service-to-service calls have no interactive user. Validate the caller's
    // actual Authorization token against an admin-only entity through the
    // ordinary client, never the elevated client or a caller-supplied flag.
    if (!user && req.headers.get('Authorization')) {
      try {
        await base44.entities.SystemScanRun.list('-created_date', 1);
        user = { id: 'automatic-dispatch-service', role: 'dispatch', additional_roles: [] };
      } catch { /* Missing or unprivileged credentials remain unauthorized. */ }
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });`));
edit('base44/functions/geofenceDispatchAssignment/entry.ts',s=>r(s,"    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });",`    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    if (!simulation && ['cleared', 'cancelled', 'canceled', 'closed', 'resolved'].includes(lower(call.status))) return Response.json({ success: true, skipped: true, reason: 'Call is no longer active' });`));
edit('base44/functions/ingestGractivecalls/entry.ts',s=>r(s,`  await Promise.allSettled(sideEffects);
  return { success: true, lightweight: true,`, `  await Promise.allSettled(sideEffects);
  // Recover existing alerts after a transient first-evaluation failure. The
  // ingestion lease serializes runs; cap work to keep the minute poll bounded.
  const closedIds = new Set(disappeared.map((call:any) => String(call.id)));
  const activeIds = new Set(saved.filter((call:any) => !closedIds.has(String(call.id)) && !['Cleared','Cancelled'].includes(String(call.status))).map((call:any) => String(call.id)));
  const properties = new Map(monitored.map((property:any) => [String(property.id), property]));
  const candidates = alerts.filter((alert:any) => activeIds.has(String(alert.callId)) && alert.is_test !== true && !['resolved','false_alarm','test'].includes(String(alert.lifecycle_status || '').toLowerCase()) && properties.get(String(alert.propertyId))?.auto_dispatch_enabled === true && properties.get(String(alert.propertyId))?.auto_dispatch_mode === 'live');
  if (candidates.length) {
    try {
      const evaluations = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id: { $in: candidates.map((alert:any) => String(alert.id)) } }, '-evaluated_at', 1000);
      const latest = new Map<string, any>();
      for (const evaluation of evaluations) if (!latest.has(String(evaluation.property_alert_id))) latest.set(String(evaluation.property_alert_id), evaluation);
      const due = candidates.filter((alert:any) => {
        const evaluation = latest.get(String(alert.id));
        if (evaluation?.mode === 'live' && evaluation?.decision === 'assigned') return false;
        const last = new Date(evaluation?.evaluated_at || 0).getTime();
        const interval = Math.max(60, Number(properties.get(String(alert.propertyId))?.auto_dispatch_recheck_seconds) || 60) * 1000;
        return !Number.isFinite(last) || now - last >= interval;
      }).sort((a:any,b:any) => new Date(latest.get(String(a.id))?.evaluated_at || 0).getTime() - new Date(latest.get(String(b.id))?.evaluated_at || 0).getTime());
      for (const alert of due.slice(0, 2)) {
        const response = await base44.asServiceRole.functions.invoke('geofenceDispatchAssignment', { call_id: alert.callId, property_alert_id: alert.id });
        if (response?.data?.error) throw new Error(response.data.error);
      }
    } catch (error) { alertFailures++; console.error('Automatic dispatch recovery deferred to next poll', error?.message || error); }
  }
  return { success: true, lightweight: true,`));
edit('base44/functions/runSystemAudit/entry.ts',s=>{
 s=r(s,"      if (['resolved', 'false_alarm', 'test'].includes(lifecycle)) return false;","      if (alert.is_test === true || ['resolved', 'false_alarm', 'test'].includes(lifecycle)) return false;");
 return r(s,"    const missingLiveEvaluations = activeLivePropertyAlerts.filter(alert => !latestEvaluationByAlert.has(String(alert.id)));",`    // Allow initial processing, and query exact IDs before treating a capped
    // history list as proof that an evaluation does not exist.
    const unchecked = activeLivePropertyAlerts.filter(alert => !latestEvaluationByAlert.has(String(alert.id)) && Date.now() - new Date(alert.created_date || 0).getTime() >= 120000);
    let evaluationLookupFailed = false;
    if (unchecked.length) {
      try {
        const exact = await base44.asServiceRole.entities.AutoDispatchEvaluation.filter({ property_alert_id: { $in: unchecked.map(alert => String(alert.id)) } }, '-evaluated_at', 1000);
        for (const evaluation of exact) latestEvaluationByAlert.set(String(evaluation.property_alert_id), evaluation);
      } catch (error) {
        evaluationLookupFailed = true;
        add(findings, { key:'auto-dispatch:evaluation-read', area:'Automatic Dispatch', severity:'degraded', title:'Automatic-dispatch decisions could not be verified', description:error?.message || 'Evaluation lookup failed' });
      }
    }
    const missingLiveEvaluations = evaluationLookupFailed ? [] : unchecked.filter(alert => !latestEvaluationByAlert.has(String(alert.id)));`);
});
for(const p of ['src/pages/AdminAnalytics.jsx','src/pages/MyPerformanceAnalytics.jsx']) edit(p,s=>{
 s=r(s,'import { format,','import { format as dateFnsFormat,');
 const pos=s.indexOf('\n',s.indexOf("from 'sonner'"));
 // Keep invalid source dates from crashing the entire analytics page.
 const helper="\nconst format = (value, pattern) => value instanceof Date && Number.isFinite(value.getTime()) ? dateFnsFormat(value, pattern) : 'Unknown date';\n";
 s=pos>=0?s.slice(0,pos+1)+helper+s.slice(pos+1):helper+s;
 if(p.includes('AdminAnalytics')){
 s=r(s,"      if (!entry.clock_in || !entry.clock_out || !officerHours[key]) return;","      if (!entry.clock_in || !entry.clock_out || !officerHours[key] || !Number.isFinite(new Date(entry.clock_in).getTime()) || !Number.isFinite(new Date(entry.clock_out).getTime())) return;");
 s=r(s,"      PropertyAlert: ['calls'],","      PropertyAlert: ['calls'],\n      CallPerformanceDecision: ['calls'],");
 s=r(s,"['DispatchCall','CallHistory','PropertyAlert']","['DispatchCall','CallHistory','PropertyAlert','CallPerformanceDecision']");
 }else{
 s=r(s,"      if (!entry.clock_in || !entry.clock_out) return false;","      if (!entry.clock_in || !entry.clock_out || !Number.isFinite(new Date(entry.clock_in).getTime()) || !Number.isFinite(new Date(entry.clock_out).getTime())) return false;");
 s=r(s,"'CallAssignment', 'DispatchCall', 'PropertyAlert',","'CallAssignment', 'DispatchCall', 'PropertyAlert', 'CallPerformanceDecision',");
 }
 return s;
});
edit('src/api/base44Client.js',s=>r(s,"  'JobDutyRule', 'PropertyAlert', 'DispatchCall', 'CallHistory',","  'JobDutyRule', 'PropertyAlert', 'DispatchCall', 'CallHistory', 'CallPerformanceDecision',"));
for(const p of ['base44/functions/getMyPerformanceData/entry.ts','base44/functions/getCompanyAnalyticsSegment/entry.ts']) edit(p,s=>r(s,"    const now = new Date();",`    const validDate = (value:any) => {
      const raw = String(value || '');
      const date = new Date(raw + 'T00:00:00.000Z');
      return /^\\d{4}-\\d{2}-\\d{2}$/.test(raw) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === raw;
    };
    if ((body.start_date && !validDate(body.start_date)) || (body.end_date && !validDate(body.end_date))) return Response.json({ error:'Enter valid start and end dates.' }, { status:400 });
    const now = new Date();`));
