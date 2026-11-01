import { isOutOfOffice } from './absencePolicy.ts';
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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;


Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

  const me = await api.auth.me().then(__limitFullAccess);
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
  await api.asServiceRole.entities.Task.update(task.id, {
   status:'completed',completed_at:new Date().toISOString(),
   notes:'Trainer verified that officer certification records are present in the personnel file.'
  });
  return Response.json({success:true});
 } catch(error) {
  console.error('Certification review completion failed',error?.message || error);
  return Response.json({error:'Unable to complete certification review'},{status:500});
 }
});