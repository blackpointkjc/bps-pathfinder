import { isOutOfOffice } from './absencePolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';


Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().catch(()=>null);
    if (!__portalCaller || (__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

  const me = await api.auth.me();
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