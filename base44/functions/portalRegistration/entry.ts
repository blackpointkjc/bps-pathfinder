import {createClientFromRequest} from 'npm:@base44/sdk';
const clean=(v,n=250)=>String(v??'').trim().slice(0,n);
const requestedTypes=['employee','student','visitor','client'];
export default async function(req){
 try{
 const base44=createClientFromRequest(req),db=base44.asServiceRole.entities;
 const me=await base44.auth.me().catch(()=>null);
 if(!me?.id||me.disabled||me.termination_date)return Response.json({error:'Sign in required'},{status:401});
 const body=await req.json();
 const assigned=me.role==='admin'||(me.additional_roles||[]).length>0;
 if(body.action==='profile'){
  const existing=await db.PortalRegistration.filter({user_id:me.id},'-created_date',1);
  const invites=await db.PortalInvitation.filter({email:String(me.email).toLowerCase()},'-created_date',1);
  const invitation=invites[0];
  if(!assigned){
   const p=invitation?.profile||{};
   const first=clean(p.first_name||body.first_name),last=clean(p.last_name||body.last_name);
   if(!first||!last)return Response.json({needs_profile:true});
   const type=invitation?.account_type||body.requested_type||'employee';
   if(!requestedTypes.includes(type))return Response.json({error:'Choose a valid account type'},{status:400});
   const patch={first_name:first,last_name:last,full_name:first+' '+last};
   if(!me.rank||['Pending Assignment','Visitor Pending'].includes(me.rank))patch.rank=type==='student'?'Student Registration Pending':type==='visitor'?'Visitor Pending':'Pending Assignment';
   for(const key of ['mobile_phone','date_of_birth'])if(p[key])patch[key]=clean(p[key]);
   await db.User.update(me.id,patch);
   if(!existing.length)await db.PortalRegistration.create({user_id:me.id,email:me.email,requested_type:type,submitted_at:new Date().toISOString()});
   if(type==='student'){
    const enrollments=await db.StudentEnrollment.filter({email:me.email},'-created_date',1);
    if(!enrollments.length)await db.StudentEnrollment.create({email:me.email,user_id:me.id,first_name:first,last_name:last,date_of_birth:clean(p.date_of_birth),status:'invited',invited_by:invitation?.invited_by||'self-registration'});
   }
   if(invitation)await db.PortalInvitation.update(invitation.id,{status:'registered'});
  }
  return Response.json({success:true,pending:!assigned,requested_type:existing[0]?.requested_type||invitation?.account_type||body.requested_type||'employee'});
 }
 return Response.json({error:'Unknown action'},{status:400});
 }catch{return Response.json({error:'Unable to save registration. Please retry.'},{status:500});}
}
