import {createClientFromRequest} from 'npm:@base44/sdk';
import {RANKS,rankLevel,normalizeRank,PAY_RANGES,nextUnitNumber,RANK_SERIES} from '../updateUser/rankPolicy.ts';
import {synchronizeOfficerIdentity} from '../updateUser/synchronizeOfficerIdentity.ts';
import {notifyPlatoonChange} from '../updateUser/notifyPlatoonChange.ts';

const trim=(value:any,max=160)=>String(value??'').trim().slice(0,max);
const fail=(error:string,status=400)=>Response.json({error},{status});
const name=(user:any)=>[user.first_name,user.last_name].filter(Boolean).join(' ').trim()||user.full_name||user.email||'Officer';
const isEmployee=(u:any)=>!!u&&!u.termination_date&&!['terminated','not_employee'].includes(trim(u.employment_status).toLowerCase())&&!['client','student','pending'].some(role=>(u.additional_roles||[]).includes(role)||[u.user_type,u.account_type,u.rank].some(v=>trim(v).toLowerCase()===role));
const supervisorRank=(rank:any)=>rankLevel(rank)<=rankLevel('Sergeant');
const safeOfficer=(u:any)=>({id:u.id,name:name(u),rank:u.rank||'Officer',unit_number:u.unit_number||'',platoon:u.platoon||'',oversight_platoon:u.oversight_platoon||'',supervisor_id:u.supervisor_id||'',supervisor_name:u.supervisor_name||'',email:u.email||'',is_supervisor:!!u.is_supervisor});
async function version(users:any[]){
 const snapshot=users.map(u=>[u.id,u.updated_date,u.rank,u.unit_number,u.platoon,u.oversight_platoon,u.supervisor_id,u.next_level_supervisor_id,u.employment_status,u.termination_date]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
 return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function changePlan(users:any[],input:any){
 const officer=users.find(u=>u.id===trim(input.officer_id));
 if(!isEmployee(officer))throw new Error('Select an active employee, not a client, student, or terminated account.');
 const proposed=normalizeRank(input.new_rank);
 if(!RANKS.includes(proposed))throw new Error('Choose a recognized Pathfinder rank.');
 const oldRank=normalizeRank(officer.rank);
 if(!RANKS.includes(oldRank))throw new Error('Officer has an unrecognized existing rank; correct their account first.');
 if(rankLevel(proposed)>rankLevel(oldRank))throw new Error('Demotions must use the separate documented personnel process.');
 const promoted=proposed!==oldRank;
 const requestedPlatoon=trim(input.platoon)||trim(officer.platoon)||'Unassigned';
 const platoon=rankLevel(proposed)<=2?'Command':requestedPlatoon;
 if(!['A','B','Command','Unassigned'].includes(platoon))throw new Error('Platoon must be A, B, Command, or Unassigned.');
 if(rankLevel(proposed)>2&&platoon==='Command')throw new Error('Only Colonel, Lt Colonel and Major belong to Command platoon.');
 const oversight=proposed==='Major'?trim(input.oversight_platoon||officer.oversight_platoon):'';
 if(proposed==='Major'&&!['A','B'].includes(oversight))throw new Error('Major must oversee Platoon A or B.');
 const superId=trim(input.supervisor_id);
 const supervisor=superId?users.find(u=>u.id===superId):null;
 if(superId&&(!isEmployee(supervisor)||supervisor.id===officer.id||rankLevel(supervisor.rank)>=rankLevel(proposed)))throw new Error('Reporting supervisor must be a different active higher-ranking officer.');
 if(rankLevel(proposed)>2&&!supervisor)throw new Error('Select the higher-ranking command officer who will supervise this officer.');
 const transfer=Boolean(input.transfer_platoon);
 if(transfer&&!supervisorRank(proposed))throw new Error('Platoon command transfer requires Sergeant rank or higher.');
 if(transfer&&!['A','B'].includes(proposed==='Major'?oversight:platoon))throw new Error('Choose Platoon A or B before transferring its chain of command.');
 const affectedPlatoon=proposed==='Major'?oversight:platoon;
 const transfers=transfer?users.filter(u=>isEmployee(u)&&u.id!==officer.id&&u.platoon===affectedPlatoon&&rankLevel(u.rank)>rankLevel(proposed)&&u.supervisor_id!==officer.id):[];
 if(transfers.length>150)throw new Error('Command transfer exceeds 150 officers. Use platoon balance to resolve the roster first.');
 if(!promoted&&!transfer&&oldRank===proposed&&trim(officer.supervisor_id)===superId&&trim(officer.platoon)===platoon&&trim(officer.oversight_platoon)===oversight)throw new Error('No promotion or chain-of-command change selected.');
 const assignedUnit=nextUnitNumber(proposed,users,officer.id);
 const existingUnit=Number(officer.unit_number);
 const series=RANK_SERIES[proposed];
 const unit_number=(promoted||!Number.isSafeInteger(existingUnit)||existingUnit<series.start||existingUnit>series.end)?assignedUnit:trim(officer.unit_number);
 const pay=promoted?(PAY_RANGES[proposed]?.min??Number(officer.hourly_rate)||0):Number(officer.hourly_rate||0);
 const nextSupervisor=supervisor?users.find(u=>u.id===supervisor.supervisor_id):null;
 const updates:any={rank:proposed,unit_number,platoon,oversight_platoon:oversight,
  supervisor_id:supervisor?.id||'',supervisor_email:supervisor?.email||'',supervisor_name:supervisor?`${supervisor.rank||''} ${name(supervisor)}`.trim():'',
  next_level_supervisor_id:nextSupervisor?.id||'',next_level_supervisor_email:nextSupervisor?.email||'',next_level_supervisor_name:nextSupervisor?`${nextSupervisor.rank||''} ${name(nextSupervisor)}`.trim():'',
  is_supervisor:supervisorRank(proposed)||officer.is_supervisor===true};
 if(promoted)updates.hourly_rate=pay;
 const roles=new Set((officer.additional_roles||[]).map((role:string)=>trim(role)));
 if(supervisorRank(proposed)){roles.add('supervisor');updates.additional_roles=[...roles];}
 const reason=trim(input.reason,800);
 return {officer,supervisor,updates,transfers,promoted,reason,effective_date:trim(input.effective_date,16)||new Date().toISOString().slice(0,10),
   preview:{officer:safeOfficer(officer),before:{rank:officer.rank,unit_number:officer.unit_number,platoon:officer.platoon,supervisor:officer.supervisor_name||''},
     after:{rank:proposed,unit_number,platoon,oversight_platoon:oversight,supervisor:updates.supervisor_name,pay_rate:pay,supervisor_role:updates.is_supervisor},
     affected_platoon:affectedPlatoon,transfer:transfer,transfers:transfers.map(u=>safeOfficer(u)),reason,effective_date:trim(input.effective_date,16)||new Date().toISOString().slice(0,10)}};
}
Deno.serve(async req=>{
 try{
  const sdk=createClientFromRequest(req),actor=await sdk.auth.me().catch(()=>null);
  const roles=new Set((actor?.additional_roles||[]).map((role:any)=>trim(role).toLowerCase()));
  if(!actor||(actor.role!=='admin'&&!roles.has('full_access'))||roles.has('client')||actor.user_type==='client')return fail('Administrator command authorization required.',403);
  const input=await req.json().catch(()=>({}));
  const action=trim(input.action||'roster');
  const entities=sdk.asServiceRole.entities;
  if(action==='history'){
   const events=await entities.PersonnelPromotion.list('-created_date',50);
   return Response.json({events:(events||[]).map((event:any)=>({id:event.id,officer_name:event.officer_name,previous_rank:event.previous_rank,new_rank:event.new_rank,new_platoon:event.new_platoon,status:event.status,transfer_count:event.transfer_count,effective_date:event.effective_date,announcement_published:event.announcement_published,warnings:event.warnings,created_date:event.created_date}))});
  }
  const users=await entities.User.list('id',1500);
  if(users.length>=1500)return fail('Roster is too large for safe command assignment. Narrow user listing first.',409);
  if(action==='roster')return Response.json({officers:users.filter(isEmployee).filter(u=>RANKS.includes(normalizeRank(u.rank))).map(safeOfficer).sort((a:any,b:any)=>rankLevel(a.rank)-rankLevel(b.rank)||a.name.localeCompare(b.name)),ranks:RANKS});
  if(action!=='preview'&&action!=='apply')return fail('Unsupported promotion action');
  let plan;
  try{plan=changePlan(users,input);}catch(error:any){return fail(error.message||'Invalid command promotion');}
  const current=await version(users);
  if(action==='preview')return Response.json({preview:plan.preview,version:current});
  if(input.version!==current)return fail('Personnel changed since preview. Review the updated roster before approving.',409);
  if(input.confirm!==true)return fail('Explicit command approval is required.',400);
  const requestId=trim(input.request_id,80);
  if(!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))return fail('A valid idempotent command request ID is required.',400);
  const prior=await entities.PersonnelPromotion.filter({request_id:requestId},'-created_date',1);
  if(prior.length)return Response.json({success:prior[0].status==='complete',already_processed:true,event_id:prior[0].id,status:prior[0].status,announcement_published:prior[0].announcement_published,warnings:prior[0].warnings||[]});
  const event=await entities.PersonnelPromotion.create({request_id:requestId,officer_id:plan.officer.id,officer_email:plan.officer.email,officer_name:name(plan.officer),
   previous_rank:plan.officer.rank,new_rank:plan.updates.rank,previous_unit:trim(plan.officer.unit_number),new_unit:plan.updates.unit_number,
   previous_platoon:plan.officer.platoon||'',new_platoon:plan.updates.platoon,oversight_platoon:plan.updates.oversight_platoon,
   previous_supervisor:plan.officer.supervisor_name||'',new_supervisor:plan.updates.supervisor_name,new_supervisor_id:plan.updates.supervisor_id,
   transfer_count:plan.transfers.length,transfer_ids:plan.transfers.map((u:any)=>u.id),effective_date:plan.effective_date,reason:plan.reason,
   status:'applying',announcement_published:false,requested_by:actor.email||actor.id,approved_by:actor.email||actor.id,applied_at:new Date().toISOString(),warnings:[]});
  let savedOfficer=false;
  const changed:string[]=[],warnings:string[]=[];
  try{
   const before=await entities.User.get(plan.officer.id);
   if(before.updated_date!==plan.officer.updated_date)throw Error('Officer record changed during approval; no command changes applied.');
   await entities.User.update(plan.officer.id,plan.updates);
   const after=await entities.User.get(plan.officer.id);
   savedOfficer=true;
   const mismatches=Object.entries(plan.updates).filter(([key,value])=>String(after?.[key]??'')!==String(value??'')&&key!=='additional_roles');
   if(mismatches.length)throw Error('Rank or chain of command could not be verified: '+mismatches.map(([key])=>key).join(', '));
   changed.push(plan.officer.id);
   try{warnings.push(...await synchronizeOfficerIdentity(entities,after));}catch(error:any){warnings.push('CAD identity synchronization pending: '+error.message);}
   try{await notifyPlatoonChange(entities,before,after);}catch(error:any){warnings.push('Officer command notification pending: '+error.message);}
   for(const member of plan.transfers){
    const existing=await entities.User.get(member.id);
    if(existing.updated_date!==member.updated_date)throw Error('Subordinate roster changed; remaining reassignment stopped.');
    const patch={supervisor_id:after.id,supervisor_email:after.email,supervisor_name:`${after.rank} ${name(after)}`,platoon:plan.preview.affected_platoon,
      next_level_supervisor_id:plan.updates.supervisor_id,next_level_supervisor_email:plan.updates.supervisor_email,next_level_supervisor_name:plan.updates.supervisor_name};
    await entities.User.update(member.id,patch);
    const confirmed=await entities.User.get(member.id);
    if(Object.entries(patch).some(([key,value])=>String(confirmed?.[key]??'')!==String(value??'')))throw Error('Subordinate '+name(member)+' chain of command could not be verified.');
    changed.push(member.id);
    try{await notifyPlatoonChange(entities,existing,confirmed);}catch(error:any){warnings.push(name(member)+' notification pending: '+error.message);}
   }
   const title=plan.promoted?'🎖️ OFFICIAL PERSONNEL PROMOTION & CHANGE OF COMMAND':'🎖️ OFFICIAL CHANGE OF COMMAND';
   const command=plan.updates.supervisor_name||'Company Command';
   const announcementMessage=`BLACK POINT PROTECTION — OFFICIAL COMMAND ANNOUNCEMENT\n\n${name(plan.officer)} has ${plan.promoted?'been promoted from '+plan.officer.rank+' to '+plan.updates.rank:'received a new command assignment'} effective ${plan.effective_date}.\nNew unit number: ${plan.updates.unit_number}.\nPlatoon assignment: ${plan.preview.affected_platoon||plan.updates.platoon}.\nReporting command: ${command}.\n${plan.transfers.length?`Change of command: ${plan.transfers.length} officer(s) now report to ${plan.updates.rank} ${name(plan.officer)}.\n`:''}${plan.reason?'Command notes: '+plan.reason+'\n':''}All affected personnel should review their updated command assignment in Pathfinder.`;
   const publication_key='promotion:'+event.id;
   const announcements=await entities.Announcement.filter({publication_key},'-created_date',1);
   const announcement=announcements[0]||await entities.Announcement.create({title,message:announcementMessage,audience:'company',priority:'urgent',publication_key,pinged_users:[...new Set([plan.officer.email,...plan.transfers.map((u:any)=>u.email)].filter(Boolean))],read_by:[]});
   await entities.PersonnelPromotion.update(event.id,{status:'complete',announcement_id:announcement.id,announcement_published:true,transfer_count:plan.transfers.length,transfer_ids:changed.slice(1),warnings});
   return Response.json({success:true,event_id:event.id,announcement_id:announcement.id,officer:safeOfficer(after),transferred:changed.length-1,warnings});
  }catch(error:any){
   const note=trim(error?.message||'Command workflow failed',400);
   warnings.push(note);
   try{await entities.PersonnelPromotion.update(event.id,{status:'partial',warnings,transfer_ids:changed.slice(1),announcement_published:false});}catch{}
   console.error('Promotion command failure',note);
   return Response.json({error:'Command approval did not complete. Do not resubmit blindly; review the saved promotion event and affected personnel.',event_id:event.id,
     status:'partial',officer_saved:savedOfficer,changed_officer_ids:changed,warnings},{status:503});
  }
 }catch(error:any){console.error('Promotion request unavailable',error?.message||'Unknown error');return fail('Promotion request could not be completed',503);}
});
