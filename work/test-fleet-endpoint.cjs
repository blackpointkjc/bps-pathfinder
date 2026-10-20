const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function compile(path,context={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,Intl,Map,Set,console,...context});return exports;}
const {intersects}=compile('base44/functions/getFleetScheduleData/fleetPolicy.ts');
const officer={id:'officer',email:'officer@test',rank:'Lieutenant',last_name:'Example',additional_roles:['officer']};
let handler,actor={id:'admin',role:'admin',email:'admin@test'},writes=0;
const records=[],db={User:{list:async()=>[officer]},Vehicle:{get:async()=>({id:'car',vehicle_id:'Car 1',status:'Active'})},VehicleAssignment:{
 get:async id=>structuredClone(records.find(r=>r.id===id)),filter:async()=>structuredClone(records),
 create:async row=>{writes++;const saved={...row,id:'v'+records.length};records.push(saved);return structuredClone(saved);},
 update:async(id,row)=>{writes++;const saved=records.find(r=>r.id===id);if(!saved)throw Error('not found');Object.assign(saved,row);return structuredClone(saved);},
 delete:async id=>{writes++;records.splice(records.findIndex(r=>r.id===id),1);}
}};
compile('base44/functions/getFleetScheduleData/entry.ts',{Deno:{serve:fn=>handler=fn},Response,intersects,syncFleet:async()=>({}),createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:db}})});
const call=body=>handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));
(async()=>{
 const row={assignment_date:'2026-10-18',start_time:'18:00',end_time:'23:00',vehicle_id:'car',primary_officer_email:officer.email};
 let response=await call({action:'save',assignment:row}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(records.length,1);const id=body.assignment.id;
 response=await call({action:'save',assignment:{...row,id,notes:'edited'}});body=await response.json();assert.equal(response.status,200);assert.equal(records.length,1);assert.equal(records[0].notes,'edited');
 response=await call({action:'save',assignment:{...row,start_time:'22:00',end_time:'06:00'}});assert.equal(response.status,409);
 response=await call({action:'delete',id});assert.equal(response.status,200);assert.equal(records.length,0);
 records.push({...row,id:'default',assignment_source:'officer_default',source_schedule_id:'s1',status:'scheduled'});
 response=await call({action:'delete',id:'default'});assert.equal(response.status,200);assert.equal(records[0].status,'cancelled');assert.equal(records[0].assignment_source,'manual');assert.equal(records[0].source_schedule_id,'s1','default suppression keeps schedule provenance');
 actor={email:'officer@test',additional_roles:['officer']};const before=writes;
 response=await call({action:'delete',id:'default'});assert.equal(response.status,403);assert.equal(writes,before);
 console.log('PASS: actual fleet endpoint creates, updates existing ID, rejects conflicts, removes manual reservations, suppresses automatic recreation for removed defaults, and enforces manager authorization.');
})().catch(e=>{console.error(e);process.exit(1)});
