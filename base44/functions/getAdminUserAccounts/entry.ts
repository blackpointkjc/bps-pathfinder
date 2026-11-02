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
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
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
