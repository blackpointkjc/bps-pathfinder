import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
let handler, lastQuery;
const officer={id:'officer',email:'login@example.test',work_email:'work@example.test',email_aliases:['legacy@example.test']};
const rows=[
{id:'evening',officer_email:officer.email,clock_in:'2026-10-06T02:00:00Z',clock_out:null},
{id:'outside',officer_email:officer.work_email,clock_in:'2026-10-06T05:00:00Z',clock_out:null},
{id:'closed',officer_email:officer.work_email,clock_in:'2026-10-05T14:00:00Z',clock_out:'2026-10-05T18:00:00Z'},
{id:'archived',officer_email:officer.work_email,clock_in:'2026-10-05T14:00:00Z',archived:true}
];
const client={auth:{me:async()=>officer},asServiceRole:{entities:{TimeEntry:{filter:async query=>{lastQuery=query;return rows;}}}}};
const source=fs.readFileSync('base44/functions/getMyTimeEntries/entry.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:{},createClientFromRequest:()=>client,Deno:{serve:fn=>handler=fn},Response,Date,Intl,Set,console,setTimeout});
const request=body=>new Request('https://example.test',{method:'POST',body:JSON.stringify(body)});
const history=await (await handler(request({start_date:'2026-10-05',end_date:'2026-10-05'}))).json();
assert.deepEqual(history.entries.map(x=>x.id),['evening','closed']);
assert.deepEqual(Array.from(lastQuery.officer_email.$in).sort(),['legacy@example.test','login@example.test','work@example.test']);
const active=await (await handler(request({active_only:true}))).json();
assert.deepEqual(active.entries.map(x=>x.id),['evening','outside']);
assert.equal((await handler(request({preview_user_id:'another-officer'}))).status,403);
console.log('PASS: Eastern evening entries included; linked identities matched; closed/archived entries excluded from active shift; unauthorized officer preview denied');
