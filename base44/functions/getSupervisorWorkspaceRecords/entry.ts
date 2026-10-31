import { createClientFromRequest } from 'npm:@base44/sdk';
// Authenticated, server-side platoon/region/division/substation report reads.
const n=(v:any)=>String(v??'').trim().toLowerCase();
const role=(u:any)=>new Set([u.role,...(u.additional_roles||[])].map(n));
const admin=(u:any)=>role(u).has('admin')||role(u).has('full_access');
const senior=(u:any)=>['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant'].includes(n(u.rank));
const area=(me:any,p:any,hasPlatoon=true)=>admin(me)||(
  (!hasPlatoon||(['a','b'].includes(n(me.oversight_platoon||me.platoon))&&n(p.platoon)===n(me.oversight_platoon||me.platoon)))
  &&!!n(me.division)&&!!n(me.subdivision)&&n(p.division)===n(me.division)&&n(p.subdivision)===n(me.subdivision)
  &&(senior(me)|| (!!n(me.substation)&&n(p.substation)===n(me.substation)))
);
const entities:any={inspections:'InspectionReport',writeups:'WriteUpReport',force:'UseOfForceReport',callouts:'CallOut',handovers:'SupervisorShiftHandover',duty:'DutySupervisorAssignment',chat:'SupervisorChatMessage'};
Deno.serve(async(req)=>{
 try{
  const sdk=createClientFromRequest(req),me=await sdk.auth.me().catch(()=>null);
  if(!me)return Response.json({error:'Sign in required'},{status:401});
  if(!admin(me)&&!role(me).has('supervisor')&&me.is_supervisor!==true&&!['corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(n(me.rank)))return Response.json({error:'Supervisor access required'},{status:403});
  const body=await req.json().catch(()=>({})),kind=n(body.kind),entity=entities[kind];
  if(!entity)return Response.json({error:'Unknown supervisor record type'},{status:400});
  const [users,sites,rows]=await Promise.all([
   sdk.asServiceRole.entities.User.list('last_name',1000),
   sdk.asServiceRole.entities.Location.list('site_name',1000),
   sdk.asServiceRole.entities[entity].list('-created_date',kind==='duty'?1200:kind==='callouts'?1000:500),
  ]);
  const people=(users||[]).filter((p:any)=>area(me,p)&&!p.termination_date&&n(p.employment_status)!=='terminated');
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
  return Response.json({success:true,rows:(rows||[]).filter(visible),officers:people.map((p:any)=>({id:p.id,email:p.email,first_name:p.first_name,last_name:p.last_name,rank:p.rank,role:p.role,is_supervisor:p.is_supervisor,additional_roles:p.additional_roles||[],
        termination_date:p.termination_date||'',user_type:p.user_type||'',account_type:p.account_type||'',
        platoon:p.platoon,division:p.division,subdivision:p.subdivision,substation:p.substation,unit_number:p.unit_number})),locations:locations.map((p:any)=>({id:p.id,site_name:p.site_name,division:p.division,subdivision:p.subdivision,substation:p.substation}))});
 }catch(error:any){console.error('Scoped supervisor records failed',error);return Response.json({error:'Unable to load supervisor records safely; retry.'},{status:503});}
});
