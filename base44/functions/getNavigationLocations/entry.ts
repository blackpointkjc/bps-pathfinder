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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const lower=(value:any)=>String(value||'').trim().toLowerCase();
Deno.serve(async req=>{
  try {
    const api=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;
 const user=await api.auth.me().then(__limitFullAccess);
    if(!user)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set([user.role,...(user.additional_roles||[])].map(lower));
    const blocked=['client','student','pending'].some(role=>roles.has(role)) || ['client','student','pending'].includes(lower(user.user_type)) || !!user.termination_date;
    const allowed=['admin','officer','supervisor','dispatch','cad_access','full_access'].some(role=>roles.has(role)) || ['officer','unarmed officer','senior officer','corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(lower(user.rank));
    if(blocked||!allowed)return Response.json({error:'Operational access required'},{status:403});
    const locations:any[]=[];
    for(let skip=0;skip<10000;skip+=500){
      const page=await api.asServiceRole.entities.Location.list('-id',500,skip);
      locations.push(...page.map(row=>({id:row.id,site_name:row.site_name,address:row.address,latitude:row.latitude,longitude:row.longitude,division:row.division,subdivision:row.subdivision,active:row.active})));
      if(page.length<500)return Response.json({locations});
    }
    return Response.json({error:'Property directory exceeds the complete lookup limit'},{status:503});
  }catch(error){return Response.json({error:error?.message||'Managed properties unavailable'},{status:500});}
});
