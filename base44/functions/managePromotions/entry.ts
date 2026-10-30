import {createClientFromRequest} from 'npm:@base44/sdk';




// Bundled personnel policy from base44/functions/updateUser/rankPolicy.ts
// Shared personnel policy. This module contains no runtime or service dependencies.
const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const RANK_SERIES: Record<string, {start:number,end:number}> = {
 'Colonel':{start:100,end:100},'Lt Colonel':{start:102,end:199},
 'Major':{start:200,end:299},'Captain':{start:350,end:399},
 'Lieutenant':{start:400,end:449},'First Sergeant':{start:450,end:499},
 'Sergeant':{start:500,end:549},'Corporal':{start:550,end:599},
 'Senior officer':{start:600,end:649},'Officer':{start:650,end:699},
 'Unarmed Officer':{start:700,end:799}
};
const PAY_RANGES: Record<string, {min:number,max:number}> = {
 'Unarmed Officer':{min:18,max:20},'Officer':{min:19.5,max:21.5},
 'Senior officer':{min:20.5,max:22.5},'Corporal':{min:21,max:23},
 'Sergeant':{min:22,max:24},'First Sergeant':{min:23,max:25},
 'Lieutenant':{min:24,max:26},'Captain':{min:25,max:27},
 'Major':{min:27.5,max:27.5},'Lt Colonel':{min:27.5,max:27.5},'Colonel':{min:27.5,max:27.5}
};
function normalizeRank(value: unknown) {
 const rank=String(value || '').trim().replace(/\s*\(.*\)\s*$/,'').replace(/[.]/g,'').replace(/\s+/g,' ').toLowerCase();
 if(['lieutenant colonel','lt colonel','lt col'].includes(rank)) return 'Lt Colonel';
 if(rank==='armed officer') return 'Officer';
 return RANKS.find(item=>item.toLowerCase()===rank) || String(value || '').trim();
}
const rankLevel = (value: unknown) => {const index=RANKS.indexOf(normalizeRank(value));return index<0?999:index;};
function comparePersonnel(a: any,b: any) {
 const unit=(p: any)=>Number(p?.unit_number || p?.unitNumber)>0?Number(p.unit_number || p.unitNumber):999999;
 const name=(p: any)=>[p?.last_name || p?.lastName,p?.first_name || p?.firstName,p?.full_name,p?.email,p?.id].filter(Boolean).join(' ');
 return rankLevel(a?.rank)-rankLevel(b?.rank) || unit(a)-unit(b) || name(a).localeCompare(name(b));
}
const getPayRangeForRank = (rank: unknown) => PAY_RANGES[normalizeRank(rank)] || {min:18,max:20};
function nextUnitNumber(rank: unknown, users: any[] = [], excludedId = '') {
 const series=RANK_SERIES[normalizeRank(rank)];
 if(!series) return '';
 const used=new Set(users.filter(p=>p.id!==excludedId).map(p=>Number(p.unit_number)).filter(Number.isSafeInteger));
 for(let candidate=series.start;candidate<=series.end;candidate++) if(!used.has(candidate)) return String(candidate);
 throw new Error('No available unit numbers in the '+normalizeRank(rank)+' series');
}
function previewRankChange(original: any, rank: unknown, users: any[] = []) {
 const normalized=normalizeRank(rank);
 if(normalized===normalizeRank(original?.rank)) {
  const series=RANK_SERIES[normalized];
  const current=Number(original?.unit_number);
  const valid=!series || (Number.isSafeInteger(current) && current>=series.start && current<=series.end);
  return {rank:normalized,unit_number:valid ? original?.unit_number || '' : nextUnitNumber(normalized,users,original?.id),hourly_rate:original?.hourly_rate ?? getPayRangeForRank(normalized).min};
 }
 return {rank:normalized,unit_number:nextUnitNumber(normalized,users,original?.id),hourly_rate:PAY_RANGES[normalized]?.min ?? original?.hourly_rate ?? 18};
}

// Bundled personnel policy from base44/functions/updateUser/synchronizeOfficerIdentity.ts
async function synchronizeOfficerIdentity(entities: any, user: any) {
  const emails = [...new Set([user.email,user.work_email,user.pathfinder_email,...(user.email_aliases || [])].filter(Boolean).map((v: any) => String(v).trim().toLowerCase()))];
  const warnings: string[] = [];
  const identity = { rank: user.rank || '', unit_number: String(user.unit_number || '') };
  for (const [name,query] of [['OfficerRoster',{ email: { $in:emails } }],['ActiveOfficer',{ officer_email: { $in:emails } }],['Unit',{ user_id:user.id }]] as const) {
    try {
      const rows = await entities[name].filter(query, '-updated_date', 1000);
      for (const row of rows || []) {
        const fields = name === 'Unit' ? { unit_id:identity.unit_number, label:[identity.rank,user.last_name].filter(Boolean).join(' ') || user.full_name || user.email } : identity;
        const patch = Object.fromEntries(Object.entries(fields).filter(([key,value]) => String(row[key] ?? '') !== String(value)));
        if (Object.keys(patch).length) await entities[name].update(row.id, patch);
      }
    } catch (error: any) { warnings.push(name + ' identity sync needs retry.'); console.warn(name + ' identity sync failed',error?.message); }
  }
  return warnings;
}

// Bundled personnel policy from base44/functions/updateUser/notifyPlatoonChange.ts
async function notifyPlatoonChange(entities:any,before:any,after:any) {
 if(!after.email || (String(before.platoon||'')===String(after.platoon||'') && String(before.supervisor_id||'')===String(after.supervisor_id||'') && String(before.next_level_supervisor_id||'')===String(after.next_level_supervisor_id||'')))return;
 const event_key='platoon:'+after.id+':'+String(after.updated_date||new Date().toISOString())+':'+after.platoon+':'+after.supervisor_id;
 const existing=await entities.Notification.filter({event_key},'-created_date',1);
 if(existing.length)return;
 const command=after.supervisor_name||'Command staff';
 const message='Your platoon assignment has been updated from '+(before.platoon||'Unassigned')+' to Platoon '+(after.platoon||'Unassigned')+'. Your reporting command is '+command+'. Call and report to your new command for instructions.';
 await entities.Notification.create({recipient_email:after.email,type:'system_issue',title:'Platoon / command reassignment',message,related_id:after.id,priority:'high',is_read:false,requires_acknowledgment:true,source_name:'Platoon Command',event_key,announcement_text:message});
}

const trim=(value:any,max=160)=>String(value??'').trim().slice(0,max);
const fail=(error:string,status=400)=>Response.json({error},{status});
const name=(user:any)=>[user.first_name,user.last_name].filter(Boolean).join(' ').trim()||user.full_name||user.email||'Officer';
const isEmployee=(u:any)=>!!u&&!u.termination_date&&!['terminated','not_employee'].includes(trim(u.employment_status).toLowerCase())&&!['client','student','pending'].some(role=>(u.additional_roles||[]).includes(role)||[u.user_type,u.account_type,u.rank].some(v=>trim(v).toLowerCase()===role));
const supervisorRank=(rank:any)=>rankLevel(rank)<=rankLevel('Sergeant');
const E_TZ='America/New_York';
const easternNow=(date=new Date())=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:E_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const read=(name:string)=>Number(parts.find(part=>part.type===name)?.value||0);
 return {date:`${read('year')}-${String(read('month')).padStart(2,'0')}-${String(read('day')).padStart(2,'0')}`,hour:read('hour'),minute:read('minute')};
};
const PERMITTED_ROLES=['officer','supervisor','dispatch','cad_access','support','hr','trainer','full_access'];

const safeOfficer=(u:any)=>({id:u.id,name:name(u),rank:u.rank||'Officer',unit_number:u.unit_number||'',platoon:u.platoon||'',oversight_platoon:u.oversight_platoon||'',supervisor_id:u.supervisor_id||'',supervisor_name:u.supervisor_name||'',email:u.email||'',is_supervisor:!!u.is_supervisor,system_role:u.role||'user',additional_roles:Array.isArray(u.additional_roles)?u.additional_roles:[],profile_photo_url:u.profile_photo_url||''});
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
 const nextSystemRole=trim(input.system_role||officer.role||'user');
 if(!['admin','user'].includes(nextSystemRole))throw new Error('System role must be Administrator or Employee.');
 const nextRoles=Array.isArray(input.additional_roles)?[...new Set(input.additional_roles.map((role:any)=>trim(role).toLowerCase()))]:
   (officer.additional_roles||[]).map((role:any)=>trim(role).toLowerCase());
 const existingRoles=(officer.additional_roles||[]).map((role:any)=>trim(role).toLowerCase());
 if(nextRoles.some((role:string)=>!PERMITTED_ROLES.includes(role)&&!existingRoles.includes(role)))throw new Error('The selected account role is not supported for personnel promotions.');
 if(nextSystemRole==='admin'&&!nextRoles.includes('full_access'))nextRoles.push('full_access');
 if(supervisorRank(proposed)&&!nextRoles.includes('supervisor'))nextRoles.push('supervisor');
 const nextPhoto=trim(input.profile_photo_url,2000);
 if(nextPhoto&&!/^https:\/\//i.test(nextPhoto))throw new Error('The scheduled portrait must be an uploaded HTTPS image.');
 const effective=trim(input.effective_date,16);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(effective)||!Number.isFinite(Date.parse(effective+'T12:00:00Z')))
   throw new Error('Select a valid effective date.');
 const clock=easternNow();
 if(effective<clock.date||(effective===clock.date&&(clock.hour>10||(clock.hour===10&&clock.minute>=0))))
   throw new Error('The 10:00 a.m. Eastern effective time has already passed. Choose a future date.');
 const requestedPlatoon=trim(input.platoon)||trim(officer.platoon)||'Unassigned';
 const platoon=rankLevel(proposed)<=2?'Command':requestedPlatoon;
 if(!['A','B','Command','Unassigned'].includes(platoon))throw new Error('Platoon must be A, B, Command, or Unassigned.');
 if(rankLevel(proposed)>2&&platoon==='Command')throw new Error('Only Colonel, Lt Colonel and Major belong to Command platoon.');
 const oversight=rankLevel(proposed)<=2?trim(input.oversight_platoon||officer.oversight_platoon):'';
 if(rankLevel(proposed)<=2&&!['A','B'].includes(oversight))throw new Error('Command staff must select Platoon A or B to oversee.');
 const superId=trim(input.supervisor_id);
 const supervisor=superId?users.find(u=>u.id===superId):null;
 if(superId&&(!isEmployee(supervisor)||supervisor.id===officer.id||rankLevel(supervisor.rank)>=rankLevel(proposed)))throw new Error('Reporting supervisor must be a different active higher-ranking officer.');
 if(rankLevel(proposed)>2&&!supervisor)throw new Error('Select the higher-ranking command officer who will supervise this officer.');
 const transfer=Boolean(input.transfer_platoon);
 if(transfer&&!supervisorRank(proposed))throw new Error('Platoon command transfer requires Sergeant rank or higher.');
 if(transfer&&!['A','B'].includes(rankLevel(proposed)<=2?oversight:platoon))throw new Error('Choose Platoon A or B before transferring its chain of command.');
 const affectedPlatoon=rankLevel(proposed)<=2?oversight:platoon;
 const transfers=transfer?users.filter(u=>isEmployee(u)&&u.id!==officer.id&&u.platoon===affectedPlatoon&&rankLevel(u.rank)>rankLevel(proposed)&&u.supervisor_id!==officer.id):[];
 if(transfers.length>150)throw new Error('Command transfer exceeds 150 officers. Use platoon balance to resolve the roster first.');
 const rolesChanged=nextSystemRole!==trim(officer.role||'user')||
   [...nextRoles].sort().join('|')!==[...(officer.additional_roles||[])].map((v:any)=>trim(v).toLowerCase()).sort().join('|');
 const photoChanged=!!nextPhoto&&nextPhoto!==trim(officer.profile_photo_url,2000);
 const noChanges=!promoted&&!transfer&&oldRank===proposed&&trim(officer.supervisor_id)===superId&&trim(officer.platoon)===platoon&&trim(officer.oversight_platoon)===oversight&&!rolesChanged&&!photoChanged;
 const assignedUnit=nextUnitNumber(proposed,users,officer.id);
 const existingUnit=Number(officer.unit_number);
 const series=RANK_SERIES[proposed];
 const unit_number=(promoted||!Number.isSafeInteger(existingUnit)||existingUnit<series.start||existingUnit>series.end)?assignedUnit:trim(officer.unit_number);
 const pay=promoted?(PAY_RANGES[proposed]?.min ?? Number(officer.hourly_rate||0)):Number(officer.hourly_rate||0);
 const nextSupervisor=supervisor?users.find(u=>u.id===supervisor.supervisor_id):null;
 const updates:any={rank:proposed,unit_number,platoon,oversight_platoon:oversight,
  supervisor_id:supervisor?.id||'',supervisor_email:supervisor?.email||'',supervisor_name:supervisor?`${supervisor.rank||''} ${name(supervisor)}`.trim():'',
  next_level_supervisor_id:nextSupervisor?.id||'',next_level_supervisor_email:nextSupervisor?.email||'',next_level_supervisor_name:nextSupervisor?`${nextSupervisor.rank||''} ${name(nextSupervisor)}`.trim():'',
  is_supervisor:supervisorRank(proposed)||officer.is_supervisor===true};
 if(promoted)updates.hourly_rate=pay;
 updates.role=nextSystemRole;
 updates.additional_roles=nextRoles;
 updates.dispatch_role=nextRoles.includes('dispatch');
 updates.is_supervisor=nextRoles.includes('supervisor');
 if(photoChanged)updates.profile_photo_url=nextPhoto;
 const reason=trim(input.reason,800);
 return {officer,supervisor,updates,transfers,promoted,noChanges,rolesChanged,photoChanged,reason,effective_date:trim(input.effective_date,16)||new Date().toISOString().slice(0,10),
   preview:{officer:safeOfficer(officer),before:{rank:officer.rank,unit_number:officer.unit_number,platoon:officer.platoon,supervisor:officer.supervisor_name||''},
     after:{rank:proposed,unit_number,platoon,oversight_platoon:oversight,supervisor:updates.supervisor_name,pay_rate:pay,supervisor_role:updates.is_supervisor},
     no_changes:noChanges,effective_time:'10:00 AM America/New_York',system_role:nextSystemRole,
     additional_roles:nextRoles,profile_photo_url:photoChanged?nextPhoto:'',roles_changed:rolesChanged,photo_changed:photoChanged,
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
  if(action==='cancel'){
   const id=trim(input.event_id);if(!id)return fail('Scheduled promotion ID required');
   const event=await entities.PersonnelPromotion.get(id);
   if(!event)return fail('Scheduled personnel change not found',404);
   if(event.status!=='scheduled')return fail('This promotion is already processing or completed. It cannot be cancelled here.',409);
   await entities.PersonnelPromotion.update(event.id,{status:'cancelled',warnings:[`Cancelled by ${actor.email||actor.id} before effective date`],announcement_published:false});
   return Response.json({success:true,status:'cancelled',event_id:event.id});
  }
  if(action==='history'){
   const events=await entities.PersonnelPromotion.list('-created_date',50);
   return Response.json({events:(events||[]).map((event:any)=>({id:event.id,officer_name:event.officer_name,previous_rank:event.previous_rank,new_rank:event.new_rank,new_platoon:event.new_platoon,status:event.status,effective_at_eastern:event.effective_at_eastern,system_role:event.system_role,new_additional_roles:event.new_additional_roles,transfer_count:event.transfer_count,effective_date:event.effective_date,announcement_published:event.announcement_published,warnings:event.warnings,created_date:event.created_date}))});
  }
  const users=await entities.User.list('id',1500);
  if(users.length>=1500)return fail('Roster is too large for safe command assignment. Narrow user listing first.',409);
  if(action==='roster')return Response.json({officers:users.filter(isEmployee).filter(u=>RANKS.includes(normalizeRank(u.rank))).map(safeOfficer).sort((a:any,b:any)=>rankLevel(a.rank)-rankLevel(b.rank)||a.name.localeCompare(b.name)),ranks:RANKS});
  if(action!=='preview'&&action!=='apply')return fail('Unsupported promotion action');
  let plan;
  try{plan=changePlan(users,input);}catch(error:any){return fail(error.message||'Invalid command promotion');}
  const current=await version(users);
  if(action==='preview')return Response.json({preview:plan.preview,version:current});
  if(plan.noChanges)return fail('Select a different rank, platoon supervisor, or a change-of-command transfer before approving. This officer already has the requested assignment.',400);
  const existingScheduled=await entities.PersonnelPromotion.filter({officer_id:plan.officer.id},'-created_date',30);
  if((existingScheduled||[]).some((event:any)=>event.status==='scheduled'))return fail('This officer already has a scheduled promotion. Cancel or complete that event before scheduling another.',409);
  if(input.version!==current)return fail('Personnel changed since preview. Review the updated roster before approving.',409);
  if(input.confirm!==true)return fail('Explicit command approval is required.',400);
  const requestId=trim(input.request_id,80);
  if(!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))return fail('A valid idempotent command request ID is required.',400);
  const prior=await entities.PersonnelPromotion.filter({request_id:requestId},'-created_date',1);
  if(prior.length)return Response.json({success:['scheduled','complete'].includes(prior[0].status),scheduled:prior[0].status==='scheduled',already_processed:true,event_id:prior[0].id,status:prior[0].status,announcement_published:prior[0].announcement_published,warnings:prior[0].warnings||[]});
  const event=await entities.PersonnelPromotion.create({
    request_id:requestId,officer_id:plan.officer.id,officer_email:plan.officer.email,officer_name:name(plan.officer),
    previous_rank:plan.officer.rank,new_rank:plan.updates.rank,previous_unit:trim(plan.officer.unit_number),new_unit:plan.updates.unit_number,
    previous_platoon:plan.officer.platoon||'',new_platoon:plan.updates.platoon,oversight_platoon:plan.updates.oversight_platoon,
    previous_supervisor:plan.officer.supervisor_name||'',new_supervisor:plan.updates.supervisor_name,new_supervisor_id:plan.updates.supervisor_id,
    transfer_count:plan.transfers.length,transfer_ids:[],planned_transfers:plan.transfers.map((u:any)=>u.id),
    planned_patch:plan.updates,new_additional_roles:plan.updates.additional_roles,system_role:plan.updates.role,
    new_profile_photo_url:plan.updates.profile_photo_url||'',effective_date:plan.effective_date,
    effective_at_eastern:`${plan.effective_date} 10:00 America/New_York`,reason:plan.reason,
    status:'scheduled',announcement_published:false,requested_by:actor.email||actor.id,approved_by:actor.email||actor.id,
    approved_at:new Date().toISOString(),warnings:[]
  });
  // Absolutely no User/Unit/CAD/Announcement/Notification mutation here.
  // A scheduled server automation verifies the 10:00 AM America/New_York
  // boundary and performs the changes at the effective date.
  return Response.json({success:true,scheduled:true,event_id:event.id,status:'scheduled',
    effective_at_eastern:`${plan.effective_date} 10:00 AM America/New_York`,
    announcement_published:false,transferred:0});
 }catch(error:any){console.error('Promotion request unavailable',error?.message||'Unknown error');return fail('Promotion request could not be completed',503);}
});
