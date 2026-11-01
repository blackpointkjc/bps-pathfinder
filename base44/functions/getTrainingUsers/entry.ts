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

let userCache: { at:number; rows:any[] } | null = null;
let userRead: Promise<any[]> | null = null;
async function loadUsers(base44:any) {
  if (userCache && Date.now()-userCache.at<30000) return userCache.rows;
  if (!userRead) userRead = base44.asServiceRole.entities.User.list(undefined,1000).then((rows:any[])=>{
    if (!Array.isArray(rows)) throw new Error('Invalid officer directory response');
    userCache={at:Date.now(),rows}; return rows;
  }).finally(()=>{userRead=null;});
  return await userRead;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized', users: [] }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || roles.has('trainer') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'Trainer access required', users: [] }, { status: 403 });

    const body=await req.json().catch(()=>({}));
    if(body.refresh===true)userCache=null;
    // Pending invitations are independent from User provisioning; one failing source
    // must not erase the other source's confirmed records.
    const load_errors: string[] = [];
    const allUsers = await loadUsers(base44);
    const enrollments = await base44.asServiceRole.entities.StudentEnrollment.list('-created_date', 300).catch((error:any) => {
      load_errors.push('Student invitations: ' + (error?.message || 'unavailable'));
      return [];
    });
    const enrollmentsByEmail = new Map((enrollments || []).map((enrollment:any) => [String(enrollment.email || '').toLowerCase(), String(enrollment.status || '')]));
    const users: any[] = (allUsers || [])
      .filter((entry: any) => {
        if (!entry?.email || entry.termination_date) return false;
        const entryRoles = new Set((entry.additional_roles || []).map((r: string) => String(r).toLowerCase()));
        const type = String(entry.user_type || entry.account_type || entry.portal_type || '').toLowerCase();
        const rank = String(entry.rank || '').toLowerCase();
        if (entryRoles.has('student') || type === 'student' || rank === 'student' || rank === 'student registration pending') return true;
        if (entryRoles.has('client') || ['client','pending'].includes(type) || rank === 'client') return false;
        return entry.role === 'admin' || entryRoles.has('officer') || entryRoles.has('cad_access') || ['unarmed officer','senior officer','first sergeant','officer','corporal','sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank) || entryRoles.has('supervisor') || entryRoles.has('hr') || entryRoles.has('support') || entryRoles.has('support_staff') || entryRoles.has('accounting') || entryRoles.has('trainer') || entryRoles.has('full_access') || String(entry.employment_status || '').toLowerCase() === 'active';
      })
      .map((entry: any) => ({
        id: entry.id,
        email: entry.email || '',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || '',
        unit_number: entry.unit_number || '',
        division: entry.division || '',
        employment_status: entry.employment_status || '',
        profile_photo_url: entry.profile_photo_url || '',
        additional_roles: entry.additional_roles || [],
        user_type: entry.user_type || entry.account_type || entry.portal_type || '',
        officer_certifications: Array.isArray(entry.officer_certifications) ? entry.officer_certifications : [],
        date_of_birth: entry.date_of_birth || '',
        student_intake_complete: Boolean(entry.ssn && entry.dcjs_number && entry.mobile_phone && entry.address && entry.date_of_birth),
        student_enrollment_status: enrollmentsByEmail.get(String(entry.email || '').toLowerCase()) || '',
        dcjs_number: entry.dcjs_number || '',
        dcjs_expiration: entry.dcjs_expiration || '',
        firearm_expiration: entry.firearm_expiration || '',
      }))
      .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

    // Invitations are durable even before Base44 provisions the User record.
    // These are roster placeholders only; they cannot be approved or edited until
    // the invited person has actually signed in and completed registration.
    for (const enrollment of enrollments || []) {
      if (!['invited','profile_submitted'].includes(String(enrollment.status || ''))) continue;
      if (users.some((entry:any) => String(entry.email).toLowerCase() === String(enrollment.email).toLowerCase())) continue;
      users.push({
        id: `invitation:${enrollment.id}`, email: enrollment.email,
        first_name: enrollment.first_name, last_name: enrollment.last_name,
        date_of_birth: enrollment.date_of_birth,
        rank: 'Student Invitation Pending', additional_roles: [],
        invitation_only: true, student_intake_complete: false,
        student_enrollment_status: String(enrollment.status || 'invited'),
      });
    }

    return Response.json({ success: true, users, load_errors, pending_invitations: (enrollments || []).filter((entry:any) => ['invited','profile_submitted'].includes(String(entry.status))).length });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Unable to load training users', users: [] }, { status: 500 });
  }
});