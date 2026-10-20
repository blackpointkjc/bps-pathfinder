// @ts-nocheck
const RANKS=['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const clean=value=>String(value||'').trim().toLowerCase();
const rank=p=>{let r=clean(p?.rank).replace(/\./g,'');if(['lt col','lieutenant colonel'].includes(r))r='lt colonel';const i=RANKS.findIndex(v=>clean(v)===r);return i<0?999:i;};
const employed=p=>!p?.termination_date&&!['terminated','inactive'].includes(clean(p?.employment_status));
const roles=p=>new Set((p?.additional_roles||[]).map(clean));
const name=p=>[p?.rank,p?.last_name||String(p?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||'Officer';
const hired=p=>Number.isFinite(Date.parse(p?.hire_date))?Date.parse(p.hire_date):Infinity;
export const commandOrder=(a,b)=>rank(a)-rank(b)||(hired(a)-hired(b))||((Number(a.unit_number)||999999)-(Number(b.unit_number)||999999))||String(a.id).localeCompare(String(b.id));
export const absenceWindows=p=>[
 ...(p?.out_of_office&&p?.out_of_office_source!=='approved_leave'?[{start:p.out_of_office_start,end:p.out_of_office_return}]:[]),
 ...(p?.approved_leave_windows||[])
].filter(w=>Number.isFinite(Date.parse(w.start))&&Number.isFinite(Date.parse(w.end))&&Date.parse(w.end)>Date.parse(w.start));
export const isOutOfOffice=(p,now=Date.now())=>absenceWindows(p).some(w=>now>=Date.parse(w.start)&&now<Date.parse(w.end));
// Convert a business wall-clock time to UTC, including DST. UTC timestamps remain canonical.
export function easternInstant(day,time='00:00'){
 const target=day+'T'+time+':00';let utc=Date.parse(target+'Z');
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(utc)).replace(' ','T');
  const delta=Date.parse(target+'Z')-Date.parse(parts+'Z');utc+=delta;if(!delta)break;
 }
 return new Date(utc).toISOString();
}
const nextDay=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export function leaveWindow(request){
 if(Number.isFinite(Date.parse(request.start_at))&&Number.isFinite(Date.parse(request.end_at)))return {start:request.start_at,end:request.end_at,request_id:request.id};
 return {start:easternInstant(request.start_date),end:easternInstant(nextDay(request.end_date)),request_id:request.id};
}
export function shiftOverlapsLeave(shift,request){
 const day=String(shift.shift_date||'').slice(0,10);
 if(!day)return false;
 const start=shift.start_time||'00:00',end=shift.end_time||'00:00';
 const from=Date.parse(easternInstant(day,start.slice(0,5)));
 const until=Date.parse(easternInstant(end<=start?nextDay(day):day,end.slice(0,5)));
 const window=leaveWindow(request);
 return from<Date.parse(window.end)&&until>Date.parse(window.start);
}
export function coveragePool(owner,users,now=Date.now(),qualifies=()=>true){
 const eligible=users.filter(p=>p.id!==owner.id&&employed(p)&&!isOutOfOffice(p,now)&&rank(p)<999&&qualifies(p));
 const platoon=['A','B'].includes(owner.platoon)?owner.platoon:owner.oversight_platoon;
 const same=eligible.filter(p=>platoon?p.platoon===platoon:rank(owner)<=2&&rank(p)<=2);
 // Prefer peers / next lower rank in their platoon; fall back upward only if necessary.
 let pool=same.filter(p=>rank(p)>=rank(owner));
 if(!pool.length)pool=same.filter(p=>rank(p)<rank(owner));
 if(!pool.length)pool=eligible.filter(p=>rank(p)<rank(owner)&&((rank(p)===2&&p.oversight_platoon===platoon)||rank(p)<2));
 pool.sort(commandOrder);
 return pool;
}
const LIMIT=2000;
async function all(entity,sort='id',query=null){
 const rows=[];for(let skip=0;;skip+=LIMIT){
  const page=await (query?entity.filter(query,sort,LIMIT,skip):entity.list(sort,LIMIT,skip));rows.push(...page);if(page.length<LIMIT)break;
 }return rows;
}
export async function reconcileAbsences(entities,now=Date.now()){
 const users=await all(entities.User);
 const requests=await all(entities.TimeOffRequest,'id',{status:'approved'});
 const stamp=new Date(now).toISOString();
 const summary={absent:0,returned:0,reassigned:0,restored:0,uncovered:0};
 for(const user of users){
  const previous={...user};
  const approved=requests.filter(r=>r.status==='approved'&&(clean(r.requested_by_email||r.created_by)===clean(user.email)||r.created_by_id===user.id))
   .map(leaveWindow).filter(w=>Date.parse(w.end)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const patch={};
  if(JSON.stringify(user.approved_leave_windows||[])!==JSON.stringify(approved))patch.approved_leave_windows=approved;
  const ptoNow=approved.find(w=>now>=Date.parse(w.start)&&now<Date.parse(w.end));
  // Auto-fill the absence controls for leave without overwriting a manually entered window.
  if(!user.out_of_office||user.out_of_office_source==='approved_leave'){
   const next=ptoNow||approved[0];
   Object.assign(patch,next?{out_of_office:true,out_of_office_source:'approved_leave',out_of_office_start:next.start,out_of_office_return:next.end}:user.out_of_office_source==='approved_leave'?{out_of_office:false}: {});
  }
  Object.assign(user,patch);
  const active=isOutOfOffice(user,now);
  if(active){
   summary.absent++;
   const current=absenceWindows(user).filter(w=>now>=Date.parse(w.start)&&now<Date.parse(w.end));
   if(!user.absence_active){
    patch.absence_active=true;
    patch.absence_cycle_key=user.id+':'+current.map(w=>w.start).sort()[0];
   }
   if(user.status!=='Out of Service')Object.assign(patch,{status:'Out of Service',status_since:stamp,last_updated:stamp});
  }else if(user.absence_active){
   const key='absence-return:'+user.absence_cycle_key;
   const prior=await entities.Announcement.filter({publication_key:key},'-created_date',1);
   if(!prior.length)await entities.Announcement.create({
    title:name(user)+' has returned',
    message:name(user)+' has returned from absence. Permanent command and site-supervisor assignments have resumed. Unfinished temporarily covered duties return automatically. Duty status remains Out of Service until normal duty check-in.',
    audience:'company',priority:'normal',publication_key:key,read_by:[],pinged_users:[user.email]
   });
   patch.absence_active=false;patch.absence_return_announced_key=key;summary.returned++;
  }
  for(const key of Object.keys(patch))if(JSON.stringify(previous[key])===JSON.stringify(patch[key]))delete patch[key];
  if(Object.keys(patch).length){
   await entities.User.update(user.id,patch);Object.assign(user,patch);
  }
 }
 const absent=users.filter(u=>isOutOfOffice(u,now));
 // Keep all live CAD mirrors OOS. Do not clock out payroll or clear incident assignments.
 if(absent.length){
  const [live,units]=await Promise.all([all(entities.ActiveOfficer),all(entities.Unit)]);
  for(const user of absent){
   for(const row of live.filter(r=>clean(r.officer_email)===clean(user.email)&&r.status!=='Out of Service'))
    await entities.ActiveOfficer.update(row.id,{status:'Out of Service',last_update:stamp});
   for(const row of units.filter(r=>(r.user_id===user.id||clean(r.user_email)===clean(user.email))&&r.status!=='Out of Service'))
    await entities.Unit.update(row.id,{status:'Out of Service',last_updated:stamp,last_update_at:stamp});
  }
 }
 const specs=[
  {entity:'Task',id:'assigned_to',label:'assigned_name',open:r=>['open','in_progress'].includes(r.status)},
  {entity:'WorkQueueState',id:'assigned_to_id',email:'assigned_to_email',label:'assigned_to_name',open:r=>r.status==='open'&&r.queue_role==='supervisor'},
  {entity:'PerformanceReview',id:'assigned_supervisor_id',email:'assigned_supervisor_email',label:'assigned_supervisor_name',open:r=>!r.supervisor_review_completed&&!r.supervisor_submitted_at&&r.workflow_stage==='supervisor_pending'}
 ];
 const load=new Map();
 for(const spec of specs){
  const entity=entities[spec.entity],records=(await all(entity,'id',{$or:[{[spec.id]:{$in:absent.map(p=>p.id)}},{absence_owner_id:{$exists:true,$ne:''}}]})).filter(spec.open).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  for(const row of records)load.set(row[spec.id],(load.get(row[spec.id])||0)+1);
  for(const row of records){
   const original=users.find(p=>p.id===(row.absence_owner_id||row[spec.id]));
   if(!original)continue;
   // An explicit reassignment by admin takes precedence over our temporary routing.
   if(row.absence_owner_id&&row[spec.id]!==row.absence_assignee_id){
    await entity.update(row.id,{absence_owner_id:'',absence_assignee_id:''});continue;
   }
   if(!isOutOfOffice(original,now)){
    if(row.absence_owner_id){
     const patch={[spec.id]:original.id,[spec.label]:name(original),absence_owner_id:'',absence_assignee_id:''};
     if(spec.email)patch[spec.email]=original.email;
     if(spec.entity==='PerformanceReview')patch.reviewer_email=original.email;
     await entity.update(row.id,patch);summary.restored++;
    }
    continue;
   }
   const ownerRoles=roles(original);
   let candidates=coveragePool(original,users,now,p=>{
    const r=roles(p),admin=p.role==='admin'||r.has('full_access');
    if(spec.entity==='Task'){
     // Never transfer privileged employee/client/trainer work to an officer without that access.
     const privileged=['hr','accounting','trainer'].filter(role=>ownerRoles.has(role));
     if(privileged.length&&!privileged.every(role=>r.has(role)||admin))return false;
     if(original.role==='admin'&&!admin)return false;
    }
    if(spec.entity==='WorkQueueState'&&!(admin||r.has('supervisor')||p.is_supervisor||rank(p)<=6))return false;
    if(spec.entity==='PerformanceReview'){
     const subject=users.find(u=>u.id===row.officer_id||clean(u.email)===clean(row.officer_email));
     if(!subject||rank(p)>=rank(subject))return false;
    }
    if(spec.entity==='Task'&&row.related_id===p.id)return false;
    return true;
   });
   if(!candidates.length){
    summary.uncovered++;
    for(const admin of users.filter(p=>p.email&&(p.role==='admin'||roles(p).has('full_access')))){
     const event_key='absence-uncovered:'+spec.entity+':'+row.id+':'+original.absence_cycle_key+':'+admin.id;
     if(!(await entities.Notification.filter({event_key},'-created_date',1)).length)
      await entities.Notification.create({event_key,recipient_email:admin.email,type:'supervisor_task',title:'Absence duty needs qualified coverage',message:(row.title||'Pending performance review')+' assigned to '+name(original)+' has no eligible available replacement. The duty is held for qualified coverage.',related_id:row.id,priority:'high',source_name:'Officer Availability'});
    }
    continue;
   }
   const highest=rank(candidates[0]);candidates=candidates.filter(p=>rank(p)===highest);
   // Balance across the highest eligible rank. Seniority and unit number decide equal loads.
   candidates.sort((a,b)=>(load.get(a.id)||0)-(load.get(b.id)||0)||commandOrder(a,b));
   const existing=users.find(u=>u.id===row.absence_assignee_id);
   const chosen=existing&&candidates.some(p=>p.id===existing.id)?existing:candidates[0];
   if(row[spec.id]===chosen.id)continue;
   const patch={[spec.id]:chosen.id,[spec.label]:name(chosen),absence_owner_id:original.id,absence_assignee_id:chosen.id};
   if(spec.email)patch[spec.email]=chosen.email;
   if(spec.entity==='PerformanceReview')patch.reviewer_email=chosen.email;
   if(spec.entity==='WorkQueueState')patch.assignment_basis='absence_rank_seniority';
   await entity.update(row.id,patch);
   load.set(chosen.id,(load.get(chosen.id)||0)+1);summary.reassigned++;
   const key='absence-duty:'+spec.entity+':'+row.id+':'+original.absence_cycle_key+':'+chosen.id;
   const prior=await entities.Notification.filter({event_key:key},'-created_date',1);
   if(!prior.length)await entities.Notification.create({recipient_email:chosen.email,type:'supervisor_task',title:'Temporary duty coverage',message:'You are covering '+(row.title||'a pending review')+' for '+name(original)+'.',related_id:row.id,event_key:key,priority:'normal',source_name:'Officer Availability'});
  }
 }
 return summary;
}
