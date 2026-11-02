import assert from 'node:assert/strict';import fs from 'node:fs';import{transform}from'esbuild';import{webcrypto}from'node:crypto';if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
let actor={id:'officer-a',email:'a@example.test',rank:'Officer',role:'user',additional_roles:['officer'],platoon:'A',division:'Virginia',subdivision:'Richmond'};
const other={id:'officer-b',email:'b@example.test',rank:'Officer',role:'user',additional_roles:['officer'],platoon:'B',division:'Virginia',subdivision:'Richmond'};
const tables={User:[actor,other],CompanyPlatoon:[{name:'A',region:'Virginia',active:true},{name:'B',region:'Virginia',active:true}]};
const token='test-session';const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
const db=new Proxy({},{get:(_,name)=>({list:async()=>tables[name]||[],filter:async()=>name==='PortalAuthSession'?[{user_id:actor.id,started_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),token_hash:hash}]:[],create:async x=>x})});
const sdk={auth:{me:async()=>actor},asServiceRole:{entities:db}};
let handler;const source=fs.readFileSync('base44/functions/getSupervisorWorkspaceRecords/entry.ts','utf8').replace(/^import .*;\n/gm,'');
const code=(await transform(source,{loader:'ts',format:'esm'})).code;
new Function('createClientFromRequest','Deno','verifiedPS','linkSubmittedReport',code)(()=>sdk,{serve:fn=>handler=fn},async()=>true,async()=>null);
async function call(kind){const r=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({kind})}));return{status:r.status,...await r.json()};}
let r=await call('personnel');assert.equal(r.status,200);assert.ok(r.officers.some(p=>p.id===actor.id));assert.ok(!r.officers.some(p=>p.id===other.id));assert.equal((await call('writeups')).status,403);
actor={...actor,additional_roles:['client'],rank:'Client'};assert.equal((await call('personnel')).status,403);
actor={...actor,additional_roles:[],rank:'Pending Assignment'};assert.equal((await call('personnel')).status,403);
console.log('PASS: officers can read their Rank Structure without supervisor permission; other platoons and supervisor records remain restricted.');
