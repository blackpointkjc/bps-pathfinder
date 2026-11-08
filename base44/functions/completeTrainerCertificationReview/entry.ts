const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { isOutOfOffice } from './absencePolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';
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


Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

  const me = await api.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (isOutOfOffice(me)) return Response.json({error:'Assigned tasks are on hold until your return',held_until:me.out_of_office_return},{status:409});
  const roles = (me?.additional_roles || []).map((role:unknown) => String(role).toLowerCase());
  if (!me || (me.role !== 'admin' && !roles.includes('trainer') && !roles.includes('full_access')))
   return Response.json({error:'Trainer access required'},{status:403});
  const {taskId} = await req.json();
  const task = await api.asServiceRole.entities.Task.get(String(taskId || ''));
  if (!task || task.title !== 'Review new officer certifications')
   return Response.json({error:'Certification review task was not found'},{status:404});
  if (me.role !== 'admin' && !roles.includes('full_access') && task.assigned_to !== me.id)
   return Response.json({error:'This certification review is assigned to another trainer'},{status:403});
  const officer = await api.asServiceRole.entities.User.get(task.related_id);
  if (!officer || !(officer.additional_roles || []).includes('officer'))
   return Response.json({error:'The officer record is unavailable'},{status:404});
  if (!Array.isArray(officer.officer_certifications) || officer.officer_certifications.length === 0)
   return Response.json({error:'Update the officer certification file before completing this review'},{status:409});
  // A single officer may have a review task for each trainer. Once an authorized
  // reviewer verifies the file, close all outstanding copies so the administrator
  // dashboard does not keep showing the same completed officer review.
  const pending = await api.asServiceRole.entities.Task.filter({related_id:task.related_id},'-created_date',100);
  const duplicates = (pending || []).filter((row:any)=>row.title === 'Review new officer certifications' && ['open','in_progress'].includes(row.status));
  const completedAt=new Date().toISOString();
  for (const row of duplicates.length ? duplicates : [task]) {
   await api.asServiceRole.entities.Task.update(row.id, {
    status:'completed',completed_at:completedAt,
    notes:`Officer certification file reviewed by ${me.email || me.id} on ${completedAt}. Certification records verified present; individual credential validity remains governed by each credential's status and expiration date.`
   });
  }
  return Response.json({success:true,completed_count:Math.max(duplicates.length,1),officer_id:task.related_id});
 } catch(error) {
  console.error('Certification review completion failed',error?.message || error);
  return Response.json({error:'Unable to complete certification review'},{status:500});
 }
});