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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!__portalLoginIsCurrent(req))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', users: [] }, { status: 401 });
    const allUsers = await base44.asServiceRole.entities.User.list();
    const users = (allUsers || []).filter((entry: any) => !entry.termination_date && entry.email).map((entry: any) => ({
      id: entry.id,
      email: entry.email,
      first_name: entry.first_name || '',
      last_name: entry.last_name || '',
      full_name: entry.full_name || '',
      rank: entry.rank || '',
      role: entry.role || '',
      additional_roles: entry.additional_roles || [],
      dispatch_role: entry.dispatch_role === true,
      unit_number: entry.unit_number || '',
      profile_photo_url: entry.profile_photo_url || '',
      mobile_phone: entry.mobile_phone || '',
    }));
    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json({ error: error.message, users: [] }, { status: 500 });
  }
});
