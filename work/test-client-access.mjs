import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { primarySiteReportingChain } from '../src/utils/commandReporting.js';
const source=fs.readFileSync('base44/functions/getClientOfficerDirectory/entry.ts','utf8').replace(/^import .*;\n/,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let actor={role:'client',additional_roles:[]}, handler;
const rows=[{id:'r',email:'new@test',email_aliases:['old@test'],rank:'First Sergeant',last_name:'Robinson',salary:999,additional_roles:[]}];
vm.runInNewContext(compiled,{Deno:{serve:fn=>handler=fn},Response,console,createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:{User:{list:async()=>rows}}}})});
for (const client of [{role:'client'},{role:'user',rank:'Client'},{role:'user',user_type:'client'},{role:'user',additional_roles:['client']}]) {
 actor=client;
 const res=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({officerEmails:['OLD@test']})}));
 assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.officers[0].last_name,'Robinson');
 assert.equal(data.officers[0].salary,undefined);
}
actor={role:'user',additional_roles:[]};
assert.equal((await handler(new Request('https://test',{method:'POST',body:'{}'}))).status,403);
const staff=[{id:'r',email:'r@test',rank:'First Sergeant',supervisor_id:'c'},{id:'c',email:'c@test',rank:'Colonel'}];
assert.equal(primarySiteReportingChain(['r@test','c@test'],staff).assignmentRequired,true);
assert.equal(primarySiteReportingChain(['r@test'],staff).levels[0][0].id,'r');
assert.equal(primarySiteReportingChain(['c@test'],staff).levels[0][0].id,'c');
console.log('PASS: non-admin client variants; alias and rank-only lookup; limited returned fields; unauthorized denial; explicit supervisor choice');
