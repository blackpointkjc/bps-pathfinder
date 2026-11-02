const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import {createClientFromRequest} from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const text=(v:any,max=160)=>String(v??'').trim().slice(0,max);
const names=(u:any)=>[u.first_name,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email||'Officer';
const easternNow=(date=new Date())=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const n=(k:string)=>Number(p.find(i=>i.type===k)?.value||0);
 return {date:`${n('year')}-${String(n('month')).padStart(2,'0')}-${String(n('day')).padStart(2,'0')}`,hour:n('hour'),minute:n('minute')};
};
const due=(event:any,clock:any)=>Boolean(event?.effective_date&&
 (event.effective_date<clock.date || (event.effective_date===clock.date&&clock.hour>=10)));
const isActive=(user:any)=>user&&!user.termination_date&&!['terminated','not_employee'].includes(text(user.employment_status).toLowerCase())&&user.user_type!=='client'&&!(user.additional_roles||[]).includes('client');
const fail=(message:string,code=400)=>Response.json({error:message},{status:code});
async function runOne(entities:any,event:any,clock:any){
 if(event.status!=='scheduled'||!due(event,clock))return {skipped:true};
 const token=crypto.randomUUID();
 // Claim before any user record changes. A failed/partial event is held for
 // an administrator to reconcile; never publish an unverified promotion.
 await entities.PersonnelPromotion.update(event.id,{status:'processing',processing_token:token,warnings:[]});
 const claimed=await entities.PersonnelPromotion.get(event.id);
 if(claimed?.processing_token!==token||claimed.status!=='processing')return {skipped:true,reason:'another processor claimed event'};
 let changed=0;
 const warnings:string[]=[];
 try{
  const user=await entities.User.get(event.officer_id);
  if(!isActive(user))throw Error('Scheduled officer account is no longer active');
  if(String(user.rank||'')!==String(event.previous_rank||''))throw Error('Rank has changed since the promotion was approved; administrator reconciliation required');
  const patch=event.planned_patch||{};
  if(!patch.rank||!Array.isArray(patch.additional_roles)||!['admin','user'].includes(patch.role))throw Error('Scheduled personnel change is missing its approved role/rank snapshot');
  if(patch.additional_roles.includes('full_access')&&user.id!=='6ae7d733d4b1a647cd3e6f38')throw Error('Full Access is reserved for Colonel Hiers; reschedule this change with corrected roles');
  // Recheck direct supervisor still active, but no authorization elevation before this point.
  if(patch.supervisor_id){const supervisor=await entities.User.get(patch.supervisor_id);if(!isActive(supervisor))throw Error('Reporting supervisor is no longer an active employee');}
  await entities.User.update(user.id,patch);
  const after=await entities.User.get(user.id);
  const check=['rank','unit_number','platoon','supervisor_id','role','profile_photo_url','profile_photo_original_url'];
  if(check.some(key=>patch[key]!==undefined&&String(after[key]??'')!==String(patch[key]??'')))throw Error('Updated officer rank, access, photo or command could not be verified');
  if(!patch.additional_roles.every((role:string)=>(after.additional_roles||[]).includes(role)))throw Error('Scheduled access roles did not all persist');
  changed++;
  // Synchronize the actual rank and newly effective portrait across the CAD
  // identity/roster collections. Never do this at the time of scheduling.
  const emailList=[...new Set([after.email,after.work_email,after.pathfinder_email,...(after.email_aliases||[])].filter(Boolean))];
  for(const collection of ['OfficerRoster','ActiveOfficer','Unit']){
   try{
    const query=collection==='OfficerRoster'?{email:{$in:emailList}}:
      collection==='ActiveOfficer'?{officer_email:{$in:emailList}}:{user_id:after.id};
    const records=await entities[collection].filter(query,'-updated_date',250);
    for(const row of records||[]){
      const identity=collection==='Unit'?{unit_id:String(after.unit_number||''),label:`${after.rank} ${after.last_name||''}`.trim()}:
        {rank:after.rank,unit_number:String(after.unit_number||''),...(patch.profile_photo_url?{profile_photo_url:patch.profile_photo_url}:{})};
      if(Object.keys(identity).some(key=>String(row[key]??'')!==String(identity[key]??'')))await entities[collection].update(row.id,identity);
    }
   }catch(error:any){warnings.push(collection+' roster/photo synchronization needs review: '+text(error.message));}
  }
  // Reassignment and notifications happen ONLY after the officer's effective update.
  for(const subordinateId of event.planned_transfers||[]){
   const member=await entities.User.get(subordinateId);
   if(!isActive(member)||member.platoon!==(event.oversight_platoon||event.new_platoon)){
    warnings.push('Subordinate '+subordinateId+' is no longer eligible for command transfer');continue;
   }
   await entities.User.update(member.id,{supervisor_id:after.id,supervisor_email:after.email,
     supervisor_name:`${after.rank} ${names(after)}`,next_level_supervisor_id:patch.supervisor_id||'',
     next_level_supervisor_email:patch.supervisor_email||'',next_level_supervisor_name:patch.supervisor_name||''});
   changed++;
   try{await entities.Notification.create({recipient_email:member.email,title:'New Platoon Command',message:`Your new reporting officer is ${after.rank} ${names(after)}. Check your assignment in Pathfinder.`,type:'system_issue',priority:'high',requires_acknowledgment:true,is_read:false,event_key:'promotion-transfer:'+event.id+':'+member.id});}catch(e:any){warnings.push('Subordinate notification pending: '+e.message);}
  }
  const email=after.email||event.officer_email;
  try{await entities.Notification.create({recipient_email:email,title:'Personnel Promotion Effective',message:`Your personnel change is now effective: ${event.new_rank}, unit ${event.new_unit}. Please review your assignment.`,type:'system_issue',priority:'high',requires_acknowledgment:true,is_read:false,event_key:'promotion-effective:'+event.id});}catch(e:any){warnings.push('Officer notification pending: '+e.message);}
  const title=event.previous_rank===event.new_rank?'🎖️ OFFICIAL CHANGE OF COMMAND':'🎖️ OFFICIAL PERSONNEL PROMOTION & CHANGE OF COMMAND';
  const message=`BLACK POINT PROTECTION — OFFICIAL COMMAND ANNOUNCEMENT\n\n${event.officer_name} has ${event.previous_rank===event.new_rank?'received an updated command assignment':`been promoted from ${event.previous_rank} to ${event.new_rank}`} effective ${event.effective_date} at 10:00 AM Eastern.\nNew unit number: ${event.new_unit}.\nPlatoon assignment: ${event.oversight_platoon||event.new_platoon}.\nReporting command: ${event.new_supervisor||'Company Command'}.\n${changed>1?`${changed-1} officer(s) reassigned under new command.\n`:''}${event.reason?'Official remarks: '+event.reason+'\n':''}All affected personnel should review their updated chain of command in Pathfinder.`;
  const publication_key='promotion:'+event.id;
  const existing=await entities.Announcement.filter({publication_key},'-created_date',1);
  const notice=existing[0]||await entities.Announcement.create({title,message,audience:'company',priority:'urgent',publication_key,photo_url:event.new_profile_photo_url||'',pinged_users:[email],read_by:[]});
  await entities.PersonnelPromotion.update(event.id,{status:'complete',announcement_id:notice.id,announcement_published:true,processed_at:new Date().toISOString(),applied_at:new Date().toISOString(),transfer_count:changed-1,warnings});
  return {completed:true,event_id:event.id,changed,announcement_id:notice.id,warnings};
 }catch(e:any){warnings.push(text(e.message,400));
  await entities.PersonnelPromotion.update(event.id,{status:'partial',warnings,announcement_published:false,processed_at:new Date().toISOString()}).catch(()=>{});
  console.error('Scheduled promotion needs admin reconciliation',event.id,text(e.message));
  return {completed:false,event_id:event.id,changed,warnings};
 }
}
Deno.serve(async req=>{
 try{
  const sdk=createClientFromRequest(req),body=await req.json().catch(()=>({}));
 const __portalCaller=await sdk.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,sdk,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await sdk.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||__portalCaller.termination_date||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 sdk.auth.me=async()=>__portalCaller;

  const actor=await sdk.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
  const roleSet=new Set([actor?.role,...(actor?.additional_roles||[])].map((r:any)=>text(r).toLowerCase()));
  // The recurring automation has no interactive account. A manual call needs
  // actual administrator authorization. A spoofed scheduled=true flag cannot
  // activate anything before the Eastern 10 AM server-side boundary.
  if(actor&&!roleSet.has('admin')&&!roleSet.has('full_access'))return fail('Administrator access required',403);
  if(!actor&&body.scheduled!==true)return fail('Scheduled execution or admin authorization required',403);
  const clock=easternNow();
  if(clock.hour<10)return Response.json({success:true,deferred:true,reason:'It is before 10 AM Eastern',checked_at:clock});
  const entities=sdk.asServiceRole.entities;
  const scheduled=await entities.PersonnelPromotion.filter({status:'scheduled'},'effective_date',80);
  const results=[];
  for(const item of scheduled){if(!due(item,clock))continue;
   results.push(await runOne(entities,item,clock));if(results.length>=8)break;
  }
  return Response.json({success:true,checked_at:clock,processed:results.length,results});
 }catch(e:any){console.error('Scheduled promotion worker error',text(e.message));return fail('Scheduled promotions could not be processed',503);}
});
