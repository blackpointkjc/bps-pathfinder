import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
const files=['archiveOldCalls','geocodeMissingCalls','professionalStandardsDeadlines','professionalStandardsDailyDigest'];
const owner={id:'6ae7d733d4b1a647cd3e6f38',role:'admin'};
const scheduler={id:'6a72bbee2842d6338cbae513',role:'admin',rank:'Officer',additional_roles:['officer']};
let actor=owner,writes=0,reads=0,handler;
const old=new Date(Date.now()-7200000).toISOString();
const calls=[{id:'external',source_channel:'grac_website_live',time_received:old,created_date:old,incident:'Test fixture',location:'100 Main Street'},{id:'internal',source:'manual',time_received:old,created_date:old,incident:'Test fixture',location:'100 Main Street'},{id:'assigned',source_channel:'grac_website_live',time_received:old,created_date:old,assigned_units:['x']}];
const entities=new Proxy({}, {get(_,name){return {list:async()=>{reads++;return name==='DispatchCall'?calls:[]},filter:async()=>{reads++;return []},create:async()=>{writes++;throw Error('Dry run must not write')},update:async()=>{writes++;throw Error('Dry run must not write')},delete:async()=>{writes++;throw Error('Dry run must not write')}}}});
globalThis.__maintenanceSdk={auth:{me:async()=>actor},asServiceRole:{entities},entities};
globalThis.Deno={serve:fn=>handler=fn,env:{get:()=>''}};
globalThis.fetch=async()=>{throw Error('Network not permitted in fixture test')};
for(const name of files){
 handler=null;const result=await build({entryPoints:['base44/functions/'+name+'/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'mock',setup(b){b.onResolve({filter:/^npm:@base44\/sdk$/},()=>({path:'sdk',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.__maintenanceSdk;',loader:'js'}));}}]});
 const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')+'#'+name);
 const fn=handler||module.default;assert.equal(typeof fn,'function');
 const run=async(body)=>{const response=await fn(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}));return {status:response.status,...await response.json()}};
 actor=null;assert.ok([401,403].includes((await run({scheduled:true,dry_run:true})).status));
 actor={id:'officer',role:'user',additional_roles:['officer']};assert.ok([401,403].includes((await run({scheduled:true,dry_run:true})).status));
 actor={id:'not-approved-platform-admin',role:'admin'};assert.ok([401,403].includes((await run({scheduled:true,dry_run:true})).status));
 actor={...scheduler,disabled:true};assert.ok([401,403].includes((await run({scheduled:true,dry_run:true})).status));
 actor=scheduler;const verified=await run({scheduled:true,dry_run:true});assert.equal(verified.status,200,JSON.stringify(verified));assert.equal(verified.dry_run,true);
 if(name==='archiveOldCalls')assert.equal(verified.candidates,1);
 actor={id:'service',is_service:true};assert.equal((await run({scheduled:true,dry_run:true})).status,200);
 assert.equal(writes,0);console.log('PASS '+name+': scheduler + service identity, rejects anonymous/unapproved/disabled callers, dry run no writes');
}
