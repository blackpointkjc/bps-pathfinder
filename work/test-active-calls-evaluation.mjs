import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
const compile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const matches=(row,query)=>Object.entries(query).every(([key,value])=>{
 if(key==='$or')return value.some(q=>matches(row,q));
 const actual=row[key];
 if(value && typeof value==='object')return Object.entries(value).every(([op,v])=>{
  if(op==='$exists')return (actual!==undefined)===v;
  if(op==='$lte')return actual<=v;
  if(op==='$gte')return actual>=v;
  if(op==='$gt')return actual>v;
  if(op==='$ne')return actual!==v;
  if(op==='$nin')return !v.includes(actual);
  if(op==='$regex')return new RegExp(v,value.$options).test(actual || '');
  if(op==='$options')return true;
  throw Error(op);
 });
 return actual===value || (value===null && actual===undefined);
});
let handler, releaseUsers, startedUsers;
const entered=new Promise(resolve=>startedUsers=resolve);
const table={DispatchCall:[{id:'call',status:'New',created_date:new Date().toISOString()}],
PropertyAlert:[{id:'alert',callId:'call',propertyId:'property',source_key:'event'}],
Location:[{id:'property',auto_dispatch_enabled:true,auto_dispatch_mode:'shadow',latitude:37,longitude:-77}],
User:[],ActiveOfficer:[],TimeEntry:[],CallAssignment:[],AutoDispatchEvaluation:[]};
let blockUsers=true, failExisting=false, creates=0;
const entities=new Proxy({}, {get:(_,name)=>({
 get:async id=>table[name].find(row=>row.id===id),
 list:async()=>{if(name==='User' && blockUsers){startedUsers();await new Promise(r=>releaseUsers=r);}return table[name];},
 filter:async query=>{if(name==='AutoDispatchEvaluation' && failExisting)throw {status:429,message:'rate limit'};return table[name].filter(row=>matches(row,query));},
 updateMany:async(query,data)=>{const rows=table[name].filter(row=>matches(row,query));for(const row of rows)Object.assign(row,data.$set);return {success:true,updated:rows.length};},
 update:async(id,data)=>{const row=table[name].find(row=>row.id===id);Object.assign(row,data);return row;},
 create:async data=>{creates++;const row={...data,id:'evaluation-'+creates};table[name].push(row);return row;}
})});
vm.runInNewContext(compile(fs.readFileSync('base44/functions/geofenceDispatchAssignment/entry.ts','utf8')),{exports:{},require:()=>({createClientFromRequest:()=>({auth:{me:async()=>({id:'admin',role:'admin'})},asServiceRole:{entities}})}),Deno:{serve:fn=>handler=fn},Date,Set,Map,Response,console:{error:()=>{},warn:()=>{}},crypto:{randomUUID},setTimeout});
const request=()=>({headers:new Headers(),json:async()=>({call_id:'call',property_alert_id:'alert'})});
const first=handler(request());await entered;
const competing=await handler(request());assert.equal((await competing.json()).reason,'evaluation_in_progress');
releaseUsers();assert.equal((await (await first).json()).success,true);assert.equal(creates,1);
blockUsers=false;
assert.equal((await (await handler(request())).json()).success,true);assert.equal(creates,1,'re-evaluation updates canonical decision');
failExisting=true;
assert.equal((await handler(request())).status,429);assert.equal(creates,1,'failed existence check cannot create duplicate');
assert.equal(table.PropertyAlert[0].auto_dispatch_lock_token,'','lease released on failure');
console.log('PASS evaluator: concurrent requests serialized, existing row reused, 429 fails closed, lease released');

let feedHandler, querySeen, reads=0;
const recent=new Date().toISOString(), old=new Date(Date.now()-86400000).toISOString();
const feedRows=Array.from({length:350},(_,i)=>({id:'active-'+i,status:'New',created_date:recent}));
feedRows.push({id:'closed',status:'Cleared',created_date:recent},{id:'dismissed',manual_dismissed:true,status:'New',created_date:recent},{id:'old',status:'New',created_date:old},{id:'pulse',source:'pulsepoint',status:'New',created_date:old});
const feedDb={DispatchCall:{filter:async query=>{reads++;querySeen=query;return feedRows.filter(row=>matches(row,query));}}};
vm.runInNewContext(compile(fs.readFileSync('base44/functions/getActiveDispatchCalls/entry.ts','utf8')),{exports:{},require:()=>({createClientFromRequest:()=>({auth:{me:async()=>({id:'admin',role:'admin'})},asServiceRole:{entities:feedDb}})}),Deno:{serve:fn=>feedHandler=fn},Date,Set,Map,Response,console});
const response=await feedHandler({headers:new Headers(),json:async()=>({limit:500})});
const data=await response.json();assert.equal(data.calls.length,351);assert.ok(data.calls.some(x=>x.id==='pulse'));assert.ok(!data.calls.some(x=>['closed','dismissed','old'].includes(x.id)));
assert.equal(querySeen.manual_dismissed.$ne,true);
await feedHandler({headers:new Headers(),json:async()=>({limit:100})});assert.equal(reads,1,'warm callers share backend snapshot');
console.log('PASS active feed: filtered database query, no 200-row truncation, PulsePoint retention, warm cache');

const preamble=fs.readFileSync('work/test-loading-queue.mjs','utf8').split('const h = harness();')[0];
fs.writeFileSync('work/.active-call-slot-test.mjs',preamble+`
const h=harness();let finishSlow;
h.raw.functions.invoke=async name=>{h.starts.push(name);if(name==='getWelcomeBriefingData')return new Promise(r=>finishSlow=r);return {data:{calls:[]}};};
const slow=h.base44.functions.invoke('getWelcomeBriefingData',{});
await h.advance(1);
const background=h.base44.entities.Ordinary.list();await h.advance(1000);
assert.equal(h.starts.length,1,'second background cannot consume reserved slot');
const cad=h.base44.functions.invoke('getActiveDispatchCalls',{});
await h.advance(1);await cad;assert.ok(h.starts.includes('getActiveDispatchCalls'),'CAD starts while briefing is unresolved');
finishSlow({data:{}});await h.advance(1000);await Promise.all([slow,background]);
console.log('PASS scheduling: stalled briefing leaves immediate capacity for active calls');
`);
await import('./.active-call-slot-test.mjs');
const storage=new Map();let feedCalls=0, returnEmpty=false;
const active={};
vm.runInNewContext(compile(fs.readFileSync('src/lib/activeDispatchCalls.js','utf8')),{exports:active,require:name=>name.includes('base44Client')?{base44:{functions:{invoke:async()=>{feedCalls++;return {data:{calls:returnEmpty?[]:Array.from({length:5},(_,i)=>({id:'x'+i,incident:'incident'+i,location:'address'+i,status:'New',created_date:recent}))}};}},entities:{}}}:{withRequestTimeout:p=>p},window:{localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}},Date,Set,Map,console});
const [small,big]=await Promise.all([active.loadActiveDispatchCallRows(1),active.loadActiveDispatchCallRows(5)]);
assert.equal(feedCalls,1);assert.equal(small.length,1);assert.equal(big.length,5);
returnEmpty=true;active.clearActiveDispatchCallMemoryCache();await active.loadActiveDispatchCallRows(5);
assert.equal(active.readLastGoodCalls().length,0,'empty authoritative feed must clear stale cache');
console.log('PASS shared loader: single request, per-consumer limits, empty feed clears old calls');
