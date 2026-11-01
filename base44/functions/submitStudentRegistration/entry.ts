import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
function __portalLoginIsCurrent(request){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  const encoded=token.split('.')[1];
  const claims=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
  return Number(claims.iat)>=Math.floor(Date.parse(__portalReauthAfter)/1000);
 }catch{return false;}
}
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
  const actor = await api.auth.me();
  if (!actor?.id || !actor.email) return Response.json({error:'Sign-in required'},{status:401});
 if(!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
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