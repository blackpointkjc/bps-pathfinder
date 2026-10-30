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
const records={DispatchCall:[],CallHistory:[],PropertyAlert:[],CallAssignment:[],Unit:[],User:[],ReportCallLink:[],PropertyCallLink:[],Location:[]};
const reads=[];
let role='admin', failSource='';
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
 vm.runInNewContext(js,{createClientFromRequest:()=>api,Deno:{serve:fn=>{handler=fn;}},Response,console,setTimeout,clearTimeout,Date,Map,Set,Promise,callTimestamp,isValidCallRecord,isVisibleActiveCall,ACTIVE_WINDOW_MS,addressHistoryPattern});
 return async body=>{
  const response=await handler({json:async()=>body,headers:new Headers()});
  return {status:response.status,data:await response.json()};
 };
}
const history=await loadHandler('base44/functions/getCallHistoryFeed/entry.ts');
// More than the old 500-row cutoff: every retained record remains reachable.
for(let i=0;i<730;i++){
 const stamp=new Date(now-(i+1)*60000).toISOString();
 records.DispatchCall.push({...live,id:'d'+i,time_received:stamp,created_date:stamp,call_id:'BPS-202610-'+(i+1)});
}
for(let i=0;i<110;i++){
 const stamp=new Date(now-(i+1000)*60000).toISOString();
 records.CallHistory.push({...live,id:'h'+i,original_call_id:'old'+i,time_received:stamp,created_date:stamp,call_id:'BPS-202610-'+(i+1001)});
}
records.DispatchCall.push({...live,id:'outside90',time_received:new Date(now-91*86400000).toISOString()});
let cursor=null; const found=new Set(); let pageCount=0;
do{
 const result=await history({page_size:75,cursor});
 assert.equal(result.status,200);
 assert(result.data.rows.length<=75);
 for(const row of result.data.rows){assert(!found.has(row.id));found.add(row.id);}
 cursor=result.data.next_cursor;
 assert(++pageCount<30);
}while(cursor);
assert.equal(found.size,840);
assert(!found.has('outside90'));
assert(reads.filter(r=>['DispatchCall','CallHistory'].includes(r.entity)).every(r=>r.limit===76));
assert(reads.filter(r=>!['DispatchCall','CallHistory'].includes(r.entity)).every(r=>r.query)); // no global enrichment scans
const oldSearch=await history({search:'BPS-202610-720'});
assert.equal(oldSearch.data.rows.length,1);
assert.equal(oldSearch.data.rows[0].id,'d719');
const until=new Date(now-10*60*60000).toISOString();
const dateRange=await history({until});
assert(dateRange.data.rows.every(row=>callTimestamp(row)<=Date.parse(until)));
failSource='CallHistory';
assert.equal((await history({})).status,500);
failSource=''; role='client';
assert.equal((await history({})).status,403);
role='admin';
const addressHistory=await loadHandler('base44/functions/getAddressCallHistory/entry.ts');
records.DispatchCall=[];records.CallHistory=[];
const prior={...live,id:'prior',original_call_id:'original-prior',time_received:new Date(now-45*86400000).toISOString(),created_date:new Date(now-45*86400000).toISOString(),status:'Cleared'};
records.CallHistory.push(prior);
let result=await addressHistory({address:'3000 Griffin Avenue, Richmond, VA 23222'});
assert.equal(result.status,200);
assert.equal(result.data.count,1);
assert.equal(result.data.calls[0].id,'original-prior');
records.Location=[{id:'managed',address:'3000 Griffin Avenue, Richmond, VA'}];
result=await addressHistory({propertyId:'managed'});
assert.equal(result.data.count,1);
records.DispatchCall.push({...prior,id:'original-prior'});
result=await addressHistory({address:'3000 Griffin Avenue, Richmond, VA'});
assert.equal(result.data.count,1); // active/archive copies are one call
let browserFeedSource = await readFile('src/lib/activeDispatchCalls.js','utf8');
browserFeedSource = browserFeedSource.replace("../../base44/functions/_shared/callFeedPolicy.js",new URL('../base44/functions/_shared/callFeedPolicy.js',import.meta.url).href)
 .replace("import { base44 } from '@/api/base44Client';","const base44 = {};")
 .replace("import { withRequestTimeout } from '@/lib/requestTimeout';","const withRequestTimeout = task => task;");
const browserFeed = await import('data:text/javascript;base64,'+Buffer.from(browserFeedSource).toString('base64'));
assert.equal(browserFeed.dedupeOperationalCalls([live]).length,1);
assert.equal(browserFeed.dedupeOperationalCalls([live,{...live,id:'another-agency',agency:'HPD'}]).length,2);
assert.equal(browserFeed.dedupeOperationalCalls([{...live,agency_cad_number:'123'},{...live,id:'another-call',agency_cad_number:'456'}]).length,2);
const liveFeed = await loadHandler('base44/functions/getActiveDispatchCalls/entry.ts');
records.DispatchCall.push(live, {...live,id:'oldImported',time_received:new Date(now-3*86400000).toISOString()}, {...live,id:'future',time_received:new Date(now+600000).toISOString()});
const liveResult = await liveFeed({limit:100});
assert.equal(liveResult.status,200);
assert.equal(liveResult.data.calls.length,1);
assert.equal(liveResult.data.calls[0].id,'live');
console.log('PASS: 840 calls across 90-day pages; older-call search/date range; bounded enrichment; source failure/access controls; full GPS address -> retained prior call; managed-property lookup; duplicate suppression; live recency.');
