import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
const matches=(r,q)=>Object.entries(q).every(([k,v])=>{
 if(k==='$or')return v.some(x=>matches(r,x));
 if(v && typeof v==='object')return Object.entries(v).every(([op,val])=>op==='$exists'?(r[k]!==undefined)===val:op==='$gte'?r[k]>=val:op==='$lte'?r[k]<=val:op==='$gt'?r[k]>val:op==='$ne'?r[k]!==val:false);
 return r[k]===v || (v===null && r[k]===undefined);
});
const table={ScheduleWeekStatus:[{id:'week',week_start_date:'2026-10-11',is_ready:false,unpublished_officer_emails:['HELD@EXAMPLE.COM']}],Schedule:[
 {id:'s1',shift_date:'2026-10-12',officer_email:'OFFICER@example.com'},
 {id:'s2',shift_date:'2026-10-13',officer_email:'officer@example.com'},
 {id:'s3',shift_date:'2026-10-13',officer_email:'held@example.com'},
 {id:'s4',shift_date:'2026-10-13',officer_email:'OPEN',is_open:true},
 {id:'s5',shift_date:'2026-10-13',officer_email:'old@example.com',archived:true},
 {id:'s6',shift_date:'2026-11-01',officer_email:'other@example.com'},
 {id:'s7',shift_date:'2026-10-14',officer_email:'second@example.com'},
],Announcement:[],Notification:[],User:[{id:'calvin',full_name:'Calvin Jones',additional_roles:['officer']}],StudentEnrollment:[],AccessRequest:[],Task:[
 {id:'t1',title:'Review new officer certifications',status:'open',related_id:'calvin',assigned_to:'trainer1'},
 {id:'t2',title:'Review new officer certifications',status:'open',related_id:'calvin',assigned_to:'trainer2'},
]};
let failSecond=true, failLookup=false, seq=0, actor={id:'admin',role:'admin',email:'admin@example.com'};
const db=new Proxy({}, {get:(_,name)=>({
 get:async id=>structuredClone(table[name].find(r=>r.id===id)),
 list:async()=>structuredClone(table[name]),
 filter:async(q,sort,limit=500,skip=0)=>{
  if(name==='Notification' && failLookup)throw {status:429,message:'rate limit'};
  return structuredClone(table[name].filter(r=>matches(r,q)).slice(skip,skip+limit));
 },
 create:async data=>{
  if(name==='Notification' && data.recipient_email==='second@example.com' && failSecond)throw {status:429,message:'rate limit'};
  const row={...data,id:'new-'+(++seq)};table[name].push(row);return structuredClone(row);
 },
 update:async(id,data)=>{const row=table[name].find(r=>r.id===id);Object.assign(row,data);return structuredClone(row);},
 updateMany:async(q,data)=>{const rows=table[name].filter(r=>matches(r,q));rows.forEach(r=>Object.assign(r,data.$set));return {updated:rows.length};}
})});
function load(path){
 let handler;
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports:{},require:()=>({createClientFromRequest:()=>({auth:{me:async()=>actor},asServiceRole:{entities:db}})}),Deno:{serve:fn=>handler=fn},Response,Date,Map,Set,crypto:{randomUUID},console:{warn(){},error(){}}});
 return handler;
}
const publish=load('base44/functions/publishScheduleWeek/entry.ts');
const request=(ready=true)=>({json:async()=>({week_start_date:'2026-10-11',is_ready:ready})});
let result=await (await publish(request())).json();
assert.equal(result.pending,1);assert.equal(result.delivered,1);
assert.equal(table.Announcement.length,1);assert.equal(table.Notification.length,1);
assert.equal(table.Notification[0].recipient_email,'officer@example.com');
assert.match(table.Notification[0].message,/2 shift/);
assert.equal(table.ScheduleWeekStatus[0].is_ready,true);
assert.equal(table.ScheduleWeekStatus[0].delivery_status,'pending');
failSecond=false;
result=await (await publish(request())).json();
assert.equal(result.pending,0);assert.equal(result.delivered,2);
assert.equal(table.Announcement.length,1);assert.equal(table.Notification.length,2);
await publish(request());assert.equal(table.Notification.length,2);assert.equal(table.Announcement.length,1);
assert.equal(table.ScheduleWeekStatus[0].delivery_status,'complete');
failLookup=true;result=await (await publish(request())).json();assert.equal(result.pending,2);assert.equal(table.Notification.length,2);
failLookup=false;
table.ScheduleWeekStatus[0].delivery_locked_until=new Date(Date.now()+60000).toISOString();
assert.equal((await publish(request())).status,409);
table.ScheduleWeekStatus[0].delivery_locked_until=new Date(0).toISOString();
assert.equal((await (await publish(request(false))).json()).is_ready,false);
assert.equal(table.Notification.length,2);
actor={role:'user'};assert.equal((await publish(request())).status,403);
actor={role:'admin'};
const briefing=await (await load('base44/functions/getAdminOperationsBriefing/entry.ts')({})).json();
const training=briefing.items.filter(i=>i.area==='Training');
assert.equal(training.length,1);assert.equal(training[0].person,'Calvin Jones');
assert.equal(briefing.status.pending_trainer_reviews,1);assert.equal(training[0].owner,undefined);
console.log('PASS: one officer review; schedule announcement; normalized officer grouping; open/archived/withheld exclusions; partial delivery recovery; no duplicates on retry; failed lookups fail closed; publication lock; authorization.');
