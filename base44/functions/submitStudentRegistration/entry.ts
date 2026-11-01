import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
  const actor = await api.auth.me();
  if (!actor?.id || !actor.email) return Response.json({error:'Sign-in required'},{status:401});
 if(!await __portalLoginIsCurrent(req,api,actor))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
  const profile = await api.asServiceRole.entities.User.get(actor.id);
  if (String(profile?.rank || '').toLowerCase() !== 'student registration pending')
    return Response.json({error:'This account is not awaiting student registration'},{status:403});
  const records = await api.asServiceRole.entities.StudentEnrollment.filter({email:String(actor.email).toLowerCase()},'-created_date',3);
  const enrollment = (records || []).find((item:any)=>['invited','profile_submitted'].includes(item.status));
  if (!enrollment) return Response.json({error:'Student invitation was not found'},{status:404});
  const required = ['first_name','last_name','date_of_birth','ssn','address','city','state','zip','mobile_phone','dcjs_number'];
  const missing = required.filter(key=>!String(profile?.[key]||'').trim());
  if(missing.length)return Response.json({error:'Complete the remaining student profile fields',missing},{status:400});
  await api.asServiceRole.entities.StudentEnrollment.update(enrollment.id,{status:'profile_submitted',user_id:actor.id});
  return Response.json({success:true,pending_trainer_review:true});
 } catch(error) {
  console.error('Student registration confirmation failed',error?.message||error);
  return Response.json({error:'Student registration could not be confirmed'},{status:500});
 }
});