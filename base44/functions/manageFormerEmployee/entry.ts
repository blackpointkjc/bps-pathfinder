const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||(user.termination_date&&Date.parse(user.termination_date)<=Date.now())||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
Deno.serve(async req=>{
 try{
  const base44=createClientFromRequest(req),actor=await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
 const __portalCaller=await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||(__portalCaller.termination_date&&Date.parse(__portalCaller.termination_date)<=Date.now())||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 base44.auth.me=async()=>__portalCaller;

  const roles=new Set((actor?.additional_roles||[]).map((v:any)=>String(v).toLowerCase()));
  if(!actor || (actor.role!=='admin'&&!roles.has('full_access')))return Response.json({error:'Administrator authorization required'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(!['restore','rehire','convert_client','move_pending','clear_termination'].includes(body.action)||!body.user_id)return Response.json({error:'Select an employee and valid account action'},{status:400});
  const target=await base44.asServiceRole.entities.User.get(String(body.user_id)).catch(()=>null);
  if(!target)return Response.json({error:'Historical personnel account not found. Deleted accounts must be recovered from an authoritative backup.'},{status:404});
  const ownerId='6ae7d733d4b1a647cd3e6f38';
  const legacyHiersId='6a72bbee2842d6338cbae513';
  if(target.id===ownerId)return Response.json({error:'The primary Colonel Hiers account cannot be downgraded or moved to Pending.'},{status:403});
  const privilegedTarget=target.role==='admin';
  if(privilegedTarget&&(actor.id!==ownerId||target.id!==legacyHiersId))return Response.json({error:'A privileged administrator account requires separate authorized access review.'},{status:403});
  if(['restore','rehire','convert_client'].includes(body.action)&&!target.termination_date&&String(target.employment_status||'').toLowerCase()!=='terminated'&&String(target.account_status||'').toLowerCase()!=='terminated')return Response.json({error:'This action is only for former employees.'},{status:409});
  if(body.action==='clear_termination'&&!target.termination_date)return Response.json({error:'There is no termination date to clear.'},{status:409});
  const previous={termination_date:target.termination_date,employment_status:target.employment_status,account_status:target.account_status,role:target.role,additional_roles:target.additional_roles,rank:target.rank};
  const pendingPatch={role:'user',additional_roles:[],ps_role:'none',portal_approved:false,account_status:'pending',dispatch_role:false,is_supervisor:false,status:'Out of Service',assigned_location:'',assigned_locations:[],assigned_sites:[]};
  const patch=body.action==='move_pending'?{...pendingPatch,termination_date:'',employment_status:'active'}:body.action==='clear_termination'?{termination_date:'',...(target.employment_status==='terminated'?{employment_status:'active',account_status:'pending',portal_approved:false}:{} )}:body.action==='convert_client'?{termination_date:'',employment_status:'inactive',role:'user',rank:'Client',additional_roles:['client'],dispatch_role:false,is_supervisor:false,status:'Out of Service',assigned_location:'',assigned_locations:[],assigned_sites:[]}:{...pendingPatch,termination_date:'',employment_status:'active'};
  const updated=await base44.asServiceRole.entities.User.update(target.id,patch);
  await base44.asServiceRole.entities.AuditLog.create({entity_type:'User',entity_id:target.id,action:'status_change',actor_id:String(actor.id),actor_name:String(actor.email||''),before_value:JSON.stringify(previous),after_value:JSON.stringify(patch),timestamp:new Date().toISOString(),description:body.action==='move_pending'?'Account moved to Pending User; previous administrator and operational permissions revoked.':body.action==='clear_termination'?'Current termination date cleared; previous value retained in permanent personnel history.':body.action==='convert_client'?'Former employee converted to client; old CAD/employee roles revoked.':body.action==='rehire'?'Employee rehired. Prior termination retained in immutable personnel history; access roles require administrator review.':'Former employee restored to inactive-permission pending review.'}).catch(()=>null);
  return Response.json({success:true,user_id:target.id,action:body.action,requires_role_review:body.action!=='convert_client'});
 }catch(error:any){return Response.json({error:error?.message||'Account transition failed'},{status:500});}
});
