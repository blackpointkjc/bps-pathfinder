const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const client={id:'client-a',email:'client@test',role:'user',rank:'Client',additional_roles:['client'],assigned_sites:['Armstrong']};
let actor=client,targetCalls=0,failSecurity=false,handler,reads=0;
const db={
 Location:{list:async()=>[{id:'a',site_name:'Armstrong',time_zone:'America/New_York'},{id:'b',site_name:'Other property'}]},
 SecurityAlert:{list:async()=>{reads++;if(failSecurity)throw Error('unavailable');return [{id:'s',location:'Armstrong',description:'security notice',status:'acknowledged',created_date:new Date().toISOString()},{id:'secret',location:'Other property',description:'PRIVATE'}];}},
 PropertyAlert:{filter:async()=>{reads++;return [{id:'p',propertyId:'a',propertyName:'Armstrong',callIncident:'Property call',callLocation:'Assigned site',acknowledged:true,created_date:new Date().toISOString()},{id:'other',propertyId:'b',propertyName:'Other property',callIncident:'PRIVATE'},{id:'test',propertyId:'a',propertyName:'Armstrong',is_test:true}];}},
 User:{get:async()=>{targetCalls++;return client;}}
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('base44/functions/getClientSecurityAlerts/entry.ts','utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},Deno:{serve:fn=>handler=fn},Response,Date,Intl,Map,Set,setTimeout:fn=>fn(),createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:db}})});
const call=body=>handler(new Request('https://test',{method:'POST',body:JSON.stringify(body||{})}));
(async()=>{
 let response=await call(),data=await response.json();assert.equal(response.status,200);assert.equal(data.alerts.length,2);assert(!JSON.stringify(data).includes('PRIVATE'));assert(data.alerts.every(a=>a.status==='active'),'acknowledgement does not falsely resolve a call');
 response=await call({client_id:'client-b'});assert.equal(response.status,403);assert.equal(targetCalls,0);
 actor={id:'officer',additional_roles:['officer']};const before=reads;response=await call();assert.equal(response.status,403);assert.equal(reads,before);
 actor={id:'admin',role:'admin'};response=await call({client_id:'client-a'});assert.equal(response.status,200);assert.equal(targetCalls,1);
 actor=client;failSecurity=true;response=await call();data=await response.json();assert(data.source_errors.includes('security notices'));assert.equal(data.alerts.length,1,'one unavailable table does not discard confirmed CAD alerts');
 actor={...client,assigned_sites:[]};response=await call();data=await response.json();assert.equal(data.locations.length,0);assert.equal(data.alerts.length,0);
 console.log('PASS: actual client security endpoint includes CAD and manual alerts, respects assigned_sites and preview authorization, excludes other properties/test calls, preserves partial results and never treats acknowledged calls as resolved.');
})().catch(e=>{console.error(e);process.exit(1)});
