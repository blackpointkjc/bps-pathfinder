import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync('src/lib/portalAuthFlow.js','utf8').replaceAll('export ','');
const {authEntry,requestPasswordReset,completePasswordReset}=new Function(source+';return {authEntry,requestPasswordReset,completePasswordReset};')();
for(const url of ['/reset-password?token=example-token','/ResetPassword?token=example-token','/Login?reset_token=example-token','/?reset_token=example-token','/Login?from_url=%2Freset-password%3Ftoken%3Dexample-token']){const e=authEntry(new URL(url,'https://bpspf.blackpointkjc.com'));assert.equal(e.mode,'reset');assert.equal(e.resetToken,'example-token');assert.equal(e.isEntry,true);}
assert.equal(authEntry(new URL('https://bpspf.blackpointkjc.com/register')).mode,'register');assert.equal(authEntry(new URL('https://bpspf.blackpointkjc.com/forgot-password')).mode,'forgot');assert.equal(authEntry(new URL('https://bpspf.blackpointkjc.com/Login?mode=register&email=guest%40example.invalid&type=visitor')).email,'guest@example.invalid');
let sent,reset;
const auth={resetPasswordRequest:async email=>{sent=email;return{success:true};},resetPassword:async payload=>{reset=payload;return{success:true};}};
await requestPasswordReset(auth,' PERSON@EXAMPLE.INVALID ');assert.equal(sent,'person@example.invalid');
await assert.rejects(()=>completePasswordReset(auth,'','ExamplePass123!','ExamplePass123!'),/missing/);await assert.rejects(()=>completePasswordReset(auth,'test','ExamplePass123!','different'),/match/);assert.equal(reset,undefined);
await completePasswordReset(auth,'opaque-one-time-token','ExamplePass123!','ExamplePass123!');assert.deepEqual(reset,{resetToken:'opaque-one-time-token',newPassword:'ExamplePass123!'});
await assert.rejects(()=>requestPasswordReset({resetPasswordRequest:async()=>({success:false,error:'Delivery unavailable'})},'person@example.invalid'),/Delivery unavailable/);
await assert.rejects(()=>completePasswordReset({resetPassword:async()=>({error:'Expired link'})},'expired','ExamplePass123!','ExamplePass123!'),/Expired link/);
console.log('PASS: actual auth controller handles provider reset URLs and legacy URLs, invitation email prefill, matching passwords, normalized reset requests, expired tokens and rejected delivery without false success.');
