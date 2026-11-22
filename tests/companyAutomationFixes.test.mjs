import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transform} from 'esbuild';
const originalFetch=globalThis.fetch;
globalThis.Deno={env:{get:name=>({IA_GRAPH_CLIENT_ID:'unit-app',IA_GRAPH_CLIENT_SECRET:'unit-secret'}[name]||'')},serve:handler=>{globalThis.__registeredHandler=handler;}};
let posts=[],grants=[],roles=['Mail.Send'];
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('/oauth2/v2.0/token')){grants.push(new URLSearchParams(options.body));return Response.json({access_token:'header.'+Buffer.from(JSON.stringify({roles})).toString('base64url')+'.signature',expires_in:3600});}
 if(String(url).endsWith('/sendMail')){posts.push({url:String(url),payload:JSON.parse(options.body)});return new Response(null,{status:202});}
 throw Error('No network is allowed in this unit test');
};
const loadGraph=async()=>{const out=await transform(fs.readFileSync('base44/shared/companyGraph.ts','utf8'),{loader:'ts',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(out.code).toString('base64')+'#'+Math.random());};
const graph=await loadGraph();
await graph.sendCompanyEmail({to:'client@example.test',subject:'Unit invoice',body:'Synthetic test only'});
assert.equal(grants[0].get('grant_type'),'client_credentials');assert.equal(grants[0].get('refresh_token'),null);
assert.equal(posts[0].payload.message.from.emailAddress.address,'management@blackpointkjc.com');
assert.equal(posts[0].payload.message.toRecipients[0].emailAddress.address,'client@example.test');
roles=['Sites.Selected'];const restricted=await loadGraph();await assert.rejects(()=>restricted.sendCompanyEmail({to:'client@example.test',subject:'Unit',body:'Synthetic'}),/Mail.Send APPLICATION/);assert.equal(posts.length,1);
console.log('PASS company Graph: app-only credentials, fixed company sender, missing Mail.Send blocks delivery, no personal Outlook token');
const owner={id:'6ae7d733d4b1a647cd3e6f38',email:'owner@example.test',role:'admin',additional_roles:[],last_name:'Owner'};
let actor={id:'6a72bbee2842d6338cbae513',rank:'Support Staff',email:'scheduler@example.test',role:'admin',additional_roles:['officer']};
let reads=[],writes=[];
const token='unit-billing-token',hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
const table={
 PortalAuthSession:[{user_id:owner.id,token_hash:hash,started_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),revoked:false}],
 User:[{id:'officer',email:'officer@example.test',last_name:'Example',rank:'Officer',additional_roles:['officer']}],
 Location:[{id:'site',site_name:'Alpha',site_bill_rate:75,billing_contact_email:'client@example.test'}],
 TimeEntry:[{id:'worked',officer_email:'officer@example.test',location:'Alpha',clock_in:'2026-10-13T23:00:00Z',clock_out:'2026-10-14T00:00:00Z'}],
 Invoice:[{id:'paid',invoice_number:'26001',site_name:'Alpha',status:'paid',period_start:'2026-10-13',period_end:'2026-10-16',shifts:JSON.stringify([{date:'Oct 13, 2026',officer:'Example',hours:'1.00'}])}],
 Schedule:[],AuditLog:[],Notification:[]
};
const entities=new Proxy({}, {get(_target,name){
 if(['MicrosoftOAuthCredential','OutlookSharedMailbox'].includes(name))throw Error('Personal Outlook access is forbidden in this test');
 return {
 filter:async(query,sort,limit=500,skip=0)=>{reads.push(String(name));if(name==='SystemScanRun')throw Error('Unauthorized');if(name==='PortalAuthSession')return table[name];return (table[name]||[]).slice(skip,skip+limit);},
 list:async(sort,limit=500,skip=0)=>{reads.push(String(name));if(name==='SystemScanRun')throw Error('Unauthorized');return (table[name]||[]).slice(skip,skip+limit);},
 get:async id=>(table[name]||[]).find(row=>row.id===id),
 create:async value=>{writes.push(String(name));const row={...value,id:'unit-created'};(table[name]??=[]).push(row);return row;},
 update:async(id,value)=>{writes.push(String(name));const row=(table[name]||[]).find(row=>row.id===id);Object.assign(row,value);return row;}
 };
}});
globalThis.__billingSdk={auth:{me:async()=>actor},entities,asServiceRole:{entities}};
let source=fs.readFileSync('base44/functions/generateWeeklyInvoices/entry.ts','utf8').replace(/^import .*from ["']npm:@base44\/sdk["'];?$/m,'const createClientFromRequest=()=>globalThis.__billingSdk;');
const transformed=await transform(source,{loader:'ts',format:'esm'});
await import('data:text/javascript;base64,'+Buffer.from(transformed.code).toString('base64'));
const handler=globalThis.__registeredHandler;
const call=async body=>{globalThis.__billingSdk.auth.me=async()=>actor;const response=await handler(new Request('https://unit.invalid',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};};
const scheduled=await call({scheduled:true,action:'scheduled'});assert.equal(scheduled.status,200);assert.equal(scheduled.skipped,true);assert.ok(!reads.includes('PortalAuthSession'),'verified scheduled admin never requires a portal session');assert.equal(writes.length,0);
actor=null;const forged=await call({scheduled:true,action:'scheduled'});assert.ok([401,403].includes(forged.status));assert.equal(writes.length,0);
console.log('PASS scheduler auth: offline platform admin works, outside-Monday run skips, anonymous scheduled flag rejected');
actor=owner;reads=[];writes=[];const beforePosts=posts.length;
const duplicate=await call({action:'run_now',period_start:'2026-10-11',period_end:'2026-10-17',location_id:'site'});
assert.equal(duplicate.status,200);assert.equal(duplicate.created,0);assert.equal(duplicate.sent,0);assert.equal(duplicate.held,0);assert.ok(duplicate.results.some(row=>row.status==='already_billed'));assert.equal(posts.length,beforePosts);assert.ok(!writes.includes('Invoice'));
const paid=await call({action:'send_existing',invoice_id:'paid'});assert.equal(paid.status,409);assert.equal(posts.length,beforePosts);
console.log('PASS billing: matched paid work is skipped, no repeated review item, no duplicate invoice or email');
globalThis.fetch=originalFetch;
const layout=fs.readFileSync('src/Layout.jsx','utf8');
assert.ok(layout.includes('canAccessPage(user,\'RecordsAssistant\')'));assert.ok(layout.includes('<RecordsSearchDialog'));
assert.ok(!fs.readFileSync('src/pages/RecordsAssistant.jsx','utf8').includes('Searching Pathfinder app records.'));
assert.ok(fs.readFileSync('src/components/GlobalMessageBanner.jsx','utf8').includes("slice(-5)"));
assert.ok(!fs.readFileSync('base44/functions/notifyPropertyAlertSms/entry.ts','utf8').includes('api.twilio.com'));
for(const path of ['src/Layout.jsx','src/components/RecordsSearchDialog.jsx','src/pages/AccountingInvoices.jsx','src/components/GlobalMessageBanner.jsx','src/lib/app-params.js']){
 await transform(fs.readFileSync(path,'utf8'),{loader:path.endsWith('.jsx')?'jsx':'js'});
}
console.log('PASS popup permission gate, quiet search start, short BOLO reference, Graph alert transport and changed frontend syntax');

const ingestionSource=fs.readFileSync('base44/functions/ingestGractivecalls/entry.ts','utf8');
const start=ingestionSource.indexOf('async function hasOutstandingOfficerAssignment('),end=ingestionSource.indexOf('async function releaseClosedCall(',start);
assert.ok(start>=0&&end>start);
const helperCode="const lower=v=>String(v||'').toLowerCase();\n"+ingestionSource.slice(start,end)+"\nexport {hasOutstandingOfficerAssignment};";
const cachedPolicy=await import('data:text/javascript;base64,'+Buffer.from(helperCode).toString('base64'));
let assignmentReads=0;const assignmentDb={CallAssignment:{filter:async()=>{assignmentReads++;return [];}}};
for(let i=0;i<40;i++)assert.equal(await cachedPolicy.hasOutstandingOfficerAssignment(assignmentDb,{id:'call-'+i,assigned_units:[]},[]),false);
assert.equal(assignmentReads,0,'unassigned call checks share one snapshot rather than one request per call');
assert.equal(await cachedPolicy.hasOutstandingOfficerAssignment(assignmentDb,{id:'c',assigned_units:[]},[{call_id:'c',status:'assigned'}]),true);
assert.equal(await cachedPolicy.hasOutstandingOfficerAssignment(assignmentDb,{id:'c',assigned_units:['officer']},[]),true);
console.log('PASS GRAC read budget: cached assignment checks issue zero per-call reads and preserve assigned calls');
