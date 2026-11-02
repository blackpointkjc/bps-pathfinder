const __portalAppIdentity=(user:any)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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
const trim=(v:any)=>String(v||'').trim();
const key=(v:any)=>trim(v).toLowerCase();
Deno.serve(async(req)=>{
 try{
  const sdk=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await sdk.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,sdk,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await sdk.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    sdk.auth.me = async () => __portalCaller;

  const me=await sdk.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
  if(!me)return Response.json({error:'Sign in required'},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=trim(body.action||'list');
  const admin=me.role==='admin'||(me.additional_roles||[]).some((role:any)=>key(role)==='full_access');
  const rows=await sdk.asServiceRole.entities.CompanyPlatoon.list('region',1000);
  if(action==='list')return Response.json({success:true,platoons:rows||[]});
  if(!admin)return Response.json({error:'Administrator access required'},{status:403});
  if(!['create','update','delete'].includes(action))return Response.json({error:'Unsupported operation'},{status:400});
  const id=trim(body.id);
  const original=action==='create'?null:(rows||[]).find((row:any)=>String(row.id)===id);
  if(action!=='create'&&!original)return Response.json({error:'Platoon does not exist'},{status:404});
  if(action==='delete'){
    const personnel=await sdk.asServiceRole.entities.User.list('-updated_date',1000);
    const assigned=(personnel||[]).filter((p:any)=>key(p.division)===key(original.region)
      &&key(p.platoon).replace(/^platoon\s+/,'')===key(original.name).replace(/^platoon\s+/,''));
    if(assigned.length)return Response.json({
      error:`Cannot permanently delete ${original.name} in ${original.region}: ${assigned.length} officer${assigned.length===1?' is':'s are'} still assigned. Reassign them in Manage Officers, or archive the Platoon while preserving their assignments.`,
      assigned_count:assigned.length,can_archive:true,
    },{status:409});
    await sdk.asServiceRole.entities.CompanyPlatoon.delete(id);
    return Response.json({success:true});
  }
  const data=body.data||{};
  // Preserve historic 'A'/'B' officer assignments when admins type 'Platoon A'.
  const name=trim(data.name??original?.name).replace(/^platoon\s+/i,'');
  const region=trim(data.region??original?.region);
  if(!name||!region||name.length>80||region.length>120)return Response.json({error:'A valid platoon name and region are required'},{status:400});
  const regions=await sdk.asServiceRole.entities.Division.list('division_name',1000);
  if(!(regions||[]).some((r:any)=>key(r.division_name)===key(region)&&(r.division_level==='region'||(!r.division_level&&r.is_subdivision!==true))&&r.active!==false))
    return Response.json({error:'Create or activate this Region in Company Structure before assigning platoons'},{status:400});
  if((rows||[]).some((r:any)=>r.id!==id&&key(r.name).replace(/^platoon\s+/,'')===key(name)&&key(r.region)===key(region)))
    return Response.json({error:'This platoon already exists within the selected Region'},{status:409});
  if(action==='update'&&(key(original.name)!==key(name)||key(original.region)!==key(region))){
    const personnel=await sdk.asServiceRole.entities.User.list('-updated_date',1000);
    if((personnel||[]).some((p:any)=>key(p.division)===key(original.region)&&key(p.platoon)===key(original.name)))
      return Response.json({error:'Platoon has assigned officers. Transfer them before changing its name or Region.'},{status:409});
  }
  const next={name,region,active:data.active!==undefined?data.active!==false:original?.active!==false,notes:trim(data.notes??original?.notes)};
  const platoon=action==='create'?await sdk.asServiceRole.entities.CompanyPlatoon.create(next):await sdk.asServiceRole.entities.CompanyPlatoon.update(id,next);
  return Response.json({success:true,platoon});
 }catch(e:any){console.error('manageCompanyPlatoons',e);return Response.json({error:'Unable to manage platoons'},{status:503});}
});
