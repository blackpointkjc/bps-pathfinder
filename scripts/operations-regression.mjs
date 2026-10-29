import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {build,transform} from 'esbuild';
const compiled=await build({entryPoints:['src/lib/performanceScoring.js'],bundle:true,write:false,format:'cjs',platform:'node',alias:{'@':process.cwd()+'/src'}});
const context={module:{exports:{}},console,Date};vm.runInNewContext(compiled.outputFiles[0].text,context);
const {calculateCallOutAttendance}=context.module.exports;
const shift={id:'original',shift_date:'2026-01-06',start_time:'08:00',end_time:'16:00',archived:true,attendance_status:'called_out'};
const callout={id:'out',original_shift_id:'original',call_out_date:'2026-01-06',call_out_type:'called_out'};
for(const rank of ['Colonel','Lt Colonel','Major','Officer']){
 const score=calculateCallOutAttendance([callout],[shift],'2026-01-01','2026-01-31',{rank});
 assert.equal(score.score,0,rank+' call-out must not receive 100 or vanish because its shift was archived');assert.equal(score.scheduled,1);
 assert.equal(calculateCallOutAttendance([],[],'2026-01-01','2026-01-31',{rank}).score,null,'No evidence is not 100%');
}
assert.equal(calculateCallOutAttendance([{...callout,voided:true}],[{...shift,archived:false,attendance_status:''}],'2026-01-01','2026-01-31',{}).score,100,'Voided call-outs do not deduct');
async function load(path,api,append=''){
 let handler;const code=fs.readFileSync(path,'utf8').replace(/^import .*\n/gm,'')+append;
 const box={module:{exports:{}},Response,Date,console,setTimeout,clearTimeout,createClientFromRequest:()=>api,Deno:{serve:fn=>handler=fn}};
 vm.runInNewContext((await transform(code,{loader:'ts',format:'cjs'})).code,box);return {handler,exports:box.module.exports};
}
const {exports:adapters}=await load('base44/functions/getCompanyPerformanceData/entry.ts',{},'\nexport {companyPerformanceEntities};');
let continuation=0;const entries=[{id:'first',clock_in:'2026-01-02T12:00:00Z'},{id:'second',clock_in:'2026-01-03T12:00:00Z'}];
const adapter=adapters.companyPerformanceEntities({TimeEntry:{filter:async()=>({items:[entries[0]],next_cursor:'page2'}),list:async options=>{assert.deepEqual(Object.keys(options).sort(),['cursor','limit']);continuation++;return {items:[entries[1]],next_cursor:null};}},User:{list:async(_sort,_limit,skip)=>skip===0?Array.from({length:1000},(_,i)=>({id:String(i)})):[{id:'last'}]}},'2026-01-01','2026-01-31');
assert.equal((await adapter.TimeEntry.list()).length,2);assert.equal(continuation,1,'Second page is fetched with cursor alone');assert.equal((await adapter.User.list()).length,1001,'User directory is not truncated');
const identity={id:'officer',email:'old@example.test',work_email:'new@example.test'};let checkedAliases=false;
const entities=new Proxy({}, {get:(_target,name)=>({list:async()=>[],filter:async query=>{
 if(name==='Schedule'){assert(query.officer_email.$in.includes(identity.email));assert(query.officer_email.$in.includes(identity.work_email));checkedAliases=true;return [shift];}
 if(name==='CallOut')return [callout,{...callout,id:'void',voided:true}];return [];
}})});
const {handler:schedule}=await load('base44/functions/getMyScheduleData/entry.ts',{auth:{me:async()=>identity},asServiceRole:{entities}});
const scheduled=await (await schedule(new Request('https://test',{method:'POST',body:'{}'}))).json();assert(checkedAliases);assert.equal(scheduled.callOuts.length,1);assert.equal(scheduled.schedules[0].id,'original');
const now=new Date().toISOString();const {handler:calls}=await load('base44/functions/getActiveDispatchCalls/entry.ts',{auth:{me:async()=>({id:'officer',user_type:'officer'})},asServiceRole:{entities:{DispatchCall:{filter:async()=>[{id:'live',status:'Active',created_date:now},{id:'closed',status:'Closed',created_date:now},{id:'import',status:'Active',source:'pulsepoint',created_date:'2026-01-01T00:00:00Z'}]}}}});
const feed=await (await calls(new Request('https://test',{method:'POST',body:'{}'}))).json();assert.equal(feed.calls.length,2);assert(!feed.calls.some(row=>row.id==='closed'));
console.log('PASS: call-out scoring at every rank; archived original shift; no fake no-data score; voided call-outs; multi-page analytics; >1000 directory rows; schedule aliases; schedule call-out inclusion; active/terminal dispatch filtering');
