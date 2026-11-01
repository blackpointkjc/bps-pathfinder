import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
let actor={id:'staff',role:'user',additional_roles:['officer']},failLogin=false,clock=Date.now();
const realNow=Date.now;Date.now=()=>clock;
const records=[];
const db={AccountLock:{filter:async()=>[]},PortalAuthSession:{
 filter:async q=>records.filter(r=>r.token_hash===q.token_hash),
 create:async r=>{const row={...r,id:'session-'+records.length};records.push(row);return row;},
 update:async(id,p)=>{const row=records.find(r=>r.id===id);Object.assign(row,p);return row;}
}};
const sdk={auth:{me:async()=>actor},asServiceRole:{entities:db}};
const client={auth:{loginViaEmailPassword:async(email,password)=>{if(failLogin||password!=='mock-correct-password')throw Error('invalid');return {access_token:'mock-native-token'};},me:async()=>actor}};
let source=fs.readFileSync('base44/functions/portalSession/entry.ts','utf8').replace(/^import .*;\n/gm,'').replace('export default async function(req){','async function handler(req){');
source=transformSync(source,{loader:'ts',target:'es2022'}).code;
const handler=new Function('createClientFromRequest','createClient',source+';return handler;')(()=>sdk,()=>client);
async function call(action,extra={},token='mock-native-token'){
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action,...extra})}));
 return {status:response.status,...await response.json()};
}
assert.equal((await call('check')).status,401,'a previously issued provider token is not an authorized Pathfinder session');
failLogin=true;assert.equal((await call('sign_in',{email:'test@example.test',password:'wrong'})).status,401);assert.equal(records.length,0);failLogin=false;
let response=await call('sign_in',{email:'test@example.test',password:'mock-correct-password'});assert.equal(response.access_token,'mock-native-token');assert.equal(records.length,1);
assert.equal(JSON.stringify(records).includes('mock-native-token'),false);assert.equal(JSON.stringify(records).includes('mock-correct-password'),false);
assert.equal((await call('check')).success,true);
const start=records[0].last_activity_at;
clock+=29*60000;assert.equal((await call('check')).success,true);assert.equal(records[0].last_activity_at,start,'background checks never extend inactivity');
assert.equal((await call('activity')).success,true);assert.notEqual(records[0].last_activity_at,start);
clock+=30*60000;assert.equal((await call('activity')).status,401,'activity cannot restore an expired session');
response=await call('sign_in',{email:'test@example.test',password:'mock-correct-password'});assert.equal(response.status,200);
assert.equal((await call('sign_out')).success,true);assert.equal((await call('check')).status,401,'revoked sessions stay unusable');
assert.equal((await call('check',{},'different-token')).status,401);
Date.now=realNow;
console.log('PASS: password-verified app sessions, hashed token storage, idle expiration on the server, background checks do not extend sessions, and revocation.');
