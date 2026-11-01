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
    const api=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

    const me=await api.auth.me().then(__limitFullAccess).catch(()=>null);
    const roles=new Set((me?.additional_roles||[]).map((s:string)=>String(s).toLowerCase()));
    if(!me || !(me.role==='admin'||me.role==='dispatch'||me.dispatch_role||me.is_supervisor||roles.has('full_access')||roles.has('cad_access')||roles.has('dispatch')||roles.has('supervisor')))return Response.json({error:'Dispatch access required'},{status:403});
    const rows=await api.asServiceRole.entities.User.filter({dispatch_hold_new_calls:true},'-dispatch_hold_at',200);
    return Response.json({success:true,officers:(rows||[]).map((u:any)=>({id:u.id,user_id:u.id,email:u.email,rank:u.rank,last_name:u.last_name,unit_number:u.unit_number,dispatch_hold_new_calls:true,status:u.status||'Unavailable'}))});
  }catch(error:any){return Response.json({error:error?.message||'Held officers unavailable'},{status:500});}
});
