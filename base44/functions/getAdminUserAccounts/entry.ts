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
// Keep account lookup read-only. Historical client-account sanitization belongs
// in account-management mutations, never in an N-user browser page load.
const clean=value=>String(value||'').trim().toLowerCase();
const isClientIdentity=person=>[].concat(person?.additional_roles||[]).map(clean).includes('client')
  ||[person?.rank,person?.user_type,person?.account_type,person?.portal_type].some(value=>clean(value)==='client');

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

    const caller = await api.auth.me().then(__limitFullAccess).catch(() => null);
    const roles = new Set((caller?.additional_roles || []).map((x:string) => String(x).toLowerCase()));
    if (!caller || (caller.role !== 'admin' && !roles.has('full_access'))) {
      return Response.json({error:'Administrator access required'}, {status:403});
    }
    // Account approvals must use the real identity records rather than the
    // 10-minute cached operational directory, which misses new registrants.
    const users = await api.asServiceRole.entities.User.list('-created_date', 1000);
    // A list request is a single read. Do not perform hundreds of
    // client-account migration updates every time Manage Users opens.
    const staff=(users||[]).filter(person=>!isClientIdentity(person));
    return Response.json({success:true,users:staff,count:staff.length});
  } catch(error:any) {
    const message = String(error?.message || 'Account list unavailable');
    const rateLimited = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(message);
    return Response.json({error:message}, {status:rateLimited ? 429 : 500});
  }
});
