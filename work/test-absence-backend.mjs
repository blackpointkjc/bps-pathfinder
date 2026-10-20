import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const windowData={out_of_office:true,out_of_office_start:new Date(Date.now()-60000).toISOString(),out_of_office_return:new Date(Date.now()+600000).toISOString()};
let handler;
let actor={id:'admin',role:'admin'};
const source=fs.readFileSync('base44/functions/updateUser/entry.ts','utf8').replace(/^import .*;\n/gm,'');
const target={id:'target',role:'user',additional_roles:['officer'],rank:'Officer'};
vm.runInNewContext(compile(source),{Deno:{serve:fn=>handler=fn},Response,console:{log:()=>{},error:()=>{}},createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:{User:{list:async()=>[target]}}}})});
actor={id:'hr',role:'user',additional_roles:['hr']};
let result=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({userId:'target',updates:windowData})}));
assert.equal(result.status,403,'HR must not change admin availability policy');
actor={id:'admin',role:'admin'};
result=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({userId:'target',updates:{...windowData,out_of_office_return:'invalid'}})}));
assert.equal(result.status,400,'invalid return must be rejected before write');
const absentActor={id:'s',role:'user',rank:'Lieutenant',...windowData};
for (const name of ['getSupervisorScopedTasks','completeSupervisorPerformanceReview','completeTrainerCertificationReview']) {
 let fn;
 const source=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(compile(source),{Deno:{serve:value=>fn=value},Response,console,createClientFromRequest:()=>({auth:{me:async()=>absentActor}})});
 const res=await fn(new Request('https://test',{method:'POST',body:'{}'}));
 const body=await res.json();
 assert.equal(body.held_until,windowData.out_of_office_return,name+' must hold absent user tasks before any source write');
 assert.equal(res.status,name==='getSupervisorScopedTasks'?200:409);
}
console.log('PASS: admin-only absence changes, invalid-window rejection, task queue holds and completion guards');
