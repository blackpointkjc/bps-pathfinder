import { createClientFromRequest } from 'npm:@base44/sdk';
// Authenticated, server-side platoon/region/division/substation report reads.
const n=(v:any)=>String(v??'').trim().toLowerCase();
const role=(u:any)=>new Set([u.role,...(u.additional_roles||[])].map(n));
const admin=(u:any)=>role(u).has('admin')||role(u).has('full_access');
const senior=(u:any)=>['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(n(u.rank));
const rankOrder=['colonel','lt colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'];
const level=(value:any)=>{const raw=n(value).replace(/[.]/g,'');return rankOrder.indexOf(raw==='lieutenant colonel'||raw==='lt col'?'lt colonel':raw);};
const lowerRank=(me:any,p:any)=>level(me.rank)>=0&&level(p.rank)>level(me.rank);
const area=(me:any,p:any,hasPlatoon=true)=>admin(me)||(
  (hasPlatoon?lowerRank(me,p):true)
  &&(!hasPlatoon||(!!n(me.oversight_platoon||me.platoon)&&n(me.oversight_platoon||me.platoon)!=='command'&&n(p.platoon)===n(me.oversight_platoon||me.platoon)))
  &&!!n(me.division)&&!!n(me.subdivision)&&n(p.division)===n(me.division)&&n(p.subdivision)===n(me.subdivision)
  &&(senior(me)|| (!!n(me.substation)&&n(p.substation)===n(me.substation)))
);
const commandName=(p:any)=>[p.rank,p.last_name||p.first_name].filter(Boolean).join(' ');
const isAbsent=(p:any)=>{
 const now=Date.now();
 const windows=[...(Array.isArray(p.approved_leave_windows)?p.approved_leave_windows:[]),...(p.out_of_office&&p.out_of_office_start&&p.out_of_office_return?[{start:p.out_of_office_start,end:p.out_of_office_return}]:[])];
 return windows.some((w:any)=>Number.isFinite(Date.parse(w.start))&&Number.isFinite(Date.parse(w.end))&&Date.parse(w.start)<=now&&Date.parse(w.end)>now);
};
// One regional Platoon has one active commander. Exclude Colonel/Lt Colonel/
// Major company command entirely. Highest operational rank wins; badge number
// breaks same-rank ties, followed by unit number for stable selection.
const activePlatoonCommand=(people:any[],platoon:string,region:string)=>{
 const eligible=people.filter((p:any)=>!p.termination_date&&n(p.employment_status)!=='terminated'
   && !isAbsent(p)&&n(p.division)===n(region)&&n(p.platoon)===n(platoon)
   && level(p.rank)>=3&&level(p.rank)<999);
 const badge=(p:any)=>{const value=Number(p.badge_number);return Number.isSafeInteger(value)&&value>0?value:Number.MAX_SAFE_INTEGER;};
 const unit=(p:any)=>{const value=Number(p.unit_number);return Number.isSafeInteger(value)&&value>0?value:Number.MAX_SAFE_INTEGER;};
 eligible.sort((a:any,b:any)=>level(a.rank)-level(b.rank)||badge(a)-badge(b)||unit(a)-unit(b)||String(a.id).localeCompare(String(b.id)));
 const chosen=eligible[0];
 if(!chosen)return {platoon,region,status:'unassigned',name:'No active platoon leader',role:'Platoon Command Vacant'};
 const acting=level(chosen.rank)!==3;
 return {id:chosen.id,platoon,region,status:acting?'acting':'active',name:commandName(chosen),first_name:chosen.first_name||'',last_name:chosen.last_name||'',role:acting?'Acting Platoon Commander':'Platoon Commander',rank:chosen.rank,badge_number:chosen.badge_number||'',unit_number:chosen.unit_number||'',profile_photo_url:String(chosen.profile_photo_url||'').length<=150000?chosen.profile_photo_url||'':'',work_email:chosen.work_email||chosen.email||'',mobile_phone:chosen.mobile_phone||'',subdivision:chosen.subdivision||'',substation:chosen.substation||'',assigned_site_name:chosen.assigned_site_name||''};
};

const entities:any={inspections:'InspectionReport',writeups:'WriteUpReport',force:'UseOfForceReport',callouts:'CallOut',handovers:'SupervisorShiftHandover',duty:'DutySupervisorAssignment',chat:'SupervisorChatMessage'};
Deno.serve(async(req)=>{
 try{
  const sdk=createClientFromRequest(req),me=await sdk.auth.me().catch(()=>null);
  if(!me)return Response.json({error:'Sign in required'},{status:401});
  if(!admin(me)&&!role(me).has('supervisor')&&me.is_supervisor!==true&&!['corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(n(me.rank)))return Response.json({error:'Supervisor access required'},{status:403});
  const body=await req.json().catch(()=>({})),kind=n(body.kind),entity=entities[kind];
  if(kind==='portrait'){
    const photoId=String(body.id||'');
    if(!photoId)return Response.json({error:'Officer ID required'},{status:400});
    const subject=await sdk.asServiceRole.entities.User.get(photoId);
    if(!subject)return Response.json({error:'Officer not found'},{status:404});
    const samePlatoon=n(me.division)===n(subject.division)&&n(me.oversight_platoon||me.platoon)===n(subject.platoon);
    if(!admin(me) && String(me.id)!==photoId && !samePlatoon && !area(me,subject))
      return Response.json({error:'Officer portrait is outside your authorized platoon'},{status:403});
    return Response.json({success:true,id:subject.id,photo_url:subject.profile_photo_original_url||subject.profile_photo_url||''});
  }
  if(!entity && kind!=='personnel')return Response.json({error:'Unknown supervisor record type'},{status:400});
  if(kind==='personnel'){
    // Fast path: do not fetch every client Location or report collection. Do
    // not return large original photos for every officer. A single dedicated
    // snapshot replaces 3-4 competing requests during Rank Structure startup.
    const [roster,configured]=await Promise.all([
      sdk.asServiceRole.entities.User.list('last_name',500),
      sdk.asServiceRole.entities.CompanyPlatoon.list('region',100).catch(()=>[]),
    ]);
    const staff=(roster||[]).filter((p:any)=>!p.termination_date&&n(p.employment_status)!=='terminated');
    const allowed=staff.filter((p:any)=>area(me,p));
    const entries=new Map<string,{region:string,platoon:string}>();
    for(const p of configured||[]){if(p.active!==false&&p.region&&p.name)entries.set(`${n(p.region)}|${n(p.name)}`,{region:p.region,platoon:p.name});}
    for(const p of staff){if(p.division&&p.platoon&&n(p.platoon)!=='command')entries.set(`${n(p.division)}|${n(p.platoon)}`,{region:p.division,platoon:p.platoon});}
    const visible=[...entries.values()].filter(p=>admin(me)||(n(p.region)===n(me.division)&&n(p.platoon)===n(me.oversight_platoon||me.platoon)));
    const commands=visible.map(p=>activePlatoonCommand(staff,p.platoon,p.region));
    const company=admin(me)?staff.filter((p:any)=>level(p.rank)>=0&&level(p.rank)<=2):[];
    const selected=[...new Map([...allowed,...company].map((p:any)=>[String(p.id),p])).values()];
    const officers=selected.map((p:any)=>({id:p.id,email:p.email,first_name:p.first_name||'',last_name:p.last_name||'',rank:p.rank,platoon:p.platoon||'',division:p.division||'',subdivision:p.subdivision||'',substation:p.substation||'',badge_number:p.badge_number||'',unit_number:p.unit_number||'',work_email:p.work_email||p.email||'',mobile_phone:p.mobile_phone||'',assigned_location:p.assigned_location||'',assigned_site_name:p.assigned_site_name||'',supervisor_id:p.supervisor_id||'',employment_status:p.employment_status||'active',profile_photo_url:String(p.profile_photo_url||'').length<=150000?p.profile_photo_url||'':''}));
    return Response.json({success:true,officers,platoon_commands:commands,platoons:visible,regions:[...new Set(visible.map(p=>p.region))]});
  }
  const [users,sites,rows]=await Promise.all([
   sdk.asServiceRole.entities.User.list('last_name',1000),
   sdk.asServiceRole.entities.Location.list('site_name',1000),
   kind==='personnel'?Promise.resolve([]):sdk.asServiceRole.entities[entity].list('-created_date',kind==='duty'?1200:kind==='callouts'?1000:500),
  ]);
  // Some historic officers are linked to a managed client site but never had
  // the new Substation field populated. Resolve *missing* organizational
  // fields from that exact site, then enforce the same supervisor restrictions.
  // This does not authorize unassigned supervisors or cross-platoon personnel.
  const sitesByName=new Map((sites||[]).filter((site:any)=>site.site_name).map((site:any)=>[n(site.site_name),site]));
  const resolvedUsers=(users||[]).map((p:any)=>{
   const references=[p.assigned_location,...(Array.isArray(p.assigned_locations)?p.assigned_locations:[]),...(Array.isArray(p.assigned_sites)?p.assigned_sites:[])].filter(Boolean);
   const match=references.map((value:any)=>sitesByName.get(n(String(value).split(':')[0]))).find(Boolean);
   if(!match)return p;
   return {...p,division:p.division||match.division,subdivision:p.subdivision||match.subdivision,substation:p.substation||match.substation,assigned_site_name:match.site_name};
  });
  const people=resolvedUsers.filter((p:any)=>area(me,p)&&!p.termination_date&&n(p.employment_status)!=='terminated');
  const configuredPlatoons=kind==='personnel'?await sdk.asServiceRole.entities.CompanyPlatoon.list('region',1000).catch(()=>[]):[];
  const personPlatoons=resolvedUsers.filter((p:any)=>p.platoon&&p.platoon!=='Command'&&p.division).map((p:any)=>({name:String(p.platoon),region:String(p.division)}));
  const allRegionPlatoons=[...configuredPlatoons.filter((p:any)=>p.active!==false),...personPlatoons];
  const regionPlatoonKeys=new Map(allRegionPlatoons.filter((p:any)=>p.region&&p.name).map((p:any)=>[`${n(p.region)}|${n(p.name)}`,{region:p.region,platoon:p.name}]));
  const visibleCommands=[...regionPlatoonKeys.values()].filter((entry:any)=>admin(me)||(n(entry.region)===n(me.division)&&n(entry.platoon)===n(me.oversight_platoon||me.platoon)));
  const platoon_commands=kind==='personnel'?visibleCommands.map((entry:any)=>activePlatoonCommand(resolvedUsers,entry.platoon,entry.region)):[];
  const locations=(sites||[]).filter((p:any)=>p.active!==false&&area(me,p,false));
  const emails=new Set(people.flatMap((p:any)=>[p.email,p.work_email,p.pathfinder_email,p.microsoft_email,p.outlook_email,...(p.email_aliases||[])].map(n).filter(Boolean)));
  const ids=new Set(people.map((p:any)=>String(p.id)));
  const visible=(r:any)=>{
   if(admin(me))return true;
   if(kind==='chat')return emails.has(n(r.sender_email))||n(r.sender_email)===n(me.email);
   if(kind==='handovers')return [r.departing_supervisor_email,r.incoming_supervisor_email].some(v=>emails.has(n(v))||n(v)===n(me.email));
   if(kind==='duty')return emails.has(n(r.supervisor_email))||n(r.supervisor_email)===n(me.email);
   const email=n(r.officer_email||r.employee_email),id=String(r.officer_id||r.employee_id||'');
   return (email&&emails.has(email))||(id&&ids.has(id));
  };
  const action=n(body.action||'list');
  if(action!=='list'){
   if(kind==='handovers' && ['create','acknowledge'].includes(action)){
     if(action==='create'){
       const data=body.data||{};
       const recipient=people.find((p:any)=>n(p.email)===n(data.incoming_supervisor_email));
       if(!recipient && !admin(me))return Response.json({error:'Incoming supervisor is outside your platoon and operating area'},{status:403});
       if(!String(data.command_summary||'').trim())return Response.json({error:'Command summary required'},{status:400});
       const record=await sdk.asServiceRole.entities.SupervisorShiftHandover.create({...data,departing_supervisor_email:me.email,departing_supervisor_name:[me.rank,me.last_name].filter(Boolean).join(' '),incoming_supervisor_name:recipient?[recipient.rank,recipient.last_name].filter(Boolean).join(' '):String(data.incoming_supervisor_name||''),acknowledged_by_incoming:false});
       return Response.json({success:true,record});
     }
     const record=await sdk.asServiceRole.entities.SupervisorShiftHandover.get(String(body.id||''));
     if(!record||n(record.incoming_supervisor_email)!==n(me.email))return Response.json({error:'Only the designated incoming supervisor may acknowledge this handover'},{status:403});
     const updated=await sdk.asServiceRole.entities.SupervisorShiftHandover.update(record.id,{acknowledged_by_incoming:true,acknowledgement_time:new Date().toISOString()});
     return Response.json({success:true,record:updated});
   }
   if(kind==='chat'&&action==='create'){
     const message=String(body.data?.message||'').trim().slice(0,4000);
     if(!message)return Response.json({error:'Message cannot be empty'},{status:400});
     const record=await sdk.asServiceRole.entities.SupervisorChatMessage.create({message,sender_name:[me.first_name,me.last_name].filter(Boolean).join(' ')||me.email,sender_email:me.email,sender_photo_url:me.profile_photo_url||'',message_source:'pathfinder'});
     for(const mention of (Array.isArray(body.mentions)?body.mentions:[]).slice(0,20)){
       const email=n(mention.email);
       if(!email || !people.some((p:any)=>n(p.email)===email))continue;
       await sdk.asServiceRole.entities.ChatMention.create({message_id:record.id,chat_type:'supervisor',page:'SupervisorChat',recipient_email:email,recipient_name:String(mention.label||''),sender_name:record.sender_name,message,read:false}).catch(()=>null);
     }
     return Response.json({success:true,record});
   }
   if(!['inspections','writeups','force'].includes(kind)||!['create','update','delete'].includes(action))
     return Response.json({error:'Unsupported supervisor record action'},{status:400});
   if(action==='delete'&&kind!=='force')return Response.json({error:'Deletion is not supported for these reports'},{status:403});
   const id=String(body.id||''),data=body.data||{};
   if(action!=='create'&&!id)return Response.json({error:'Record ID required'},{status:400});
   const existing=action==='create'?null:await sdk.asServiceRole.entities[entity].get(id);
   if(action!=='create'&&(!existing||!visible(existing)))return Response.json({error:'Record is outside your assigned platoon and area'},{status:403});
   const sourceEmail=n(data.officer_email||existing?.officer_email);
   const target=people.find((p:any)=>[p.email,p.work_email,p.pathfinder_email,p.microsoft_email,p.outlook_email,...(p.email_aliases||[])].map(n).includes(sourceEmail));
   if(!admin(me)&&(!target||!sourceEmail))return Response.json({error:'Select an officer in your assigned platoon and area'},{status:403});
   if(!admin(me)&&action!=='create'&&n(data.officer_email)!==n(existing.officer_email))
     return Response.json({error:'The officer on an existing report cannot be reassigned'},{status:403});
   let result:any;
   if(action==='delete'){await sdk.asServiceRole.entities[entity].delete(id);result={id,deleted:true};}
   else if(action==='create')result=await sdk.asServiceRole.entities[entity].create(data);
   else result=await sdk.asServiceRole.entities[entity].update(id,data);
   await sdk.asServiceRole.entities.AuditLog.create({entity_type:entity,entity_id:String(result?.id||id),action,actor_id:String(me.id),actor_name:String(me.email||''),timestamp:new Date().toISOString(),description:`Scoped supervisor ${action}: ${kind}`}).catch(()=>null);
   return Response.json({success:true,record:result});
  }
  return Response.json({success:true,platoon_commands:kind==='personnel'?platoon_commands:undefined,rows:(rows||[]).filter(visible),officers:people.map((p:any)=>({id:p.id,email:p.email,first_name:p.first_name,last_name:p.last_name,rank:p.rank,full_name:p.full_name,profile_photo_url:p.profile_photo_original_url||p.profile_photo_url||'',mobile_phone:p.mobile_phone||'',work_email:p.work_email||p.email,assigned_site_name:p.assigned_site_name||'',assigned_location:p.assigned_location||'',assigned_locations:p.assigned_locations||[],assigned_sites:p.assigned_sites||[],platoon:p.platoon,oversight_platoon:p.oversight_platoon,role:p.role,is_supervisor:p.is_supervisor,additional_roles:p.additional_roles||[],
        termination_date:p.termination_date||'',user_type:p.user_type||'',account_type:p.account_type||'',
        platoon:p.platoon,division:p.division,subdivision:p.subdivision,substation:p.substation,unit_number:p.unit_number})),locations:locations.map((p:any)=>({id:p.id,site_name:p.site_name,division:p.division,subdivision:p.subdivision,substation:p.substation}))});
 }catch(error:any){console.error('Scoped supervisor records failed',error);return Response.json({error:'Unable to load supervisor records safely; retry.'},{status:503});}
});
