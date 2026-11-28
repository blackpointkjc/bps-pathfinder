import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
let storeUnavailable=false,accountLocked=false,identityUnavailable=false;
let actor={id:'staff',role:'user',additional_roles:['officer']},failLogin=false,clock=Date.now();
const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const records=[];
const db={AccountLock:{filter:async()=>accountLocked?[{locked:true}]:[]},User:{get:async id=>({...actor,id})},PortalAuthSession:{
 filter:async q=>{if(storeUnavailable)throw Object.assign(Error("Rate limit exceeded"),{status:429});return records.filter(r=>Object.entries(q).every(([k,v])=>r[k]===v));},
 create:async r=>{const row={...r,id:'session-'+records.length};records.push(row);return row;},
 update:async(id,p)=>{const row=records.find(r=>r.id===id);Object.assign(row,p);return row;}
}};
const sdk={auth:{me:async()=>{if(identityUnavailable)throw Object.assign(Error("provider unavailable"),{status:503});return actor;}},asServiceRole:{entities:db}};
const client={auth:{loginViaEmailPassword:async(email,password)=>{if(failLogin||password!=='mock-correct-password')throw Object.assign(Error('invalid'),{status:400});return {access_token:'mock-native-token'};},setToken:()=>{},me:async()=>actor}};
let source=fs.readFileSync('base44/functions/portalSession/entry.ts','utf8').replace(/^import .*;\n/gm,'').replace('export default async function(req){','async function handler(req){');
source=transformSync(source,{loader:'ts',target:'es2022'}).code;
const guard=transformSync(fs.readFileSync('base44/shared/portalLoginGuard.ts','utf8').replaceAll('export ','') ,{loader:'ts'}).code;
const portalSessionState=new Function(guard+';return portalSessionState;')();
const handler=new Function('createClientFromRequest','createClient','portalSessionState',source+';return handler;')(()=>sdk,()=>client,portalSessionState);
async function call(action,extra={},token='mock-native-token'){
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action,...extra})}));
 return {status:response.status,...await response.json()};
}
assert.equal((await call('check')).status,401,'a previously issued provider token is not an authorized Pathfinder session');
failLogin=true;assert.equal((await call('sign_in',{email:'test@example.test',password:'wrong'})).status,401);assert.equal(records.length,0);failLogin=false;
let response=await call('sign_in',{email:'test@example.test',password:'mock-correct-password'});assert.equal(response.access_token,'mock-native-token');assert.equal(records.length,1);
assert.equal(JSON.stringify(records).includes('mock-native-token'),false);assert.equal(JSON.stringify(records).includes('mock-correct-password'),false);
assert.equal((await call('check')).success,true);
actor.portal_approved=true;
let bootstrap=await call('bootstrap');
assert.equal(bootstrap.status,200);assert.equal(bootstrap.profile.id,actor.id);assert.equal(bootstrap.needs_registration,false);assert.ok(bootstrap.session_started_at);
accountLocked=true;assert.equal((await call('bootstrap')).status,401);accountLocked=false;
storeUnavailable=true;const delayed=await call('bootstrap');assert.equal(delayed.status,503);assert.equal(delayed.code,'SESSION_STORE_UNAVAILABLE');assert.equal(delayed.profile,undefined);storeUnavailable=false;
identityUnavailable=true;assert.equal((await call('bootstrap')).status,503);identityUnavailable=false;
actor.additional_roles=['full_access'];bootstrap=await call('bootstrap');assert.deepEqual(bootstrap.profile.additional_roles,[]);assert.equal(bootstrap.needs_registration,true);
actor.additional_roles=['officer'];
assert.equal((await call('bootstrap')).status,200);

assert.equal((await call('check',{},'rotated-provider-token')).success,true);assert.equal(records[0].token_hash,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('rotated-provider-token'))).toString('hex'));
const start=records[0].last_activity_at;
clock+=(13*60-1)*60000;assert.equal((await call('check')).success,true);assert.equal(records[0].last_activity_at,start,'background checks never extend inactivity');
assert.equal((await call('activity')).success,true);assert.notEqual(records[0].last_activity_at,start);
clock+=13*60*60000;assert.equal((await call('activity')).status,401,'activity cannot restore an expired session');
response=await call('sign_in',{email:'test@example.test',password:'mock-correct-password'});assert.equal(response.status,200);
assert.equal((await call('sign_out')).success,true);assert.equal((await call('check')).status,401,'revoked sessions stay unusable');
assert.equal((await call('check',{},'different-token')).status,401);
globalThis.Date=NativeDate;
console.log('PASS: password-verified app sessions, hashed token storage, idle expiration on the server, background checks do not extend sessions, and revocation.');
