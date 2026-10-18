import { createClientFromRequest } from 'npm:@base44/sdk';
Deno.serve(async req=>{
 try{
  const base44=createClientFromRequest(req),actor=await base44.auth.me().catch(()=>null);
  const roles=new Set((actor?.additional_roles||[]).map((v:any)=>String(v).toLowerCase()));
  if(!actor || (actor.role!=='admin'&&!roles.has('full_access')))return Response.json({error:'Administrator authorization required'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(!['restore','convert_client'].includes(body.action)||!body.user_id)return Response.json({error:'Select a former employee and action'},{status:400});
  const target=await base44.asServiceRole.entities.User.get(String(body.user_id)).catch(()=>null);
  if(!target)return Response.json({error:'Historical personnel account not found. Deleted accounts must be recovered from an authoritative backup.'},{status:404});
  if(!target.termination_date&&String(target.employment_status||'').toLowerCase()!=='terminated'&&String(target.account_status||'').toLowerCase()!=='terminated')return Response.json({error:'Only former employees can be restored or converted by this action'},{status:409});
  if(target.role==='admin')return Response.json({error:'An administrator account requires separate privileged access review'},{status:409});
  const previous={termination_date:target.termination_date,employment_status:target.employment_status,additional_roles:target.additional_roles,rank:target.rank};
  const patch=body.action==='convert_client'?{termination_date:'',employment_status:'inactive',role:'user',rank:'Client',additional_roles:['client'],dispatch_role:false,is_supervisor:false,status:'Out of Service',assigned_location:'',assigned_locations:[],assigned_sites:[]}:{termination_date:'',employment_status:'active',role:'user',rank:target.rank,additional_roles:[],dispatch_role:false,is_supervisor:false,status:'Out of Service'};
  const updated=await base44.asServiceRole.entities.User.update(target.id,patch);
  await base44.asServiceRole.entities.AuditLog.create({entity_type:'User',entity_id:target.id,action:'status_change',actor_id:String(actor.id),actor_name:String(actor.email||''),before_value:JSON.stringify(previous),after_value:JSON.stringify(patch),timestamp:new Date().toISOString(),description:body.action==='restore'?'Former employee restored to inactive-permission pending review.':'Former employee converted to client; old CAD/employee roles revoked.'}).catch(()=>null);
  return Response.json({success:true,user_id:target.id,action:body.action,requires_role_review:body.action==='restore'});
 }catch(error:any){return Response.json({error:error?.message||'Account transition failed'},{status:500});}
});
