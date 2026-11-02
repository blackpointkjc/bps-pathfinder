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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function loadUsers(base44: any) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rows = await base44.asServiceRole.entities.User.list(undefined, 1000);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(500 * (attempt + 1));
    }
  }
  throw lastError || new Error('Unable to load HR users');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const supportRank = ['support staff', 'human resources'].includes(String(user?.rank || '').toLowerCase());
    const hrPrivileged = !!user && (user.role === 'admin' || roles.has('hr') || roles.has('full_access'));
    const privileged = hrPrivileged || (!!user && roles.has('trainer'));
    const authorized = privileged || (!!user && (supportRank || roles.has('support_staff')));
    if (!authorized) return Response.json({ error: 'Unauthorized', users: [] }, { status: 403 });

    const allUsers = await loadUsers(base44);
    const internalRoles = new Set(['cad_access', 'officer', 'supervisor', 'hr', 'accounting', 'trainer', 'full_access', 'support_staff']);
    const users = (allUsers || [])
      .filter((entry: any) => {
        if (!privileged && entry.email !== user.email) return false;
        const clientRoles=new Set((entry.additional_roles||[]).map((role:string)=>String(role).toLowerCase()));
        if(clientRoles.has('client')||[entry.rank,entry.user_type,entry.account_type,entry.portal_type].some(value=>String(value||'').toLowerCase()==='client'))return false;
        // HR must retain terminated personnel for historic review and restoration.
        // Non-privileged viewers continue to receive only their own limited data.
        if (entry.termination_date || String(entry.employment_status || '').toLowerCase() === 'terminated') return hrPrivileged;
        const entryRoles = new Set((entry.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        const rank = String(entry.rank || '').toLowerCase();
        const userType = String(entry.user_type || entry.account_type || entry.portal_type || '').toLowerCase();
        const employmentStatus = String(entry.employment_status || '').toLowerCase();
        const portalOnly = entryRoles.has('client') || entryRoles.has('student') || ['client', 'student', 'pending'].includes(userType) || rank === 'client' || rank === 'student';
        const internalByRole = entry.role === 'admin' || [...entryRoles].some((role: string) => internalRoles.has(role));
        const internalByRank = Boolean(rank) && !['client', 'student', 'pending'].includes(rank);
        const internalByEmployment = ['active', 'inactive', 'leave', 'terminated'].includes(employmentStatus);
        const awaitingCategory = entry.role !== 'admin' && (entry.additional_roles || []).length === 0 && !portalOnly;
        return !portalOnly && (internalByRole || internalByRank || internalByEmployment || (hrPrivileged && awaitingCategory));
      })
      .map((entry: any) => hrPrivileged ? {
        ...entry,
        role: entry.role || 'user',
        additional_roles: entry.additional_roles || [],
        pto_balance_hours: entry.pto_balance_hours || 0,
        sick_time_balance_hours: entry.sick_time_balance_hours || entry.sick_balance_hours || 0,
      } : ({
        id: entry.id,
        email: entry.email,
        role: entry.role || 'user',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || '',
        unit_number: entry.unit_number || '',
        profile_photo_url: entry.profile_photo_url || entry.profile_photo_original_url || '',
        additional_roles: entry.additional_roles || [],
        pto_balance_hours: entry.pto_balance_hours || 0,
        sick_time_balance_hours: entry.sick_time_balance_hours || entry.sick_balance_hours || 0,
      }))
      .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json({ error: error.message, users: [] }, { status: 500 });
  }
});
