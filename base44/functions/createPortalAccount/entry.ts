import {companyDelivery} from './delivery.ts';
import {createClientFromRequest} from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<30*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const URL='https://bpspf.blackpointkjc.com/Login?mode=register';
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function(req){
 try{
 const base44=createClientFromRequest(req),me=await base44.auth.me().then(__limitFullAccess);
 if(!me?.id||me.disabled||me.termination_date)return Response.json({error:'Sign in required'},{status:401});
 if(!await __portalLoginIsCurrent(req,base44,me))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
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
 try{const subject='Black Point — Create your Pathfinder account';const message='<div style="background:#080808;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#eee8d8"><table role="presentation" style="max-width:600px;margin:auto;border:1px solid #b99a43;border-radius:16px;background:#141410" cellpadding="28"><tr><td><div style="font-size:28px;font-weight:bold;color:#fff">BLACK<span style="color:#e7c75c">POINT</span></div><p style="color:#bda75e;font-size:11px;letter-spacing:3px">PATHFINDER ACCOUNT ACCESS</p><h1 style="color:#fff;font-size:27px">Your invitation is ready.</h1><p>Hello '+esc(profile.first_name)+',</p><p>You have been invited to create your BlackPoint '+esc(type)+' account.</p><p>Use the same email address that received this invitation. Create your own password, verify your email, and complete your profile. Your workspace remains pending until authorized staff approve access.</p><p style="margin:28px 0"><a style="background:#e8c85c;color:#111;padding:14px 24px;border-radius:25px;text-decoration:none;font-weight:bold;display:inline-block" href="'+URL+'">Create your Pathfinder account</a></p><p style="font-size:12px;color:#aaa28c">Never share your password. BlackPoint staff will not ask you to send it by email.</p><hr style="border:0;border-top:1px solid #5d512f"><p style="font-size:12px;color:#aaa28c">KJC Security Solution LLC · BlackPoint<br>Present. Prepared. Professional.</p></td></tr></table></div>';try{await companyDelivery(base44,email,subject,message,me,true);branded=true;}catch{if(person){await base44.asServiceRole.integrations.Core.SendEmail({to:email,subject,body:message});branded=true;}}}catch{}
 await db.PortalInvitation.update(record.id,{email_sent:branded||providerSent});
 return Response.json({success:true,provisioned:!!person,status:'invited_waiting_for_registration',invitation_sent:branded,branded_email_sent:branded,email_sent:branded||providerSent,email_error:branded||providerSent?'':'Invitation saved, but email delivery failed. Reconnect the management mailbox or verify an approved company mailbox, then resend.',invitation_error:undefined,user_id:person?.id||null,assignment_pending:true});
 }catch{return Response.json({success:false,error:'Unable to create the invitation. Please retry.'},{status:500});}
}
