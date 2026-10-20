const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function moduleFrom(path,context={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,Intl,Map,Set,console,...context});return exports;}
const {syncFleet,intersects}=moduleFrom('base44/functions/getFleetScheduleData/fleetPolicy.ts');
assert(intersects({assignment_date:'2026-10-21',start_time:'19:00',end_time:'07:00'},{shift_date:'2026-10-22',start_time:'06:00',end_time:'08:00'}),'cross-midnight reservation conflict');
assert(!intersects({assignment_date:'2026-10-21',start_time:'19:00',end_time:'07:00'},{shift_date:'2026-10-22',start_time:'07:00',end_time:'08:00'}),'adjacent boundaries do not overlap');
const db={User:[{id:'officer',email:'a@test',rank:'Lieutenant',last_name:'Alpha'}],Vehicle:[{id:'car',vehicle_id:'Car 1',assigned_to:'officer',status:'Active'},{id:'pool',vehicle_id:'Car 2',status:'Active'}],
Schedule:[{id:'s1',shift_date:'2026-10-21',start_time:'19:00',end_time:'07:00',officer_email:'a@test',location:'Site A'},{id:'s2',shift_date:'2026-10-23',start_time:'07:00',end_time:'15:00',officer_email:'a@test',location:'Site B'}],
VehicleAssignment:[{id:'manual',assignment_date:'2026-10-22',start_time:'06:00',end_time:'08:00',vehicle_id:'car',primary_officer_email:'other@test',status:'scheduled',assignment_source:'manual'}]};
let writes=0;
const entities=Object.fromEntries(Object.keys(db).map(key=>[key,{
 filter:async(q,sort,limit,skip=0)=>structuredClone(db[key].filter(row=>Object.entries(q).every(([k,v])=>v&&typeof v==='object'?Object.entries(v).every(([op,target])=>op==='$gte'?row[k]>=target:row[k]<=target):row[k]===v)).slice(skip,skip+limit)),
 update:async(id,patch)=>{writes++;return Object.assign(db[key].find(row=>row.id===id),structuredClone(patch));},
 create:async payload=>{writes++;const row={id:key+db[key].length,...structuredClone(payload)};db[key].push(row);return structuredClone(row);}
}]));
(async()=>{
 const now=Date.parse('2026-10-20T19:00:00Z');
 let result=await syncFleet(entities,now);
 assert.equal(result.created,1);assert.equal(result.conflicts.length,1);assert.equal(db.VehicleAssignment[0].status,'scheduled','manual reservation retained');
 db.VehicleAssignment[0].status='cancelled';result=await syncFleet(entities,now);assert.equal(result.created,1);
 const saved=db.VehicleAssignment.find(row=>row.source_schedule_id==='s1');assert.equal(saved.vehicle_id,'car');assert.equal(saved.primary_officer_name,'Lieutenant Alpha');
 const count=writes;await syncFleet(entities,now);assert.equal(writes,count,'repeated synchronization is idempotent');
 db.Schedule[0].shift_date='2026-10-24';result=await syncFleet(entities,now);assert.equal(result.updated,1);assert.equal(saved.assignment_date,'2026-10-24','reservation follows moved shift');
 db.Schedule[0].is_open=true;result=await syncFleet(entities,now);assert.equal(saved.status,'cancelled','open shifts release automatic vehicle');
 db.Vehicle[0].status='Maintenance';result=await syncFleet(entities,now);assert.equal(result.cancelled,1);assert(result.conflicts.length);
 db.Vehicle[0].status='Active';
 db.VehicleAssignment.push({id:'override',assignment_date:'2026-10-23',start_time:'07:00',end_time:'15:00',vehicle_id:'pool',primary_officer_email:'a@test',status:'scheduled',assignment_source:'manual'});
 result=await syncFleet(entities,now);assert.equal(result.created,0,'manual vehicle override takes priority over default');
 db.VehicleAssignment.find(row=>row.id==='override').status='cancelled';
 db.Vehicle[0].assigned_to='';result=await syncFleet(entities,now);assert.equal(result.created,0,'clearing default does not assign an arbitrary car');
 console.log('PASS: default vehicle reservations, previous-day overnight conflicts, idempotence, moved/open shifts, maintenance release and manual override priority.');
})().catch(error=>{console.error(error);process.exit(1);});
