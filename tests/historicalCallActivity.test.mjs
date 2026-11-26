import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { addressHistoryPattern } from '../base44/functions/_shared/addressHistoryMatch.js';
import { callTimestamp, isValidCallRecord, isVisibleActiveCall, ACTIVE_WINDOW_MS } from '../base44/functions/_shared/callFeedPolicy.js';

const match = address => new RegExp(addressHistoryPattern(address), 'i');
assert(match('3000 Griffin Avenue, Richmond, VA 23222').test('3000 GRIFFIN AVE'));
assert(match('6600 Van Buren Avenue, Henrico, VA').test('6600 Block VAN BUREN AVE'));
assert(match('200 West 7th Street Apt 2, Richmond, VA').test('200 W 7TH ST RICH'));
assert(!match('3000 Griffin Avenue, Richmond, VA').test('3001 GRIFFIN AVE'));
assert(!match('3000 Griffin Avenue').test('3000 GRIFFIN AVENUE EXTENSION'));
assert.equal(addressHistoryPattern('Main Street'), '');
const now = Date.now();
const live = { id:'live', incident:'Service Call', location:'3000 GRIFFIN AVE', agency:'RPD', time_received:new Date(now-60000).toISOString(), created_date:new Date(now).toISOString(),status:'New' };
assert(isVisibleActiveCall(live,now));
assert(!isVisibleActiveCall({...live,time_received:new Date(now-2*86400000).toISOString()},now));
assert(!isVisibleActiveCall({...live,time_received:new Date(now+600000).toISOString()},now));
assert(!isVisibleActiveCall({...live,time_cleared:new Date().toISOString()},now));
assert(!isVisibleActiveCall({...live,is_test:true},now));
assert.equal(callTimestamp({...live,time_received:'2026-10-29T15:00:00'}),Date.parse('2026-10-29T15:00:00Z'));

function matches(row, query) {
 return Object.entries(query).every(([field, value]) => {
  if(field==='$and') return value.every(part=>matches(row,part));
  if(field==='$or') return value.some(part=>matches(row,part));
  const actual=row[field];
  if (value && typeof value==='object') return Object.entries(value).every(([op,expected])=>{
   if(op==='$options')return true;
   if(op==='$regex')return new RegExp(expected,value.$options||'').test(String(actual||''));
   if(op==='$gte')return actual!=null && String(actual)>=String(expected);
   if(op==='$lte')return actual!=null && String(actual)<=String(expected);
   if(op==='$in')return expected.includes(actual);
   if(op==='$nin')return !expected.includes(actual);
   if(op==='$ne')return actual!==expected;
   if(op==='$exists')return (actual!==undefined)===expected;
   throw new Error('Unimplemented query operator: '+op);
  });
  return value===null?actual==null:actual===value;
 });
}
const records={CallNote:[],CallStatusLog:[],ActiveOfficer:[],DispatchCall:[],CallHistory:[],PropertyAlert:[],CallAssignment:[],Unit:[],User:[],ReportCallLink:[],PropertyCallLink:[],Location:[]};
const reads=[];
let role='admin', failSource='',officer=false;
records.PortalAuthSession=[{user_id:'viewer',token_hash:Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('history-test'))).toString('hex'),started_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),revoked:false}];
const api = {
 auth:{me:async()=>({id:'viewer',email:'viewer@example.test',role})},
 asServiceRole:{entities:new Proxy({}, {get:(_,entity)=>({
   filter:async(query,sort,limit=50,skip=0)=>{
    reads.push({entity,query,limit,skip});
    if(entity===failSource)throw new Error('source offline');
    const field=sort?.replace(/^-/,'');
    const rows=(records[entity]||[]).filter(row=>matches(row,query));
    if(field) rows.sort((a,b)=>String(a[field]||'').localeCompare(String(b[field]||''))*(sort.startsWith('-')?-1:1));
    return rows.slice(skip,skip+limit);
   },
   get:async id=>(records[entity]||[]).find(row=>row.id===id)||null,
 })})}
};
async function loadHandler(path) {
 let handler;
 const source=(await readFile(path,'utf8')).replace(/^import .*;\s*$/gm,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 vm.runInNewContext(js,{createClientFromRequest:()=>api,Deno:{serve:fn=>{handler=fn;}},crypto,TextEncoder,Response,console,setTimeout,clearTimeout,Date,Map,Set,Promise,callTimestamp,isValidCallRecord,isVisibleActiveCall,ACTIVE_WINDOW_MS,addressHistoryPattern});
 return async body=>{
  api.auth.me=async()=>({id:'viewer',email:'viewer@example.test',role,additional_roles:officer?['officer']:[]});
  const response=await handler({json:async()=>body,headers:new Headers({authorization:'Bearer history-test'})});
  return {status:response.status,data:await response.json()};
 };
}
const history=await loadHandler('base44/functions/getCallHistoryFeed/entry.ts');

const stamp=new Date(now-60000).toISOString();
records.CallHistory=[{...live,id:'archive',original_call_id:'original',call_id:'BPS-202611-123',status:'Cleared',description:'Original incident narrative',time_cleared:new Date(now).toISOString()}];
records.CallNote=[{id:'note1',call_id:'original',author_id:'officer1',author_name:'Officer Test',note:'Checked property; no incident found.',note_type:'clear',created_date:stamp}];
records.CallStatusLog=[{id:'log1',call_id:'original',unit_id:'officer1',unit_name:'Officer Test',new_status:'On Scene',event_type:'unit_on_scene',created_date:stamp}];
records.CallAssignment=[{id:'assign1',call_id:'original',unit_id:'officer1',role:'primary',status:'cleared',assigned_at:stamp,cleared_at:new Date(now).toISOString(),description:'Disposition: unfounded'}];
records.User=[{id:'officer1',rank:'Officer',last_name:'Test',unit_number:'101'}];
for(const id of ['archive','original']){
 const result=await history({action:'call_details',call_id:id});
 assert.equal(result.status,200);
 assert.equal(result.data.note_count,1);
 assert.equal(result.data.log_count,1);
 assert(result.data.timeline.some(x=>x.text==='Checked property; no incident found.'));
 assert(result.data.timeline.some(x=>x.title==='unit on scene'));
 assert.equal(result.data.assignments[0].description,'Disposition: unfounded');
 assert.equal(result.data.assignments[0].label,'Unit 101 Officer Test');
}
failSource='CallNote';
const degraded=await history({action:'call_details',call_id:'archive'});
assert(degraded.data.warnings.some(x=>x.includes('notes')));
failSource='';role='client';
assert.equal((await history({action:'call_details',call_id:'archive'})).status,403);
console.log('PASS: archived original ID and archive ID, notes, statuses, officer names, dispositions, degraded data warnings and access control');
