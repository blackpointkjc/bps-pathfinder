import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSecureSessionRequest} from '../src/lib/secureSessionRequest.js';
test('secure verification retries actual throttles but never retries invalid credentials or a still-running timed-out request',async()=>{
 let clock=1000,attempt=0;const delays=[];
 const opts={now:()=>clock,sleep:async ms=>{delays.push(ms);clock+=ms;}};
 const verified=await runSecureSessionRequest(async()=>{if(++attempt===1)throw Object.assign(Error('Rate limit exceeded'),{response:{status:429,headers:{'retry-after':'2'}}});return {success:true};},opts);
 assert.equal(verified.success,true);assert.deepEqual(delays,[2000]);assert.equal(attempt,2);
 attempt=0;await assert.rejects(runSecureSessionRequest(async()=>{attempt++;throw Object.assign(Error('Session revoked'),{status:401});},opts),/revoked/);assert.equal(attempt,1);
 attempt=0;await assert.rejects(runSecureSessionRequest(async()=>{attempt++;throw Error('Secure session network request timed out');},opts),/timed out/);assert.equal(attempt,1);
});
test('bootstrap is fresh, single-flight and separate from CAD cooldowns',()=>{
 const sdk=readFileSync('src/api/base44Client.js','utf8');
 const auth=readFileSync('src/lib/AuthContext.jsx','utf8');
 assert.ok(sdk.includes("return secureSessionRead(key+':'+String(appParams.token||''),task,meta)"));
 assert.ok(sdk.includes('secureSessionInflight.has(key)'));
 assert.ok(auth.includes("invoke('portalSession',{action:'bootstrap'})"));
 assert.ok(auth.includes('if(startupInFlight.current)return startupInFlight.current'));
 assert.ok(auth.includes('if(session.needs_registration)'));
 assert.ok(auth.includes('rememberOfflineIdentity(currentUser)'));
 assert.ok(!auth.includes("12000,'Secure session verification'"));
});
