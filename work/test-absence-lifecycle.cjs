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
(async()=>{
 let result=await reconcileAbsences(entities,Date.parse(start)-1);
 assert.equal(result.absent,0);assert.equal(db.User[0].status,'Available','future leave must not end current duty');
 assert.equal(db.User[0].out_of_office_start,start);assert.equal(db.Task[0].assigned_to,'cook');
 result=await reconcileAbsences(entities,Date.parse(start));
 assert.equal(result.absent,1);assert.equal(db.User[0].status,'Out of Service');assert.equal(db.Unit[0].status,'Out of Service');assert.equal(db.ActiveOfficer[0].status,'Out of Service');
 assert.equal(db.Task[0].assigned_to,'r1','senior highest eligible rank receives first duty');
 assert.equal(db.Task.filter(t=>t.assigned_to==='r1').length,2);assert.equal(db.Task.filter(t=>t.assigned_to==='r2').length,2);
 assert.equal(db.PerformanceReview[0].assigned_supervisor_id,'major','reviewer must outrank subject, fall back to supervising major');
 assert.equal(db.User[0].platoon,'A','permanent assignments untouched');
 const before=writes;await reconcileAbsences(entities,Date.parse(start)+1000);assert.equal(writes,before,'retry makes no duplicate writes or alerts');
 db.Task[0].status='completed';
 db.Task[1].assigned_to='low'; // explicit admin reassignment preserved
 result=await reconcileAbsences(entities,Date.parse(end));
 assert.equal(result.returned,1);assert.equal(db.Announcement.length,1);assert.equal(db.Task[0].assigned_to,'r1','completed work stays completed');
 assert.equal(db.Task[1].assigned_to,'low','admin reassignment preserved');
 assert.equal(db.Task[2].assigned_to,'cook');assert.equal(db.PerformanceReview[0].assigned_supervisor_id,'cook');
 assert.equal(db.User[0].status,'Out of Service','return must not automatically put officer on field duty');
 await reconcileAbsences(entities,Date.parse(end)+1000);assert.equal(db.Announcement.length,1,'no duplicate return announcement');
 // Manual + PTO overlap: manual early return must not bypass approved leave.
 assert(isOutOfOffice({out_of_office:false,approved_leave_windows:[{start,end}]},Date.parse(start)+1));
 const absent={...users[0],out_of_office:true,out_of_office_start:start,out_of_office_return:end};
 assert.equal(coveragePool(absent,users,Date.parse(start)+1)[0].id,'r1');
 console.log('PASS: exact Eastern/DST windows, overnight/non-overlap, future leave, OOS mirrors, highest rank → hire date → unit, shared duties, reviewer authority, retries, return restoration/announcement and admin overrides.');
})().catch(e=>{console.error(e);process.exit(1);});
