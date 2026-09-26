const fs=require('fs');
let p='base44/functions/getCompanyAnalyticsSegment/entry.ts',s=fs.readFileSync(p,'utf8');
const valid=fs.readFileSync('base44/functions/getMyPerformanceData/entry.ts','utf8').match(/    const validDate = [\s\S]*?\n    const now = new Date\(\);/)[0].replace('    const now = new Date();','    const today = new Date();');
s=s.replace('    const today = new Date();',valid);fs.writeFileSync(p,s);
for(p of ['src/pages/AdminAnalytics.jsx','src/pages/MyPerformanceAnalytics.jsx']){
 s=fs.readFileSync(p,'utf8').replace(' parseISO,',' parseISO as dateFnsParseISO,');
 s=s.replace("const format =", "const parseISO = value => typeof value === 'string' ? dateFnsParseISO(value) : new Date(NaN);\nconst format =");
 fs.writeFileSync(p,s);
}
p='base44/functions/getMyPerformanceData/entry.ts';s=fs.readFileSync(p,'utf8').replace('    const decisionByCall = new Map<string, any>();',"    if (serviceErrors.CallPerformanceDecision) throw new Error('Unable to verify incident performance exclusions: ' + serviceErrors.CallPerformanceDecision);\n    const decisionByCall = new Map<string, any>();");fs.writeFileSync(p,s);
p='base44/functions/geofenceDispatchAssignment/entry.ts';s=fs.readFileSync(p,'utf8').replace("    const property = await withRetry", "    if (!simulation && (alert.is_test === true || ['resolved','false_alarm','test'].includes(lower(alert.lifecycle_status)))) return Response.json({ success:true, skipped:true, reason:'Alert is not active' });\n    const property = await withRetry");fs.writeFileSync(p,s);
