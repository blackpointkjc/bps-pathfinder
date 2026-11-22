import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
let revoked=false,adopted=false,deleted=0;
const user={id:'test-officer',email:'test@example.test',additional_roles:['officer']};
const now=new Date().toISOString();
const row={id:'session',user_id:user.id,started_at:now,last_activity_at:now};
const prior={id:'receipt',state:'blocked',event_key:'property-alert:alert:created',user_email:user.email,error:''};
const entities={PortalAuthSession:{filter:async q=>q.token_hash?[]:[{...row,revoked}],update:async()=>{adopted=true;}},
 PropertyAlert:{get:async id=>({id,created_date:now})},CallStatusLog:{get:async()=>null},
 CadAnnouncementReceipt:{filter:async()=>[prior],updateMany:async()=>({updated:1}),delete:async()=>{deleted++;}}};
globalThis.__propertyClaimSdk={auth:{me:async()=>user},asServiceRole:{entities}};
globalThis.Deno={serve:fn=>globalThis.__propertyClaimHandler=fn};
const input=fs.readFileSync('base44/functions/claimCadAnnouncement/entry.ts','utf8').replace(/^import .*from ['"]npm:@base44\/sdk['"];?$/m,'const createClientFromRequest=()=>globalThis.__propertyClaimSdk;');
assert(!/CadAnnouncementReceipt\.delete\(/.test(input),'audit receipts must be preserved');
const compiled=await build({stdin:{contents:input,loader:'ts',resolveDir:process.cwd()+'/base44/functions/claimCadAnnouncement'},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const call=async()=>globalThis.__propertyClaimHandler(new Request('https://test.local',{method:'POST',headers:{authorization:'Bearer rotated-test-token','content-type':'application/json'},body:JSON.stringify({event_type:'property_alert',event_id:'alert',event_key:'property-alert:alert:created'})}));
let response=await call();assert.equal(response.status,200);assert.equal((await response.json()).claimed,true);assert(adopted,'valid active session adopts rotated token');assert.equal(deleted,0);
revoked=true;response=await call();assert.equal(response.status,401,'revoked session never claims audio');
console.log('PASS property announcement claim: rotated active login works; revoked login denied; blocked property alert can retry; all audit records preserved');
