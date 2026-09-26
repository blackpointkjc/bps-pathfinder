const fs=require('fs');
function edit(p, fn){const s=fs.readFileSync(p,'utf8');const n=fn(s);if(n===s)throw Error('No change '+p);fs.writeFileSync(p,n);}
function replace(s,a,b){if(!s.includes(a))throw Error('Missing '+a.slice(0,90));return s.replace(a,b);}
edit('src/lib/performanceScoring.js',s=>{
 s=replace(s,'  callAssignments = [],\n','');
 s=s.replace(/  const completedAssignmentCallIds = new Set\(callAssignments[\s\S]*?\.filter\(Boolean\)\);/, '  const countedIncidentCalls = new Set();');
 s=s.replace(/      const callIds = \[call.id, call.original_call_id, call.call_id\][\s\S]*?completedAssignmentCallIds.has\(id\)\)\) return false;\n/,'');
 s=replace(s,"        const callDate = easternDateKey(call.time_received || call.created_date);",`        const identity = String(call.original_call_id || call.id || call.call_id || '');
        if (!identity || countedIncidentCalls.has(identity)) return;
        countedIncidentCalls.add(identity);
        if (call.performance_decision?.excluded === true) {
          incidentExcluded++;
          detail.incidents.excluded++;
          detail.incidents.items.push({ call_id: identity, call_number: call.bps_reference || call.agency_cad_number || call.call_id || identity, call_type: call.incident || call.incident_type || 'Call for service', call_location: call.location || detail.property, status: 'excluded_admin', reason: call.performance_decision.reason === 'off_property' ? 'Off property' : 'Offsite', decision_by: call.performance_decision.created_by, decision_at: call.performance_decision.created_date });
          return;
        }
        const callDate = easternDateKey(call.time_received || call.created_date);`);
 s=replace(s,'        const report = officerIncidents.find(ir =>\n',"        const report = officerIncidents.filter(ir => !['draft', 'rejected'].includes(String(ir.status || '').toLowerCase())).find(ir =>\n");
 return s;
});
fs.copyFileSync('src/lib/performanceScoring.js','base44/functions/sendDailyCompanySummary/performanceScoring.js');
const decorate=`    const decisions = myPropertyCalls.length ? await safeFilter('CallPerformanceDecision', { call_id: { $in: myPropertyCalls.map((call:any) => String(call.id)) } }, '-created_date', 5000) : [];
    const decisionByCall = new Map<string, any>();
    for (const decision of decisions) if (!decisionByCall.has(String(decision.call_id))) decisionByCall.set(String(decision.call_id), decision);
    for (const call of myPropertyCalls) call.performance_decision = decisionByCall.get(String(call.id)) || null;
`;
edit('base44/functions/getMyPerformanceData/entry.ts',s=>replace(s,'    const relevantCallIds = new Set(',decorate+'    const relevantCallIds = new Set(').replace('        call_id: originalId,','        call_id: alert.cadNumber || originalId,'));
edit('base44/functions/getCompanyAnalyticsSegment/entry.ts',s=>replace(s,"      return Response.json({\n        success:true, segment, generated_at:new Date().toISOString(),\n        dispatchCalls:buildDispatchCalls(dispatchCallsLive, callHistory, propertyAlerts),",`      const calls = buildDispatchCalls(dispatchCallsLive, callHistory, propertyAlerts);
      const decisions = calls.length ? await filter('CallPerformanceDecision', { call_id: { $in: calls.map((call:any) => String(call.id)) } }, '-created_date', 5000) : [];
      const decisionByCall = new Map<string, any>();
      for (const decision of decisions) if (!decisionByCall.has(String(decision.call_id))) decisionByCall.set(String(decision.call_id), decision);
      return Response.json({
        success:true, segment, generated_at:new Date().toISOString(),
        dispatchCalls:calls.map((call:any) => ({ ...call, performance_decision:decisionByCall.get(String(call.id)) || null })),`));
edit('base44/functions/sendDailyCompanySummary/entry.ts',s=>{
 s=replace(s,'performanceReviews, propertyAlerts,','performanceReviews, propertyAlerts, performanceDecisions,');
 s=replace(s,"      safeList(base44, 'PropertyAlert', '-created_date'),","      safeList(base44, 'PropertyAlert', '-created_date'),\n      base44.asServiceRole.entities.CallPerformanceDecision.list('-created_date', 5000),");
 s=replace(s,'    const dispatchCalls = [...alertByCall.entries()]',`    const decisionByCall = new Map<string, any>();
    for (const decision of performanceDecisions) if (!decisionByCall.has(String(decision.call_id))) decisionByCall.set(String(decision.call_id), decision);
    const dispatchCalls = [...alertByCall.entries()]`);
 s=replace(s,'      original_call_id: callId,','      original_call_id: callId,\n      performance_decision: decisionByCall.get(callId) || null,');
 return replace(s,'      call_id: callId,','      call_id: alert.cadNumber || callId,');
});
