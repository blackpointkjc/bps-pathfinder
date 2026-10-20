const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const compile=source=>ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
(async()=>{
let actor={id:'hr',email:'hr@test',role:'user',additional_roles:['hr']},handler;
const request={id:'leave',requested_by_email:'officer@test',requested_by_name:'Jane Robinson',start_date:'2026-10-25',end_date:'2026-10-26',status:'pending',request_type:'unpaid'};
const shifts=[{id:'shift',officer_email:'officer@test',shift_date:'2026-10-25',is_open:false},{id:'outside',officer_email:'officer@test',shift_date:'2026-10-29',is_open:false}];
const notifications=[];
const users=[{id:'officer',email:'officer@test',rank:'First Sergeant',last_name:'Robinson'},{id:'admin',email:'admin@test',role:'admin'}];
const api={auth:{me:async()=>actor},asServiceRole:{entities:{
 TimeOffRequest:{list:async()=>[request],update:async(id,patch)=>Object.assign(request,patch)},
 User:{list:async()=>users},
 Schedule:{list:async()=>shifts,update:async(id,patch)=>Object.assign(shifts.find(row=>row.id===id),patch)},
 Notification:{create:async record=>{notifications.push(record);return record;}}
}}};
vm.runInNewContext(compile(fs.readFileSync('base44/functions/getPTORequests/entry.ts','utf8')),{Deno:{serve:fn=>handler=fn},Response,console,createClientFromRequest:()=>api,setTimeout});
const review=()=>handler(new Request('https://test',{method:'POST',body:JSON.stringify({action:'review',request_id:'leave',status:'approved'})}));
assert.equal((await review()).status,403);
assert.equal(request.status,'pending');
actor={id:'admin',email:'admin@test',role:'admin'};
const approved=await review();
assert.equal(approved.status,200);assert.equal((await approved.json()).opened_shifts,1);
assert.equal(shifts[0].officer_email,'OPEN');assert.equal(shifts[1].officer_email,'officer@test');
assert.ok(notifications.some(row=>row.recipient_email==='admin@test'&&row.message.includes('First Sergeant Robinson')));
assert.ok(notifications.some(row=>row.recipient_email==='officer@test'));
assert.equal((await review()).status,409);
for(const name of ['manageClientAssignments','createPortalAccount']){
 let call;
 const src=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8');
 actor={id:'hr',role:'user',additional_roles:['hr']};
 vm.runInNewContext(compile(src),{Deno:{serve:fn=>call=fn},Response,console,createClientFromRequest:()=>({auth:{me:async()=>actor}})});
 const res=await call(new Request('https://test',{method:'POST',body:JSON.stringify({action:'update',accountType:'client',first_name:'Test',last_name:'Client',email:'client@test'})}));
 assert.equal(res.status,403,name+' must reject HR client management');
}
console.log('PASS: HR cannot manage clients or approve leave; Admin approval opens only affected shifts, notifies scheduling and prevents repeat approval');
})().catch(error=>{console.error(error);process.exitCode=1});
