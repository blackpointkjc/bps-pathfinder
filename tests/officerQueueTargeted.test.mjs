import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id='6ae7d733d4b1a647cd3e6f38',backup='6a406e7f5968db44ad597d61',callId='6b0a50f0eb924dbca57ebca8',now=new Date().toISOString();
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('queue-test')))).map(v=>v.toString(16).padStart(2,'0')).join('');
const rows={PortalAuthSession:[{user_id:id,token_hash:hash,started_at:now,last_activity_at:now}],Unit:[],ActiveOfficer:[],CallAssignment:[{id:'primary',call_id:callId,unit_id:id,role:'primary',status:'pending',assigned_at:now},{id:'backup',call_id:callId,unit_id:backup,role:'backup',status:'pending',assigned_at:now}],DispatchCall:[{id:callId,incident:'ASSIST POLICE',location:'3200 NORTH RABZA BLVD',status:'On Scene',assigned_units:[id,backup],time_received:now}],User:[{id,rank:'Officer',last_name:'Example'},{id:backup,rank:'Officer',last_name:'Backup'}],OfficerWelfareCheck:[]};
const reads=[];
let fail='',role='user',extraRoles=['officer'];
const matches=(row,query)=>Object.entries(query).every(([k,v])=>{
 const a=row[k];
 if(v&&typeof v==='object')return Object.entries(v).every(([op,b])=>op==='$in'?(Array.isArray(a)?a.some(x=>b.includes(x)):b.includes(a)):op==='$nin'?!b.includes(a):op==='$ne'?a!==b:false);
 return a===v;
});
const api={auth:{me:async()=>({id,email:'officer@example.test',role,additional_roles:extraRoles})},asServiceRole:{entities:new Proxy({}, {get:(_,entity)=>({filter:async(q,sort,limit,skip=0)=>{reads.push({entity,q,limit});if(fail===entity)throw Object.assign(Error('Rate limit exceeded; Retry after 2s'),{status:429});return (rows[entity]||[]).filter(row=>matches(row,q)).slice(skip,skip+limit);},list:async()=>{throw Error('Unscoped list must not be used');}})})}};
let handler;const source=readFileSync('base44/functions/getMyDispatchQueue/entry.ts','utf8').replace(/^import .*;\s*$/gm,'');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{createClientFromRequest:()=>api,Deno:{serve:fn=>{handler=fn;}},crypto,TextEncoder,Response,console,Date,Map,Set,Promise});
async function read(){api.auth.me=async()=>({id,email:'officer@example.test',role,additional_roles:extraRoles});const r=await handler({headers:new Headers({authorization:'Bearer queue-test'}),json:async()=>({})});return {status:r.status,data:await r.json()};}
test('assigned Armstrong incident loads from targeted queries with primary and backup',async()=>{
 const r=await read();assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.queue.length,1);assert.equal(r.data.queue[0].id,callId);assert.equal(r.data.queue[0].assignment.role,'primary');assert.deepEqual(r.data.queue[0].assigned_officers.map(x=>x.role),['primary','backup']);assert.ok(reads.every(x=>Object.keys(x.q).length>0));
 fail='User';const degraded=await read();assert.equal(degraded.status,200);assert.equal(degraded.data.queue.length,1);assert.ok(degraded.data.warnings.length);
 fail='CallAssignment';const throttled=await read();assert.equal(throttled.status,429);assert.equal(throttled.data.queue,undefined);
 fail='PortalAuthSession';assert.equal((await read()).status,429);
 fail='';extraRoles=['client'];assert.equal((await read()).status,403);
 extraRoles=['officer'];rows.CallAssignment[0].status='cleared';rows.CallAssignment[0].cleared_at=now;assert.equal((await read()).data.queue.length,0);
});
