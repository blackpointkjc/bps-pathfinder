import {createClientFromRequest} from 'npm:@base44/sdk';
const URL='https://bpspf.blackpointkjc.com/Login?mode=register';
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function(req){
 try{
 const base44=createClientFromRequest(req),me=await base44.auth.me();
 if(!me?.id||me.disabled||me.termination_date)return Response.json({error:'Sign in required'},{status:401});
 const b=await req.json(),roles=new Set(me.additional_roles||[]),admin=me.role==='admin'||roles.has('full_access');
 const type={pending:'employee',student_pending:'student',employee:'employee',student:'student',client:'client',visitor:'visitor'}[b.accountType];
 if(!type||!admin&&!(type==='student'&&roles.has('trainer'))&&!(type==='employee'&&roles.has('hr')))return Response.json({error:'Account creation is not permitted'},{status:403});
 const email=String(b.email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!String(b.first_name||'').trim()||!String(b.last_name||'').trim())return Response.json({error:'First name, last name and a valid email are required'},{status:400});
 const db=base44.asServiceRole.entities;
 const people=await db.User.filter({email},'-created_date',1),person=people[0];
 if(person&&(person.role==='admin'||person.additional_roles?.length))return Response.json({error:'This account already has assigned access. Manage its existing profile instead.'},{status:409});
 const profile={};for(const key of ['first_name','last_name','mobile_phone','date_of_birth','assigned_location','rank','division','hire_date','dcjs_number'])if(b[key])profile[key]=String(b[key]).trim().slice(0,250);
 const rows=await db.PortalInvitation.filter({email},'-created_date',1);
 const payload={email,account_type:type,profile,invited_by:me.email,status:'invited',email_sent:false};
 const record=rows[0]?await db.PortalInvitation.update(rows[0].id,payload):await db.PortalInvitation.create(payload);
 if(person)await db.User.update(person.id,{first_name:profile.first_name,last_name:profile.last_name,rank:type==='student'?'Student Registration Pending':type==='visitor'?'Visitor Pending':'Pending Assignment'});
 let providerSent=false,providerError='';
 // Public registration uses the branded invitation below; credentials are created only by the recipient.
 let branded=false;
 try{await base44.asServiceRole.integrations.Core.SendEmail({to:email,subject:'Black Point — Create your Pathfinder account',body:'<h1>Welcome to BPS Pathfinder</h1><p>Hello '+esc(profile.first_name)+',</p><p>Your '+esc(type)+' account invitation is ready. Create your password and verify your email in the portal. Your workspace remains pending until authorized staff approve it.</p><p><a href="'+URL+'">Create your account</a></p><p>Use the same email address that received this message. Never share your password.</p>'});branded=true;}catch{}
 await db.PortalInvitation.update(record.id,{email_sent:branded||providerSent});
 return Response.json({success:true,provisioned:!!person,status:'invited_waiting_for_registration',invitation_sent:branded,branded_email_sent:branded,email_sent:branded||providerSent,email_error:branded||providerSent?'':'Invitation saved, but email delivery failed. Retry the invitation.',invitation_error:undefined,user_id:person?.id||null,assignment_pending:true});
 }catch{return Response.json({success:false,error:'Unable to create the invitation. Please retry.'},{status:500});}
}
