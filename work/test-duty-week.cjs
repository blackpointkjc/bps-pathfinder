const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function compile(path,extras={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,Intl,Map,Set,console,...extras});return exports;}
const {absenceWindows}=compile('base44/functions/manageDutySupervisorSchedule/absencePolicy.ts');
const {easternInstant}=compile('base44/functions/manageDutySupervisorSchedule/leaveWindow.ts');
const {intersects}=compile('base44/functions/manageDutySupervisorSchedule/fleetPolicy.ts');
const {validateBatch}=compile('base44/functions/manageDutySupervisorSchedule/batchPolicy.ts',{absenceWindows,easternInstant,intersects});
const supervisor={id:'sup',email:'sup@test',rank:'Lieutenant',last_name:'Supervisor'};
const dates=Array.from({length:7},(_,i)=>'2026-10-'+(18+i));
const rows=dates.map(assignment_date=>({assignment_date,start_time:'19:00',end_time:'07:00',location:'ALL',supervisor_email:'sup@test'}));
let plan=validateBatch(rows,[supervisor],[]);assert.equal(plan.planned.length,7);assert.equal(plan.errors.length,0);
const absent={...supervisor,out_of_office:true,out_of_office_start:'2026-10-21T23:00:00Z',out_of_office_return:'2026-10-22T11:00:00Z'};
assert(validateBatch(rows,[absent],[]).errors.length,'out-of-office windows block a seven-day fill');
assert.equal(validateBatch(rows,[supervisor],rows.map((r,i)=>({...r,id:'saved'+i,status:'scheduled'}))).skipped,7);
assert(validateBatch([{...rows[0],assignment_date:'bad'}],[supervisor],[]).errors.length);
assert(validateBatch([{...rows[1],start_time:'06:00',end_time:'08:00'}],[supervisor],[{...rows[0],status:'scheduled'}]).errors.length,'cross-date overlap is checked');
let handler,actor={id:'admin',role:'admin',email:'admin@test'},saved=[],writes=0;
compile('base44/functions/manageDutySupervisorSchedule/entry.ts',{
 Deno:{serve:fn=>handler=fn},Response,validateBatch,
 createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:{
 User:{list:async()=>[supervisor]},DutySupervisorAssignment:{list:async()=>structuredClone(saved),create:async row=>{writes++;const item={id:'d'+saved.length,...row};saved.push(item);return item;}},AuditLog:{create:async()=>({})}
 }}})
});
const call=body=>handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));
(async()=>{
 actor={id:'employee',email:'e@test',additional_roles:['officer'],rank:'Officer'};
 let response=await call({action:'batch',assignments:rows});assert.equal(response.status,403);
 actor={id:'admin',email:'admin@test',role:'admin'};
 response=await call({action:'batch',assignments:rows});let result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.created,7);
 response=await call({action:'batch',assignments:rows});result=await response.json();assert.equal(result.skipped,7);assert.equal(writes,7);
 response=await call({action:'copy_week',source_start:'2026-10-18',target_start:'2026-10-25',supervisor_emails:['sup@test']});result=await response.json();assert.equal(result.created,7);assert(saved.some(row=>row.assignment_date==='2026-10-31'));
 response=await call({action:'copy_week',source_start:'2026-10-18',target_start:'2026-10-25'});result=await response.json();assert.equal(result.skipped,7);
 const before=writes;
 response=await call({action:'batch',assignments:[{...rows[0],assignment_date:'2026-11-03'},{...rows[0],assignment_date:'invalid'}]});assert.equal(response.status,409);assert.equal(writes,before,'validation rejects the whole request before writing any block');
 console.log('PASS: real duty endpoint authorization, seven-day creation, selected-officer week copy, repeat-safe skips, leave/overnight conflicts and complete preflight validation.');
})().catch(error=>{console.error(error);process.exit(1);});
