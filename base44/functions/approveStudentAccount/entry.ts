import { createClientFromRequest } from 'npm:@base44/sdk';
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
  const actor = await api.auth.me();
  const permissions = (actor?.additional_roles || []).map((r:unknown) => String(r).toLowerCase());
  if (!actor || (actor.role !== 'admin' && !permissions.includes('trainer') && !permissions.includes('full_access')))
   return Response.json({error:'Trainer access required'},{status:403});
  const {userId} = await req.json();
  if (!userId) return Response.json({error:'User ID required'},{status:400});
  const target = await api.asServiceRole.entities.User.get(String(userId));
  if (!target || String(target.rank || '').toLowerCase() !== 'student registration pending')
   return Response.json({error:'This user is not a pending student'},{status:409});
  if ((target.additional_roles || []).length) return Response.json({error:'This account has existing assigned roles'},{status:409});
  const required = ['first_name','last_name','date_of_birth','email','mobile_phone','address','city','state','zip','dcjs_number'];
  const missing = required.filter(field => !String(target[field] || '').trim());
  if (missing.length) return Response.json({error:'Student intake is incomplete',missing},{status:400});
  await api.asServiceRole.entities.User.update(target.id,{additional_roles:['student'],rank:'Student'});
  return Response.json({success:true,student_id:target.id});
 } catch(error) {
  console.error('Student approval failed',error?.message || error);
  return Response.json({error:'Unable to approve student enrollment'},{status:500});
 }
});