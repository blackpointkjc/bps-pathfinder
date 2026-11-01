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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const currentUser = await base44.auth.me().then(__limitFullAccess);
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const client = [currentUser.role, currentUser.rank, currentUser.user_type, currentUser.account_type, currentUser.portal_type].some(value => String(value || '').trim().toLowerCase() === 'client') || roles.has('client');
    const allowed = currentUser.role === 'admin' || roles.has('full_access') || client;
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { officerEmails = [] } = await req.json();
    const requested = new Set((officerEmails || []).filter(Boolean).map((value: string) => value.trim().toLowerCase()));
    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const officers = (users || [])
      .filter((u: any) => {
        const roles = new Set((u.additional_roles || []).map((r: string) => String(r).toLowerCase()));
        const isOfficer = roles.has('officer') || ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'].includes(String(u.rank || '').trim().toLowerCase());
        const active = !u.termination_date && u.employment_status !== 'terminated';
        return isOfficer && active && (requested.size === 0 || [u.email,u.work_email,u.pathfinder_email,u.microsoft_email,u.outlook_email,...(Array.isArray(u.email_aliases) ? u.email_aliases : [])].some(value => requested.has(String(value || '').trim().toLowerCase())));
      })
      .map((u: any) => ({ email: u.email, email_aliases: [u.email,u.work_email,u.pathfinder_email,u.microsoft_email,u.outlook_email,...(Array.isArray(u.email_aliases) ? u.email_aliases : [])].filter(Boolean), rank: u.rank || 'Officer', last_name: u.last_name || '', unit_number: u.unit_number || '' }));

    return Response.json({ officers });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to load officer directory', officers: [] }, { status: 500 });
  }
});