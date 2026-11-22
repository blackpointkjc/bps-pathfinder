import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build,transform} from 'esbuild';
const bundled=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const {scheduledTeam}=await bundled('base44/shared/reportTeam.ts');
const a={id:'a',email:'a@test',additional_roles:['officer']},b={id:'b',email:'b@test',first_name:'Partner',additional_roles:['officer']},c={id:'c',email:'c@test',additional_roles:['officer']};
const shift=(id,email,day,start,end,location='Alpha')=>({id,officer_email:email,shift_date:day,start_time:start,end_time:end,location});
const schedules=[shift('a1',a.email,'2026-11-20','20:00','04:00'),shift('b1',b.email,'2026-11-21','00:00','04:00'),shift('c1',c.email,'2026-11-21','04:00','12:00'),shift('c2',c.email,'2026-11-20','20:00','04:00','Bravo')];
const team=scheduledTeam({user:a,data:{incident_date:'2026-11-20',location:'Alpha'},schedules,users:[a,b,c],now:Date.parse('2026-11-21T06:00:00Z')});
assert.deepEqual(team.attached_officer_ids,['b'],'overnight overlapping partner only; incoming and other sites excluded');
assert.deepEqual(scheduledTeam({user:a,data:{report_date:'2026-11-20',location:'Other'},schedules,users:[a,b,c]}).attached_officer_ids,[]);
assert.deepEqual(scheduledTeam({user:a,data:{report_date:'2026-11-20',location:'Alpha'},schedules:schedules.map(r=>r.id==='b1'?{...r,attendance_status:'called_out'}:r),users:[a,b,c]}).attached_officer_ids,[]);
assert.deepEqual(scheduledTeam({user:a,data:{report_date:'2026-11-20',location:'Alpha'},schedules,users:[a,{...b,disabled:true},c]}).attached_officer_ids,[]);
console.log('PASS schedule team: overnight overlap, incoming shifts, wrong sites, absences, disabled officers');
const backend=async(path,sdk)=>{
 globalThis.__testSdk=sdk;
 let code=fs.readFileSync(path,'utf8').replace(/^import .*from ['"]npm:@base44\/sdk['"];?$/m,'const createClientFromRequest=()=>globalThis.__testSdk;').replace(/^import .*portalLoginGuard.ts['"];?$/m,"const portalSessionState=async()=>({state:'current'});");
 if(code.includes('Deno.serve')){globalThis.Deno={serve:fn=>{globalThis.__testHandler=fn;}};}
 const r=await transform(code,{loader:'ts',format:'esm'});
 const mod=await import('data:text/javascript;base64,'+Buffer.from(r.code).toString('base64')+'#'+Math.random());
 return mod.default||globalThis.__testHandler;
};
const oldRows=Array.from({length:1501},(_,i)=>({id:String(i).padStart(5,'0'),description:i===1500?'ancient needle':'ordinary',incident_date:'2025-01-01'}));
const incident={list:async(_sort,limit,skip=0)=>oldRows.slice(skip,skip+limit),get:async id=>oldRows.find(r=>r.id===id)};
const sdk={auth:{me:async()=>a},asServiceRole:{entities:{IncidentReport:incident}},entities:{IncidentReport:incident}};
const search=await backend('base44/functions/searchCompanyRecords/entry.ts',sdk);
const call=async(fn,body)=>{const r=await fn(new Request('https://test.local',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
let cursor=null,matches=[],pages=0;
do{const r=await call(search,{query:'ancient needle',entities:['IncidentReport'],cursor});assert.equal(r.status,200);matches.push(...r.data.results);cursor=r.data.next_cursor;pages++;assert.ok(pages<10);}while(cursor);
assert.equal(matches.length,1);assert.equal(matches[0].id,'01500');assert.equal(pages,2,'continuation beyond first batch');
assert.equal((await call(search,{action:'get',entity:'ConfidentialReport',id:'x'})).status,403);
console.log('PASS records search: oldest row beyond 1500 records, continuation, restricted record detail');
const fairReads=[];
const fairEntities=new Proxy({}, {get:(_target,name)=>({filter:async(_query,_sort,limit,skip=0)=>{fairReads.push({name,skip});return name==='DispatchCall'?oldRows.slice(skip,skip+limit):[];},list:async(_sort,limit,skip=0)=>{fairReads.push({name,skip});return name==='DispatchCall'?oldRows.slice(skip,skip+limit):name==='IncidentReport'?[{id:'found-report',description:'specific needle'}]:[];}})});
const fair=await backend('base44/functions/searchCompanyRecords/entry.ts',{auth:{me:async()=>a},entities:fairEntities,asServiceRole:{entities:fairEntities}});
const first=await call(fair,{query:'specific needle'});
assert.equal(first.status,200,JSON.stringify(first.data));
assert(first.data.results.some(r=>r.id==='found-report'),'reports appear before a large dispatch source finishes');
assert.equal(fairReads.filter(r=>r.name==='DispatchCall').length,1,'only one page of a large source per turn');
assert(first.data.next_cursor.source>0,'source progress advances on the first response');
console.log('PASS search fairness: large CAD history cannot starve reports or freeze progress at zero');

let saved;
const people=[{...a,first_name:'Alex',last_name:'Officer',profile_photo_url:'https://example.test/existing.jpg'},{...b,additional_roles:['supervisor'],profile_photo_url:'https://example.test/partner.jpg'}];
const admin={id:'admin',email:'admin@test',role:'admin'};
const showSdk={auth:{me:async()=>admin},asServiceRole:{entities:{User:{list:async()=>people,get:async id=>people.find(p=>p.id===id),filter:async q=>people.filter(p=>q.id.$in.includes(p.id))},PortalShowcase:{filter:async()=>[],list:async()=>[],create:async value=>{saved={...value,id:'award'};return saved;},update:async(_id,value)=>{saved=value;return value;}}}}};
const showcase=await backend('base44/functions/portalShowcase/entry.ts',showSdk);
const roster=(await call(showcase,{action:'people'})).data.people;
assert.deepEqual(roster.find(p=>p.id==='a').roles,['officer']);assert.deepEqual(roster.find(p=>p.id==='b').roles,['supervisor']);
const award=await call(showcase,{action:'save',item:{kind:'officer',user_id:'a',title:'Forged name',image_url:'https://example.test/forged.jpg',month:'2026-11'}});
assert.equal(award.status,200);assert.equal(saved.title,'Alex Officer');assert.equal(saved.image_url,'https://example.test/existing.jpg');assert.equal(saved.user_id,'a');
assert.equal((await call(showcase,{action:'save',item:{kind:'supervisor',user_id:'a',title:'Wrong role',month:'2026-11'}})).status,400);
console.log('PASS recognition: role-filtered roster, profile-owned name/photo, wrong-role rejection');
const {workAsReports}=await bundled('base44/shared/reportWork.ts');
assert.equal(workAsReports([{id:'w',status:'cancelled'}]).length,0);
assert.equal(workAsReports([{id:'w',status:'in_progress',report_entity:'IncidentReport',officer_id:'a'}])[0].status,'in_progress');
console.log('PASS report work: started vs cancelled lifecycle');
const {calculateJobDutyCompliance}=await bundled('src/lib/performanceScoring.js');
const duty={officer:b,timeEntries:[{id:'tb',officer_email:b.email,location:'Alpha',clock_in:'2026-11-21T05:00:00Z',clock_out:'2026-11-21T09:00:00Z'}],dailyReports:[{id:'team-dar',officer_email:a.email,report_date:'2026-11-21',location:'Alpha',status:'in_progress',team_credit_source:'schedule',attached_officer_ids:['b'],attached_officer_emails:[b.email]}],dutyRules:[{property_site:'Alpha',active:true,dar_required:true}],monthStart:'2026-11-01',monthEnd:'2026-11-30'};
const credit=calculateJobDutyCompliance(duty);
assert.ok(credit.dailyActivity.completed>0,'scheduled partner receives started DAR obligation credit');
const noCredit=calculateJobDutyCompliance({...duty,officer:c,timeEntries:duty.timeEntries.map(t=>({...t,officer_email:c.email}))});
assert.equal(noCredit.dailyActivity.completed,0,'unrelated officer is not credited');
const overnightCredit=calculateJobDutyCompliance({...duty,dailyReports:[{...duty.dailyReports[0],...team,report_date:'2026-11-20'}]});
assert.equal(overnightCredit.dailyActivity.completed,1,'overnight partners are credited across operational dates');
console.log('PASS duty obligation: started scheduled partner credit, overnight credit, no unrelated-officer credit');
for(const file of ['src/pages/RecordsAssistant.jsx','src/components/admin/LoginShowcaseManager.jsx','src/pages/DailyActivityReports.jsx','src/pages/IncidentReports.jsx','src/pages/ShiftReports.jsx','src/pages/ShiftHandover.jsx','src/pages/ConfidentialReport.jsx','src/pages/MaintenanceReports.jsx','src/pages/OpenDoorReports.jsx','src/pages/ExpenseReports.jsx','src/pages/ParkingRecords.jsx','src/api/base44Client.js','src/hooks/useAutomaticReportTeam.js','base44/functions/prepareReportTeam/entry.ts','base44/functions/portalShowcase/entry.ts']){
 await transform(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':file.endsWith('.ts')?'ts':'js'});
}
console.log('PASS syntax checks for all changed frontend flows and new backend handlers');

const helperSource=fs.readFileSync('src/lib/searchAllRecords.js','utf8').replace(/^import .*;$/m,'const base44=globalThis.__searchSdk;');
let helperCalls=0;
globalThis.__searchSdk={functions:{invoke:async(_name,body)=>{helperCalls++;return {data:body.cursor?{results:[{id:'older',entity:'IncidentReport',match_context:'reference',date:'2020-01-01'}],searched_sources:1,total_sources:2}:{results:[{id:'new',entity:'IncidentReport',match_context:'report text',date:'2026-01-01'}],searched_sources:1,total_sources:2,next_cursor:{source:1,offset:0}}};}}};
const searchModule=await import('data:text/javascript;base64,'+Buffer.from(helperSource).toString('base64'));
const merged=await searchModule.searchAllRecords({query:'example'});
assert.equal(helperCalls,2);assert.equal(merged.results.length,2);assert.equal(merged.results[0].id,'older');
assert.equal((await searchModule.searchAllRecords({query:'x'},{isCurrent:()=>false})).cancelled,true);
const voiceSource=fs.readFileSync('src/utils/voiceAnnouncer.js','utf8');
const voiceFn=voiceSource.slice(voiceSource.indexOf('export function announceRecordSearch('));
const voiceModule=await import('data:text/javascript;base64,'+Buffer.from('const announceVoice=(text)=>text;\n'+voiceFn).toString('base64'));
const spoken=voiceModule.announceRecordSearch([{source:'Incident Reports',label:'IR-42',person:'Example Person',location:'Alpha',status:'submitted',warrant_issued:true}],{partial:true});
assert.doesNotMatch(spoken,/Partial records response|sources were unavailable/);assert.match(spoken,/IR-42/);assert.match(spoken,/Example Person/);assert.match(spoken,/Current status unverified/);
assert.match(voiceModule.announceRecordSearch([]),/No matching records/);
console.log('PASS paginated client merge, relevance order, cancellation and spoken result content');
for(const path of ['base44/shared/reportTeam.ts','base44/shared/reportWork.ts','base44/functions/manageParkingRecords/entry.ts','base44/functions/getMyPerformanceData/performanceData.ts','base44/functions/getCompanyPerformanceData/entry.ts','base44/functions/syncSupervisorOperationalTasks/entry.ts','base44/functions/sendDailyCompanySummary/entry.ts']){
 await transform(fs.readFileSync(path,'utf8'),{loader:'ts'});
}
for(const name of ['TeamReportWork','PortalShowcase','DailyActivityReport','IncidentReport','ShiftReport','ShiftHandover','ConfidentialReport','ExpenseReport','QRScanEvent','ParkingViolation','MaintenanceReport','OpenDoorReport']){
 const schema=JSON.parse(fs.readFileSync('base44/entities/'+name+'.jsonc','utf8'));assert.equal(schema.name,name);
}
console.log('PASS dependent backend syntax and persisted entity schemas');
