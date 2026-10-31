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
const entities:any={inspections:'InspectionReport',writeups:'WriteUpReport',force:'UseOfForceReport',callouts:'CallOut',handovers:'SupervisorShiftHandover',duty:'DutySupervisorAssignment'};
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
   if(kind==='handovers')return [r.departing_supervisor_email,r.incoming_supervisor_email].some(v=>emails.has(n(v))||n(v)===n(me.email));
   if(kind==='duty')return emails.has(n(r.supervisor_email))||n(r.supervisor_email)===n(me.email);
   const email=n(r.officer_email||r.employee_email),id=String(r.officer_id||r.employee_id||'');
   return (email&&emails.has(email))||(id&&ids.has(id));
  };
  return Response.json({success:true,rows:(rows||[]).filter(visible),officers:people.map((p:any)=>({id:p.id,email:p.email,first_name:p.first_name,last_name:p.last_name,rank:p.rank,platoon:p.platoon,division:p.division,subdivision:p.subdivision,substation:p.substation,unit_number:p.unit_number})),locations:locations.map((p:any)=>({id:p.id,site_name:p.site_name,division:p.division,subdivision:p.subdivision,substation:p.substation}))});
 }catch(error:any){console.error('Scoped supervisor records failed',error);return Response.json({error:'Unable to load supervisor records safely; retry.'},{status:503});}
});
