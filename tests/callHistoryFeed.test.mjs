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
const oldAt=new Date(now-2*86400000).toISOString();
assert(isVisibleActiveCall({...live,time_received:oldAt,source:'dispatch_manual'},now));
assert(isVisibleActiveCall({...live,time_received:oldAt,source:'CAD clone'},now));
assert(isVisibleActiveCall({...live,time_received:oldAt,assigned_units:['unit-1']},now));
assert(!isVisibleActiveCall({...live,time_received:oldAt,source:'dispatch_manual',status:'Cleared'},now));
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
assert(reads.filter(r=>['DispatchCall','CallHistory'].includes(r.entity)).every(r=>r.limit<=76));
assert(reads.filter(r=>!['DispatchCall','CallHistory'].includes(r.entity)).every(r=>r.query)); // no global enrichment scans
const oldSearch=await history({search:'BPS-202610-720'});
assert.equal(oldSearch.data.rows.length,1);
assert.equal(oldSearch.data.rows[0].id,'d719');
const until=new Date(now-10*60*60000).toISOString();
const dateRange=await history({until});
assert(dateRange.data.rows.every(row=>callTimestamp(row)<=Date.parse(until)));
failSource='CallHistory';
const partial=await history({});assert.equal(partial.status,200);assert(partial.data.warnings.some(w=>w.includes('archived')));
failSource=''; role='user';officer=true;assert.equal((await history({page_size:25})).status,403);officer=false;role='client';
assert.equal((await history({})).status,403);
role='admin';
// Exercise a filtered-out prefix, cross-page duplicate, property orphan and
// legacy records without time_received against the actual handler.
records.DispatchCall=[];records.CallHistory=[];records.PropertyAlert=[];
const tie=new Date(now-120000).toISOString();
for(let i=0;i<26;i++)records.CallHistory.push({...live,id:'tie-'+String(i).padStart(2,'0'),original_call_id:i===25?'tie-original-24':'tie-original-'+i,time_received:tie,created_date:tie,call_id:'BPS-202611-'+(1000+i)});
records.DispatchCall.push({...live,id:'legacy-time',time_received:undefined,created_date:new Date(now-60000).toISOString()});
records.DispatchCall.push({...live,id:'linked-property',time_received:new Date(now-180000).toISOString(),created_date:new Date(now-180000).toISOString()});
records.PropertyAlert.push({id:'linked-alert',callId:'linked-property',callTime:new Date(now-180000).toISOString(),callIncident:'Service Call',callLocation:'100 Main Street',propertyName:'Example Property'});
records.PropertyAlert.push({id:'orphan-alert',callId:'lost-call',callTime:new Date(now-240000).toISOString(),callIncident:'Property Call',callLocation:'100 Main Street',propertyName:'Example Property'});
let edgeCursor=null,edgeSeen=new Set(),edgeRows=[],edgePages=0;
do{
 const page=await history({page_size:25,cursor:edgeCursor});
 assert.equal(page.status,200);assert(page.data.rows.length<=25);
 for(const row of page.data.rows){const key=row.original_call_id||row.id;assert(!edgeSeen.has(key),'duplicate '+key);edgeSeen.add(key);edgeRows.push(row);}
 edgeCursor=page.data.next_cursor;assert(++edgePages<10);
}while(edgeCursor);
assert.equal(edgeSeen.size,28);
assert(edgeSeen.has('legacy-time'));
assert(edgeRows.find(row=>row.id==='linked-property')._propertyCall);
assert.equal(edgeRows.find(row=>row.original_call_id==='lost-call')._source,'property');
const orphanDetail=await history({action:'call_details',call_id:'lost-call'});
assert.equal(orphanDetail.status,200);assert(orphanDetail.data.warnings.some(w=>w.includes('retained property alert')));
// Property-only pages must not require browsing hundreds of unrelated calls.
records.DispatchCall=[];records.CallHistory=[];records.PropertyAlert=[];records.PropertyCallLink=[];
for(let i=0;i<350;i++)records.DispatchCall.push({...live,id:'public-'+i,time_received:new Date(now-(i+1)*1000).toISOString()});
for(let i=0;i<48;i++){
 const id='property-'+i,stamp=new Date(now-(i+1000)*1000).toISOString();
 records.CallHistory.push({...live,id:'arch-'+i,original_call_id:id,time_received:stamp,status:'Cleared',call_id:'BPS-202611-'+(2000+i)});
 records.PropertyAlert.push({id:'alert-'+i,callId:id,callTime:stamp,callIncident:'Service Call',callLocation:live.location,propertyName:i===0?'Armstrong':'Creighton',callStatus:'Enroute'});
}
records.PropertyAlert.push({id:'second-site',callId:'property-0',callTime:records.PropertyAlert[0].callTime,propertyName:'Creighton',callIncident:'Service Call',callLocation:live.location});
records.PropertyCallLink.push({id:'manual',call_id:'manual-original',property_name:'Oliver Crossing',incident:'Check property',location:'200 Main Street',time_received:new Date(now-2000000).toISOString(),status:'active'});
records.PropertyAlert.push({id:'test-alert',callId:'test-call',callTime:new Date(now-500000).toISOString(),propertyName:'Creighton',callIncident:'Test',callLocation:'100 Main Street',is_test:true});
let propertyCursor=null,propertyResults=[],propertyPages=0;
do{
 const page=await history({page_size:25,call_class:'PROPERTY',cursor:propertyCursor});
 assert.equal(page.status,200);assert(page.data.rows.every(row=>row._propertyCall));
 if(propertyPages===0)assert.equal(page.data.rows.length,25);
 propertyResults.push(...page.data.rows);propertyCursor=page.data.next_cursor;assert(++propertyPages<10);
}while(propertyCursor);
assert.equal(propertyResults.length,49);
assert.equal(new Set(propertyResults.map(row=>row.original_call_id)).size,49);
assert(propertyResults.find(row=>row.original_call_id==='property-0')._propertyName.includes('Armstrong'));
assert(propertyResults.find(row=>row.original_call_id==='property-0')._propertyName.includes('Creighton'));
assert(propertyResults.find(row=>row.original_call_id==='manual-original'));
assert.equal(propertyResults.find(row=>row.original_call_id==='property-1').status,'Cleared');
const propertySearch=await history({call_class:'PROPERTY',search:'Armstrong'});
assert.equal(propertySearch.data.rows.length,1);
assert.equal(propertySearch.data.rows[0].original_call_id,'property-0');
failSource='CallHistory';
const degradedProperty=await history({call_class:'PROPERTY'});
assert.equal(degradedProperty.status,200);assert(degradedProperty.data.rows.length>0);assert(degradedProperty.data.warnings.length>0);
failSource='';records.PropertyCallLink=[];
console.log('PASS: dedicated property history, 49 property calls behind 350 unrelated calls, linked properties, property-name search, manual links, archived status, test exclusion and degraded original lookup.');
const addressHistory=await loadHandler('base44/functions/getAddressCallHistory/entry.ts');
records.DispatchCall=[];records.CallHistory=[];records.PropertyAlert=[];
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
browserFeedSource = browserFeedSource.replace('@/lib/cadSourceHealth',new URL('../src/lib/cadSourceHealth.js',import.meta.url).href).replace("../../base44/functions/_shared/callFeedPolicy.js",new URL('../base44/functions/_shared/callFeedPolicy.js',import.meta.url).href)
 .replace("import { base44 } from '@/api/base44Client';","const base44 = {};")
 .replace("import { withRequestTimeout } from '@/lib/requestTimeout';","const withRequestTimeout = task => task;");
const browserFeed = await import('data:text/javascript;base64,'+Buffer.from(browserFeedSource).toString('base64'));
assert.equal(browserFeed.dedupeOperationalCalls([live]).length,1);
assert.equal(browserFeed.dedupeOperationalCalls([live,{...live,id:'clone',source:'CAD clone',description:'[GRAC:abc]'}]).length,2);
assert.equal(browserFeed.dedupeOperationalCalls([live,{...live,id:'another-agency',agency:'HPD'}]).length,2);
assert.equal(browserFeed.dedupeOperationalCalls([{...live,agency_cad_number:'123'},{...live,id:'another-call',agency_cad_number:'456'}]).length,2);
const liveFeed = await loadHandler('base44/functions/getActiveDispatchCalls/entry.ts');
records.DispatchCall.push(live, {...live,id:'oldImported',time_received:new Date(now-3*86400000).toISOString()}, {...live,id:'future',time_received:new Date(now+600000).toISOString()});
records.DispatchCall.push({...live,id:'old-manual',source:'dispatch_manual',time_received:oldAt},{...live,id:'old-assigned',assigned_units:['unit-1'],status:'Dispatched',time_received:oldAt});
records.DispatchCall.push({...live,id:'000000000000000000000001',time_received:oldAt,assigned_units:[]},{...live,id:'000000000000000000000002',time_received:oldAt,assigned_units:[]},{...live,id:'000000000000000000000003',time_received:oldAt,status:'Cleared'});
records.PropertyAlert.push({id:'p-old',callId:'000000000000000000000001',propertyId:'site',lifecycle_status:'active',callStatus:'New'},{id:'p-closed',callId:'000000000000000000000003',propertyId:'site',lifecycle_status:'active'});
records.CallAssignment.push({id:'assignment-row',call_id:'000000000000000000000002',unit_id:'officer-id',status:'pending'});
records.PropertyAlert.push({id:'legacy-alert',callId:'CAD-12345',propertyId:'site',lifecycle_status:'active'});
records.CallAssignment.push({id:'legacy-assignment',call_id:'BPS-202611-99',unit_id:'legacy-unit',status:'pending'});
records.DispatchCall.push({...live,id:'000000000000000000000020',external_call_id:'grac-long-open',source:'richmond',time_received:oldAt,status:'On Scene'},{...live,id:'000000000000000000000021',external_call_id:'grac-long-open',source:'richmond',time_received:oldAt,status:'On Scene',created_date:new Date(now-1000).toISOString()},{...live,id:'000000000000000000000022',external_call_id:'grac-old-closed',source:'richmond',time_received:oldAt,status:'Cleared'});
records.DispatchCall.push({...live,id:'000000000000000000000031',source:'richmond',external_call_id:'stale-wanted',time_received:oldAt,assigned_units:['legacy-mirror'],status:'On Scene'},{...live,id:'000000000000000000000032',source:'richmond',external_call_id:'stale-recent',status:'Dispatched',created_date:new Date(now-120000).toISOString()},{...live,id:'000000000000000000000033',source:'richmond',external_call_id:'closed-missing',status:'Dispatched',time_closed:new Date(now-30000).toISOString()});
records.PropertyAlert.push({callId:'000000000000000000000031',propertyId:'site',lifecycle_status:'active',callStatus:'On Scene'});
records.CadCounter=[{active_source_confirmed_agencies:['RPD'],active_source_snapshot_at:new Date(now-5000).toISOString(),active_source_snapshot:[{external_call_id:'grac-long-open'},{external_call_id:'grac-old-closed'}],id:'cad-counter',counter_key:'dispatch_call',last_source_poll_at:new Date(now-5000).toISOString(),last_source_poll_status:'success',last_website_row_count:46,last_api_row_count:46,last_website_latest_received:new Date(now-6*60000).toISOString()}];
const liveResult = await liveFeed({limit:100});
assert.equal(liveResult.status,200);
assert.ok(!JSON.stringify(reads.filter(r=>r.entity==='DispatchCall')).includes('CAD-12345'));assert.ok(!JSON.stringify(reads.filter(r=>r.entity==='DispatchCall')).includes('BPS-202611-99'));
assert.equal(liveResult.data.source_health.poll_status,'success');assert.equal(liveResult.data.source_health.api_rows,46);assert.equal(liveResult.data.source_health.poll_at,records.CadCounter[0].last_source_poll_at);
assert.equal(liveResult.data.calls.length,6);
assert.ok(!liveResult.data.calls.some(c=>['stale-wanted','stale-recent','closed-missing'].includes(c.external_call_id)));
assert.equal(liveResult.data.source_health.snapshot_count,2);assert.equal(liveResult.data.source_health.visible_source_count,1);
assert.equal(liveResult.data.calls.filter(c=>c.external_call_id==='grac-long-open').length,1);
assert.ok(browserFeed.dedupeOperationalCalls(liveResult.data.calls).some(c=>c.external_call_id==='grac-long-open'));
assert.ok(!liveResult.data.calls.some(c=>c.external_call_id==='grac-old-closed'));

assert.deepEqual(new Set(liveResult.data.calls.filter(row=>!row.pathfinder_source_active).map(row=>row.id)),new Set(['live','old-manual','old-assigned','000000000000000000000001','000000000000000000000002']));
assert.equal(liveResult.data.calls.find(c=>c.id==='000000000000000000000001').pathfinder_property_alert,true);
assert.deepEqual(Array.from(liveResult.data.calls.find(c=>c.id==='000000000000000000000002').pathfinder_assignment_unit_ids),['officer-id']);
console.log('PASS: 840 calls across 90-day pages; older-call search/date range; bounded enrichment; source failure/access controls; full GPS address -> retained prior call; managed-property lookup; duplicate suppression; live recency.');

// Fixed property-only window available to officers without exposing full history.
const atHour=h=>new Date(now-h*3600000).toISOString();
records.DispatchCall.push({...live,id:'00000000000000000000000a',time_received:atHour(1),status:'On Scene',assigned_units:['000000000000000000000004']},{...live,id:'00000000000000000000000b',time_received:atHour(4),status:'Cleared',assigned_units:[]},{...live,id:'00000000000000000000000d',time_received:atHour(13),status:'New'},{...live,id:'outside-agency',time_received:atHour(2),status:'New'});
records.CallHistory.push({...live,id:'000000000000000000000005',original_call_id:'00000000000000000000000c',time_received:atHour(8),status:'Closed',assigned_units:['000000000000000000000004']});
records.User.push({id:'000000000000000000000004',unit_number:'123',rank:'Officer',last_name:'Example'});
const makeAlert=(id,h,extra={})=>({id:'alert-'+id,callId:id,propertyId:'property-site',propertyName:'Example Site',callTime:atHour(h),created_date:atHour(h),callIncident:'Service Call',callLocation:'3000 GRIFFIN AVE',callStatus:'New',lifecycle_status:'active',...extra});
records.PropertyAlert.push(makeAlert('00000000000000000000000a',1),makeAlert('00000000000000000000000a',1,{id:'duplicate-alert',propertyId:'site-two',propertyName:'Second Site'}),makeAlert('00000000000000000000000b',4,{lifecycle_status:'resolved'}),makeAlert('00000000000000000000000c',8,{lifecycle_status:'resolved'}),makeAlert('00000000000000000000000d',13,{created_date:atHour(1)}),makeAlert('prop-test',2,{is_test:true}),makeAlert('prop-public',2,{propertyId:'public-helpme'}),makeAlert('00000000000000000000000e',3,{lifecycle_status:'resolved',callStatus:'New'}));
records.CallAssignment.push({id:'cleared-officer',call_id:'00000000000000000000000b',unit_id:'000000000000000000000004',role:'primary',status:'cleared',assigned_at:atHour(4),cleared_at:atHour(3)},{id:'responding-officer',call_id:'00000000000000000000000a',unit_id:'000000000000000000000004',role:'primary',status:'on_scene',assigned_at:atHour(1)});
role='user';officer=true;
const propertyLog=await history({action:'recent_property_incidents',since:oldAt,until:new Date(now+86400000).toISOString()});
assert.equal(propertyLog.status,200,JSON.stringify(propertyLog.data));
assert.deepEqual(propertyLog.data.calls.map(c=>c.id),['00000000000000000000000a','00000000000000000000000e','00000000000000000000000b','00000000000000000000000c']);
assert.equal(propertyLog.data.calls[3].property_closed,true);
assert.equal(propertyLog.data.calls[3].property_read_only,true);
assert.equal(propertyLog.data.calls[2].property_assignments[0].label,'Unit 123 Officer Example');
assert.equal(propertyLog.data.calls[2].property_assignments[0].active,false);
assert.equal(propertyLog.data.calls[1].property_record_available,false);
assert.equal(propertyLog.data.calls[0].property_assignments[0].active,true);
assert.equal(propertyLog.data.calls[0].property_names.length,2);
assert.equal((await history({page_size:25})).status,403);
role='user';officer=false;assert.equal((await history({action:'recent_property_incidents'})).status,403);
console.log('PASS: officer-visible rolling property log includes assigned, closed, archived and retained alerts, newest first, without expanding full-history access.');

records.Location.push({id:'boundary-site',site_name:'Boundary site',active:true,property_monitoring_enabled:true,property_monitoring_boundary_type:'circle',property_monitoring_radius_meters:150,latitude:37.54,longitude:-77.40});
records.DispatchCall.push({...live,id:'00000000000000000000000f',time_received:atHour(0.5),latitude:37.54,longitude:-77.40,status:'Cleared'});
records.CallHistory.push({...live,id:'000000000000000000000011',original_call_id:'000000000000000000000010',time_received:atHour(2.5),latitude:37.54,longitude:-77.40,status:'Cleared'});
records.DispatchCall.push({...live,id:'000000000000000000000013',time_received:atHour(0.4),latitude:37.65,longitude:-77.40,status:'Cleared'});
records.CallHistory.push({...live,id:'000000000000000000000006',original_call_id:'000000000000000000000012',time_received:atHour(6),location:'800 Other St',status:'Cleared'});
records.PropertyCallLink.push({call_id:'000000000000000000000006',archive_id:'000000000000000000000006',property_id:'manual-site',property_name:'Manual site',time_received:atHour(6),status:'linked'});
records.CallAssignment.push({id:'former',call_id:'000000000000000000000010',unit_id:'000000000000000000000004',status:'cleared',role:'primary',assigned_at:atHour(2.5),cleared_at:atHour(2)});
role='user';officer=true;
const repaired=await history({action:'recent_property_incidents'});
assert.equal(repaired.status,200,JSON.stringify(repaired.data));
const recovered=repaired.data.calls;
assert.equal(recovered[0].id,'00000000000000000000000f');
assert.equal(recovered[0].property_boundary_recovered,true);
assert.equal(recovered[0].property_closed,true);
assert.equal(recovered.find(c=>c.id==='000000000000000000000010').property_assignments[0].label,'Unit 123 Officer Example');
assert.equal(recovered.filter(c=>c.id==='000000000000000000000012').length,1);
assert.ok(!recovered.some(c=>c.id==='000000000000000000000013'));
assert.ok(recovered.every((c,i)=>i===0||Date.parse(recovered[i-1].time_received)>=Date.parse(c.time_received)));

const closureRecord={...live,id:'map-closure-regression',latitude:37.54,longitude:-77.43,updated_date:new Date(now-1000).toISOString()};
assert.equal(browserFeed.dedupeOperationalCalls([closureRecord]).length,1);
browserFeed.recordCadRealtimeEvent({type:'update',id:closureRecord.id,data:{...closureRecord,status:'Cleared',updated_date:new Date(now).toISOString()}});
assert.equal(browserFeed.dedupeOperationalCalls([closureRecord]).length,0,'stale snapshot must not resurrect a cleared marker');
browserFeed.recordCadRealtimeEvent({type:'update',id:closureRecord.id,data:closureRecord});
assert.equal(browserFeed.dedupeOperationalCalls([closureRecord]).length,0,'out-of-order older update cannot resurrect the marker');
browserFeed.recordCadRealtimeEvent({type:'delete',id:closureRecord.id});
assert.equal(browserFeed.dedupeOperationalCalls([closureRecord]).length,0);
