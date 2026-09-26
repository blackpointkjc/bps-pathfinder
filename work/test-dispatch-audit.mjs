import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function handler(path,client){let fn;const code=ts.transpileModule(fs.readFileSync(path,'utf8').replace(/import .*?from 'npm:@base44\/sdk';/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;vm.runInNewContext(code,{createClientFromRequest:()=>client,Deno:{serve:f=>fn=f},Response,Date,console,setTimeout:fn=>fn(),Map,Set});return fn;}
const req=(body={})=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer validated-service'},body:JSON.stringify(body)});
const call={id:'c1',status:'New',incident:'Alarm',location:'Property A',time_received:new Date().toISOString()};
const property={id:'p1',site_name:'Property A',latitude:37.5,longitude:-77.4,active:true,property_monitoring_enabled:true,auto_dispatch_enabled:true,auto_dispatch_mode:'live',auto_dispatch_live_approved_at:new Date().toISOString(),auto_dispatch_live_approved_by:'admin'};
const alert={id:'a1',callId:'c1',propertyId:'p1',propertyName:'Property A',lifecycle_status:'active',created_date:new Date(Date.now()-300000).toISOString()};
const records={DispatchCall:[call],Location:[property],PropertyAlert:[alert]};let writes=[];
const entities=new Proxy({}, {get:(_,name)=>({list:async()=>records[name]||[],filter:async()=>[],get:async(id)=>(records[name]||[]).find(x=>x.id===id),create:async(data)=>{writes.push({name,data});return {...data,id:'saved'}},update:async(id,data)=>({id,...data})})});
const client={auth:{me:async()=>null},entities:{SystemScanRun:{list:async()=>[]}},asServiceRole:{entities,functions:{invoke:async()=>({data:{success:true}})}}};
let res=await handler('base44/functions/geofenceDispatchAssignment/entry.ts',client)(req({call_id:'c1',property_alert_id:'a1'}));let data=await res.json();assert.equal(res.status,200,JSON.stringify(data));assert.equal(data.decision,'no_eligible_unit');assert.equal(writes.filter(w=>w.name==='AutoDispatchEvaluation').length,1);assert.equal(writes.some(w=>w.name==='CallAssignment'),false);
records.DispatchCall[0]={...call,status:'Cleared'};writes=[];res=await handler('base44/functions/geofenceDispatchAssignment/entry.ts',client)(req({call_id:'c1',property_alert_id:'a1'}));assert.equal((await res.json()).skipped,true);assert.equal(writes.length,0);records.DispatchCall[0]=call;
async function audit({recent=false,exact=false,lookupFailure=false,test=false}={}){
 const rows={...records,PropertyAlert:[{...alert,is_test:test,created_date:new Date(Date.now()-(recent?10000:300000)).toISOString()}]};
 const entities=new Proxy({}, {get:(_,name)=>({list:async()=>rows[name]||[],filter:async()=>{if(name==='AutoDispatchEvaluation'&&lookupFailure)throw Error('Unavailable');return name==='AutoDispatchEvaluation'&&exact?[{property_alert_id:'a1',mode:'live',decision:'no_eligible_unit'}]:[]}})});
 const out=await handler('base44/functions/runSystemAudit/entry.ts',{auth:{me:async()=>({id:'admin',role:'admin'})},asServiceRole:{entities}})(req());const body=await out.json();assert.equal(out.status,200,JSON.stringify(body));return body.findings;
}
assert((await audit()).some(x=>x.key==='auto-dispatch:missing-live-evaluation'));
assert(!(await audit({recent:true})).some(x=>x.key==='auto-dispatch:missing-live-evaluation'));
assert(!(await audit({exact:true})).some(x=>x.key==='auto-dispatch:missing-live-evaluation'));
assert(!(await audit({test:true})).some(x=>x.key==='auto-dispatch:missing-live-evaluation'));
const failed=await audit({lookupFailure:true});assert(failed.some(x=>x.key==='auto-dispatch:evaluation-read'));assert(!failed.some(x=>x.key==='auto-dispatch:missing-live-evaluation'));
console.log('PASS: service evaluation persists a real decision; closed calls cannot dispatch; audit distinguishes missing, in-flight, test, older evaluation, and lookup failures');
