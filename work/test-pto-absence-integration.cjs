const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const moduleBox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('base44/functions/enforceOfficerDutyStatus/absenceLifecycle.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleBox.exports,Date,Intl,Map,Set,console});
const {reconcileAbsences,coveragePool,easternInstant,shiftOverlapsLeave,isOutOfOffice,commandOrder}=moduleBox.exports;
const start='2026-10-20T23:00:00.000Z',end='2026-10-21T11:00:00.000Z';
assert.equal(easternInstant('2026-10-20','19:00'),start);
assert.equal(easternInstant('2026-11-01','00:00'),'2026-11-01T04:00:00.000Z');
assert.equal(easternInstant('2026-11-02','00:00'),'2026-11-02T05:00:00.000Z');
const leave={id:'leave',status:'approved',requested_by_email:'cook@test',start_date:'2026-10-20',end_date:'2026-10-21',start_at:start,end_at:end};
assert(shiftOverlapsLeave({shift_date:'2026-10-20',start_time:'22:00',end_time:'06:00'},leave));
assert(!shiftOverlapsLeave({shift_date:'2026-10-20',start_time:'07:00',end_time:'15:00'},leave));
assert(!shiftOverlapsLeave({shift_date:'2026-10-21',start_time:'07:00',end_time:'15:00'},leave));
const users=[
 {id:'cook',email:'cook@test',rank:'Lieutenant',last_name:'Cook',platoon:'A',status:'Available'},
 {id:'r1',email:'r1@test',rank:'First Sergeant',last_name:'Robinson',platoon:'A',hire_date:'2020-01-01',unit_number:'459'},
 {id:'r2',email:'r2@test',rank:'First Sergeant',last_name:'Other',platoon:'A',hire_date:'2022-01-01',unit_number:'450'},
 {id:'low',email:'low@test',rank:'Sergeant',platoon:'A',hire_date:'2000-01-01',unit_number:'500'},
 {id:'wrong',email:'wrong@test',rank:'Captain',platoon:'B',hire_date:'1990-01-01'},
 {id:'major',email:'major@test',rank:'Major',oversight_platoon:'A'},
 {id:'subject',email:'subject@test',rank:'Lieutenant',platoon:'B'}
];
assert.equal([...users.slice(1,4)].sort(commandOrder)[0].id,'r1','hire date wins over lower unit at same rank');
assert.equal([{rank:'Sergeant',unit_number:'502',hire_date:'2020-01-01'},{rank:'Sergeant',unit_number:'501',hire_date:'2020-01-01'}].sort(commandOrder)[0].unit_number,'501');
function matches(r,q){return !q||Object.entries(q).every(([key,v])=>{
 if(key==='$or')return v.some(part=>matches(r,part));
 const value=r[key];
 if(v&&typeof v==='object')return Object.entries(v).every(([op,t])=>op==='$in'?t.includes(value):op==='$ne'?value!==t:op==='$exists'?(value!==undefined)===t:false);
 return value===v;
});}
const db={
 User:structuredClone(users),TimeOffRequest:[leave],
 Task:Array.from({length:4},(_,i)=>({id:'t'+i,title:'Duty '+i,assigned_to:'cook',status:'open'})),
 WorkQueueState:[{id:'q1',task_key:'test',assigned_to_id:'cook',status:'open',queue_role:'supervisor'}],
 PerformanceReview:[{id:'review',assigned_supervisor_id:'cook',officer_id:'subject',workflow_stage:'supervisor_pending'}],
 Announcement:[],Notification:[],Unit:[{id:'unit',user_id:'cook',status:'Available'}],ActiveOfficer:[{id:'live',officer_email:'cook@test',status:'Available'}]
};
let writes=0;
const entities=Object.fromEntries(Object.keys(db).map(key=>[key,{
 list:async(sort,limit,skip=0)=>structuredClone(db[key].slice(skip,skip+limit)),
 filter:async(q,sort,limit,skip=0)=>structuredClone(db[key].filter(r=>matches(r,q)).slice(skip,skip+limit)),
 update:async(id,patch)=>{writes++;const row=db[key].find(r=>r.id===id);assert(row,key+id);Object.assign(row,structuredClone(patch));return structuredClone(row);},
 create:async(data)=>{writes++;const row={id:key+db[key].length,...structuredClone(data)};db[key].push(row);return structuredClone(row);}
}]));

let actor={id:'admin',email:'admin@test',role:'admin'};
for(const key of Object.keys(entities))entities[key].get=async id=>structuredClone(db[key].find(r=>r.id===id));
db.User.push(actor);
db.TimeOffRequest[0].status='pending';
db.Schedule=[
{id:'overlap',officer_email:'cook@test',shift_date:'2026-10-20',start_time:'22:00',end_time:'06:00'},
{id:'morning',officer_email:'cook@test',shift_date:'2026-10-20',start_time:'07:00',end_time:'15:00'},
{id:'after',officer_email:'cook@test',shift_date:'2026-10-21',start_time:'07:00',end_time:'15:00'}];
entities.Schedule={
 list:async()=>structuredClone(db.Schedule),
 update:async(id,patch)=>Object.assign(db.Schedule.find(r=>r.id===id),patch)
};
let handler;
const entry=fs.readFileSync('base44/functions/getPTORequests/entry.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(ts.transpileModule(entry,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 Deno:{serve:fn=>handler=fn},Response,Request,Date,Intl,console,setTimeout,
 reconcileAbsences:async e=>reconcileAbsences(e,Date.parse(start)+1),
 shiftOverlapsLeave,leaveWindow:moduleBox.exports.leaveWindow,
 createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities}})
});
const call=body=>handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}));
(async()=>{
 actor={id:'hr',role:'user',additional_roles:['hr']};
 let response=await call({action:'review',request_id:'leave',status:'approved'});assert.equal(response.status,403);
 actor=db.User[0];
 response=await call({action:'submit',start_date:'2026-10-20',end_date:'2026-10-21',reason:'Need time',request_type:'unpaid',hours_requested:8});assert.equal(response.status,400,'exact times required');
 actor=db.User.find(u=>u.id==='admin');
 response=await call({action:'review',request_id:'leave',status:'approved'});
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(body.opened_shifts,1);
 assert.equal(db.Schedule[0].officer_email,'OPEN');
 assert.equal(db.Schedule[1].officer_email,'cook@test');
 assert.equal(db.Schedule[2].officer_email,'cook@test');
 assert.equal(db.User[0].out_of_office,true);
 assert.equal(db.User[0].out_of_office_start,start);
 assert.equal(db.User[0].out_of_office_return,end);
 assert.equal(db.User[0].status,'Out of Service');
 assert.equal(db.TimeOffRequest[0].approval_sync_complete,true);
 response=await call({action:'review',request_id:'leave',status:'approved'});assert.equal(response.status,409);
 // Test valid request submission and overlap guard through the real handler.
 actor=db.User.find(u=>u.id==='r1');
 response=await call({action:'submit',start_date:'2026-10-23',end_date:'2026-10-24',start_at:'2026-10-23T23:00:00Z',end_at:'2026-10-24T11:00:00Z',time_zone:'America/New_York',hours_requested:8,request_type:'unpaid',reason:'Scheduled leave'});
 assert.equal(response.status,200,await response.text());
 response=await call({action:'submit',start_date:'2026-10-23',end_date:'2026-10-24',start_at:'2026-10-23T23:00:00Z',end_at:'2026-10-24T11:00:00Z',time_zone:'America/New_York',hours_requested:8,request_type:'unpaid',reason:'Duplicate'});
 assert.equal(response.status,409);
 console.log('PASS: real PTO handler rejects missing times/HR approval/duplicate overlap; approval opens only overlapping shifts, activates dated absence, sets OOS and routes duties; completed approval cannot repeat.');
})().catch(error=>{console.error(error);process.exit(1);});
