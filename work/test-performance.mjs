import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { calculateJobDutyCompliance as score } from '../src/lib/performanceScoring.js';
const officer={id:'u1',email:'officer@example.test'};
const shift={id:'s1',officer_email:officer.email,location:'Property A',clock_in:'2026-09-26T12:00:00Z',clock_out:'2026-09-26T20:00:00Z'};
const call={id:'c1',call_id:'CAD123',incident:'Alarm',property_site:'Property A',time_received:'2026-09-26T14:00:00Z',status:'New'};
const input={officer,timeEntries:[shift],dispatchCalls:[call],dutyRules:[{property_site:'Property A',active:true,incident_report_required_for_property_calls:true,effective_date:'2026-09-01'}],monthStart:'2026-09-01',monthEnd:'2026-09-30'};
assert.equal(score(input).incidentReports.required,1,'Active call must count without cleared assignment');
assert.equal(score({...input,dispatchCalls:[call,{...call}],timeEntries:[shift,{...shift,id:'s2'}]}).incidentReports.required,1,'No duplicate call obligation');
assert.equal(score({...input,incidentReports:[{linked_call_id:'c1',status:'draft'},{linked_call_number:'CAD123',status:'submitted'}]}).incidentReports.completed,1,'Submitted report after draft counts');
assert.equal(score({...input,incidentReports:[{linked_call_id:'c1',status:'draft'}]}).incidentReports.completed,0);
for(const reason of ['off_property','offsite']){
 const result=score({...input,dispatchCalls:[{...call,performance_decision:{excluded:true,reason}}]});
 assert.equal(result.incidentReports.required,0);assert.equal(result.incidentReports.excluded,1);
}
assert.equal(score({...input,dispatchCalls:[{...call,performance_decision:{excluded:false,reason:'restored'}}]}).incidentReports.required,1);
assert.equal(score({...input,dispatchCalls:[{...call,time_received:'bad date'}]}).incidentReports.required,0);
assert.equal(score({...input,dispatchCalls:[{...call,property_site:'Property B'}]}).incidentReports.required,0);
assert.equal(score({...input,dispatchCalls:[{...call,time_received:'2026-09-26T22:00:00Z'}]}).incidentReports.required,0);
assert.equal(fs.readFileSync('src/lib/performanceScoring.js','utf8'),fs.readFileSync('base44/functions/sendDailyCompanySummary/performanceScoring.js','utf8'));
function handler(path,client){
 const code=ts.transpileModule(fs.readFileSync(path,'utf8').replace(/import .*?from 'npm:@base44\/sdk';/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 let fn;vm.runInNewContext(code,{createClientFromRequest:()=>client,Deno:{serve:f=>fn=f},Response,Date,console,setTimeout,Map,Set});return fn;
}
const request=(body={},headers={})=>new Request('https://example.test',{method:'POST',headers,body:JSON.stringify(body)});
const dispatch='base44/functions/geofenceDispatchAssignment/entry.ts';
let response=await handler(dispatch,{auth:{me:async()=>null}})(request());assert.equal(response.status,401);
response=await handler(dispatch,{auth:{me:async()=>null},entities:{SystemScanRun:{list:async()=>{throw Error('Forbidden')}}}})(request({}, {Authorization:'Bearer invalid'}));assert.equal(response.status,401);
response=await handler(dispatch,{auth:{me:async()=>null},entities:{SystemScanRun:{list:async()=>[]}}})(request({}, {Authorization:'Bearer verified-service'}));assert.equal(response.status,400,'Verified service reaches input validation');
response=await handler(dispatch,{auth:{me:async()=>({id:'u',role:'user'})}})(request());assert.equal(response.status,403);
for(const path of ['base44/functions/getMyPerformanceData/entry.ts','base44/functions/getCompanyAnalyticsSegment/entry.ts']){
 const fn=handler(path,{auth:{me:async()=>({id:'a',email:'admin@example.test',role:'admin'})}});
 for(const bad of ['2026-99-26','2026-02-30','not-a-date']){
   const res=await fn(request({start_date:'2026-01-01',end_date:bad}));assert.equal(res.status,400,path+' rejects '+bad);
 }
}
const schema=JSON.parse(fs.readFileSync('base44/entities/CallPerformanceDecision.jsonc','utf8'));
assert.equal(schema.rls.create.user_condition.role,'admin');assert.equal(schema.rls.update,false);assert.equal(schema.rls.delete,false);
console.log('PASS: active calls, deduplication, submitted reports, exclusions/restoration, invalid dates, service authorization, immutable admin decision schema, scoring parity');
