import {createClientFromRequest} from 'npm:@base44/sdk';
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
const RESERVED = [
 {id:'6a72bbee2842d6338cbae513',badge:'4001',last:'hiers'},
 {id:'6a406e7f5968db44ad597d61',badge:'4002',last:'sherrill'},
 {id:'6ac889ba810b2036456a6d24',badge:'4003',last:'jones'},
 {id:'6ad1a4589148f235c2c15623',badge:'4004',last:'robinson'},
 {id:'6ad1ab9d4b2e4e06c9916653',badge:'4005',last:'cook'},
];
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

  const me=await api.auth.me().then(__limitFullAccess);
  if (!me || (me.role!=='admin' && !(me.additional_roles || []).includes('full_access'))) return Response.json({error:'System administrator required'},{status:403});
  const users=await api.asServiceRole.entities.User.list(undefined,1000);
  const issues=[];
  for(const entry of RESERVED){
   const user=(users||[]).find((u:any)=>u.id===entry.id);
   if(!user || String(user.last_name || '').trim().toLowerCase() !== entry.last) issues.push(`Personnel identity mismatch for ${entry.badge}`);
   if((users||[]).some((u:any)=>u.id!==entry.id && String(u.badge_number || '').trim()===entry.badge)) issues.push(`Badge ${entry.badge} already belongs to another record`);
  }
  if(issues.length) return Response.json({error:'Badge reconciliation stopped to prevent a conflict',issues},{status:409});
  const updated=[];
  for(const entry of RESERVED){
   const user=(users||[]).find((u:any)=>u.id===entry.id);
   if(String(user.badge_number||'').trim()!==entry.badge){
    await api.asServiceRole.entities.User.update(entry.id,{badge_number:entry.badge});
   }
   const reread=await api.asServiceRole.entities.User.get(entry.id);
   if(String(reread?.badge_number||'').trim()!==entry.badge) throw new Error(`Badge ${entry.badge} was not confirmed saved`);
   updated.push({id:entry.id,badge:entry.badge});
  }
  return Response.json({success:true,updated});
 }catch(error:any){return Response.json({error:error?.message || 'Badge reconciliation failed'},{status:500});}
});
