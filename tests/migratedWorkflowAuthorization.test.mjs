import assert from 'node:assert/strict';
import {build} from 'esbuild';
const jobs={
 generateScheduledPayroll:{},applyScheduledPromotions:{},getRoleWorkQueue:{hourly_check:true,queue_role:'admin'},generateAnnualPerformanceReviews:{},sendDailyCompanySummary:{},applyInvoiceLateFees:{},postRecurringCompanyBills:{},monitorAutoDispatchAssignments:{},enforceOfficerDutyStatus:{action:'sweep'}
};
const scheduler={id:'6a72bbee2842d6338cbae513',role:'admin',rank:'Officer',additional_roles:['officer']};
let actor,handler,writes=0;
const entities=new Proxy({}, {get(){return new Proxy({}, {get(){return async()=>{writes++;throw Error('Dry run must not touch entities');};}});}});
globalThis.__maintenanceSdk={auth:{me:async()=>actor},entities,asServiceRole:{entities}};
globalThis.Deno={serve:fn=>handler=fn,env:{get:()=>''}};
globalThis.fetch=async()=>{throw Error('Network forbidden in fixture')};
for(const [name,args] of Object.entries(jobs)){
 handler=null;
 const result=await build({entryPoints:['base44/functions/'+name+'/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'mock-sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk$/},()=>({path:'sdk',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.__maintenanceSdk;',loader:'js'}));}}]});
 await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')+'#'+name);
 const invoke=async (extra={})=>{const r=await handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({scheduled:true,dry_run:true,...args,...extra})}));return {status:r.status,...await r.json()}};
 actor=null;assert.equal((await invoke()).status,403,name);
 actor={id:'officer',role:'user',additional_roles:['officer']};assert.equal((await invoke()).status,403,name);
 actor={id:'other-admin',role:'admin'};assert.equal((await invoke()).status,403,name);
 actor={...scheduler,disabled:true};assert.equal((await invoke()).status,403,name);
 actor=scheduler;assert.equal((await invoke()).dry_run,true,name);
 actor={id:'service',is_service:true};assert.equal((await invoke()).dry_run,true,name);
 if(name==='generateScheduledPayroll'){actor=scheduler;assert.equal((await invoke({force:true})).status,403);}
 if(name==='enforceOfficerDutyStatus'){actor=scheduler;assert.equal((await invoke({action:'clock_out'})).status,403);}
 if(name==='getRoleWorkQueue'){actor=scheduler;assert.equal((await invoke({action:'complete'})).status,403);}
 if(name==='sendDailyCompanySummary'||name==='applyInvoiceLateFees'){actor=scheduler;assert.equal((await invoke({action:'run_now'})).status,403);}
 assert.equal(writes,0,name);console.log('PASS fixed scheduler scope and no-write verification: '+name);
}
