import fs from 'node:fs';import assert from 'node:assert/strict';import{transformSync}from'esbuild';
let handler;
const sdk={auth:{me:async()=>null},entities:{SystemScanRun:{list:async()=>[]}},asServiceRole:{entities:{CadCounter:{filter:async()=>[{id:'counter',last_source_poll_at:new Date().toISOString(),last_source_poll_status:'success'}]}}}};
const code=transformSync(fs.readFileSync('base44/functions/ingestGractivecalls/entry.ts','utf8').replace(/^import .*;\n/gm,''),{loader:'ts',format:'esm'}).code;
new Function('createClientFromRequest','Deno',code)(()=>sdk,{serve:fn=>handler=fn,env:{has:()=>false,get:()=>undefined}});
async function call(token){sdk.auth.me=async()=>null;const r=await handler(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer service-test'}:{})},body:JSON.stringify({scheduled:true})}));return{status:r.status,...await r.json()};}
assert.equal((await call(false)).status,403,'A scheduled flag cannot authorize a visitor');const r=await call(true);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.reason,'recent_source_poll');
console.log('PASS: authenticated scheduler reaches the CAD poll/lease path without a staff login; a public scheduled flag remains forbidden.');
