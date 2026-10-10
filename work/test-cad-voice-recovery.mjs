import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const compile = code => ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const backendSource = fs.readFileSync('base44/functions/cad-voice-broadcast/entry.ts','utf8');
let handler, now = Date.now();
const tables = {TimeEntry:[],User:[],CadVoiceBroadcast:[],CadVoiceReceipt:[]};
let actor = {id:'admin',email:'admin@test',role:'admin',status:'Available'};
let requests = 0;
const matches = (row,q) => Object.entries(q).every(([key,value]) => {
  if(key==='$or') return value.some(part=>matches(row,part));
  const actual=row[key];
  if(value && typeof value==='object') return Object.entries(value).every(([op,v]) => {
    if(op==='$ne')return actual!==v;
    if(op==='$exists')return (actual!==undefined)===v;
    if(op==='$gte')return actual>=v;
    if(op==='$in')return Array.isArray(actual)?actual.some(x=>v.includes(x)):v.includes(actual);
    throw Error('unsupported '+op);
  });
  return actual===value;
});
let serial=0;
const db=new Proxy({}, {get:(_,name)=>({
  filter:async(q,sort,limit=500,skip=0)=>{requests++;return tables[name].filter(row=>matches(row,q)).slice(skip,skip+limit);},
  get:async id=>tables[name].find(row=>row.id===id),
  create:async data=>{const row={...data,id:'row-'+(++serial),created_date:new Date(now).toISOString()};tables[name].push(row);return row;}
})});
vm.runInNewContext(compile(backendSource),{exports:{},require:()=>({createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:db}})}),Deno:{serve:fn=>handler=fn},Response,Date,Set,Map,console});
const invoke=async payload=>{const response=await handler({json:async()=>payload});return {status:response.status,...await response.json()};};
const officer={id:'one',email:'one@test',role:'user',additional_roles:['officer'],status:'Available'};
const offDuty={id:'two',email:'two@test',role:'user',status:'Out of Service'};
const terminated={id:'three',email:'three@test',role:'user',status:'Available',termination_date:'2026-01-01'};
tables.User.push(officer,offDuty,terminated);
tables.TimeEntry.push(...tables.User.map((u,i)=>({id:'shift-'+i,officer_email:u.email,clock_in:new Date(now-60000).toISOString(),clock_out:null})));
const sent=await invoke({action:'send',message:'Report to the north gate.',request_key:'12345678-1234-1234'});
assert.equal(sent.status,200);assert.deepEqual(sent.broadcast.recipient_emails,['one@test']);
const duplicate=await invoke({action:'send',message:'Report to the north gate.',request_key:'12345678-1234-1234'});
assert.equal(duplicate.broadcast.id,sent.broadcast.id);assert.equal(tables.CadVoiceBroadcast.length,1);
actor=officer;
assert.equal((await invoke({action:'send',message:'Unauthorized',request_key:'12345678-5678-1234'})).status,403);
assert.equal((await invoke({action:'list'})).broadcasts[0].message,'Report to the north gate.');
assert.equal((await invoke({action:'check',broadcast_id:sent.broadcast.id})).eligible,true);
actor=offDuty;assert.equal((await invoke({action:'list'})).eligible,false);
actor=officer;tables.TimeEntry[0].clock_out=new Date(now).toISOString();
assert.equal((await invoke({action:'check',broadcast_id:sent.broadcast.id})).eligible,false);
tables.TimeEntry.push({id:'new-shift',officer_email:officer.email,clock_in:new Date(now).toISOString(),clock_out:null});
assert.equal((await invoke({action:'check',broadcast_id:sent.broadcast.id})).eligible,false,'new shift cannot replay old announcement');
tables.TimeEntry[0].clock_out=null;
await invoke({action:'ack',broadcast_id:sent.broadcast.id});
assert.equal((await invoke({action:'list'})).broadcasts.length,0,'refresh cannot repeat acknowledged announcement');
console.log('PASS broadcast: admin permission, actual message, duty/termination filtering, offline recovery, shift boundary, durable acknowledgement, send retry identity');

let apiCalls=0, milliseconds=1000000;
class Clock extends Date {static now(){return milliseconds;}}
const sourceExports={};
vm.runInNewContext(compile(fs.readFileSync('base44/functions/getWelcomeBriefingData/sourceRead.ts','utf8')),{exports:sourceExports,Date:Clock,Map,Promise,console,setTimeout:(fn,ms)=>{milliseconds+=ms;fn();}});
const load=async()=>{apiCalls++;return ['ok'];};
await Promise.all([sourceExports.readBriefingSource('same-user',load),sourceExports.readBriefingSource('same-user',load)]);
assert.equal(apiCalls,1);
await sourceExports.readBriefingSource('same-user',load);assert.equal(apiCalls,1);
await assert.rejects(sourceExports.readBriefingSource('limited',async()=>{apiCalls++;throw {status:429};}));
await assert.rejects(sourceExports.readBriefingSource('next-source',load));assert.equal(apiCalls,2,'circuit must stop remaining source reads');
await sourceExports.readBriefingSource('same-user',load);assert.equal(apiCalls,2,'healthy cached section retained');
milliseconds+=61000;
await sourceExports.readBriefingSource('next-source',load);assert.equal(apiCalls,3);
console.log('PASS backend pressure: concurrent dedupe, successful section cache, 429 circuit breaker, automatic recovery');

const existing=fs.readFileSync('work/test-loading-queue.mjs','utf8');
const preamble=existing.slice(0,existing.indexOf('const h = harness();'));
const queueTests=preamble+`
const h=harness();
let count=0;
h.raw.functions.invoke=async()=>{count++;if(count===1)throw {response:{status:429,headers:{'retry-after':'45'}}};return {data:{ok:true}};};
const first=h.base44.functions.invoke('getActiveDispatchCalls',{});
await h.advance(44000);assert.equal(count,1);
await h.advance(3000);assert.equal((await first).data.ok,true);assert.equal(count,2);
const order=harness();
order.storage.set('bps:base44-rate-limit-until',String(order.now()+60000));
const background=order.base44.entities.Ordinary.list();
const cad=order.base44.functions.invoke('getActiveDispatchCalls',{});
await order.advance(26000);await cad;assert.deepEqual(order.starts,['getActiveDispatchCalls']);
await order.advance(35000);await background;assert.deepEqual(order.starts,['getActiveDispatchCalls','Ordinary']);
const pace=harness();const a=pace.base44.entities.First.list(),b=pace.base44.entities.Second.list();
await pace.advance(699);assert.equal(pace.starts.length,1);
await pace.advance(1);await Promise.all([a,b]);assert.equal(pace.starts.length,2);
console.log('PASS client recovery: Retry-After, automatic retry, critical CAD before background, paced starts');
`;
fs.writeFileSync('work/.cad-queue-test.mjs',queueTests);
await import('./.cad-queue-test.mjs');

const storage=new Map();let speechCount=0,utterance,mode='success',allowed=true;
class Utterance {constructor(text){this.text=text;}}
const speech={getVoices:()=>[{name:'Samantha',lang:'en-US'}],resume:()=>{},cancel:()=>{},speak:item=>{utterance=item;speechCount++;queueMicrotask(()=>{if(mode==='blocked')item.onerror({error:'not-allowed'});else {item.onstart();item.onend();}});}};
const voice={};
vm.runInNewContext(compile(fs.readFileSync('src/utils/voiceAnnouncer.js','utf8')),{exports:voice,require:()=>({}),console,Date,Map,Set,Promise,SpeechSynthesisUtterance:Utterance,CustomEvent:class{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},window:{speechSynthesis:speech,SpeechSynthesisUtterance:Utterance,setTimeout:()=>1,clearTimeout:()=>{},dispatchEvent:()=>{},addEventListener:()=>{}},document:{addEventListener:()=>{}}});
const opts={eventId:'broadcast:one',force:true,managedRecovery:true,dedupeMs:0,canPlay:async()=>allowed};
storage.set('bps-voice-enabled','false');
mode='blocked';assert.equal(await voice.announceVoiceAsync('Actual administrator text',opts),false);
assert.equal(storage.has('bps-voice-event:broadcast:one'),false,'blocked speech must not be marked played');
mode='success';assert.equal(await voice.announceVoiceAsync('Actual administrator text',opts),true);
assert.equal(utterance.text,'Actual administrator text');
assert.equal(await voice.announceVoiceAsync('Actual administrator text',opts),false);
allowed=false;const before=speechCount;
assert.equal(await voice.announceVoiceAsync('Off duty must not hear',{...opts,eventId:'broadcast:two'}),false);
assert.equal(speechCount,before);
console.log('PASS speech: actual text, operational force, blocked replay recovery, completed dedupe, duty check at playback');
