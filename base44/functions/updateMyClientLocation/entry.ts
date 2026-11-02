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

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const isAdminPreview = user.role === 'admin' || roles.has('full_access');
    const isClient = roles.has('client') || String(user.user_type || '').toLowerCase() === 'client';
    if (!isClient && !isAdminPreview) return Response.json({ error: 'Client access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const locationId = String(body.location_id || '');
    if (!locationId) return Response.json({ error: 'Location is required' }, { status: 400 });

    const location = await base44.asServiceRole.entities.Location.get(locationId);
    if (!location) return Response.json({ error: 'Location not found' }, { status: 404 });

    if (!isAdminPreview) {
      const assigned = new Set([
        ...(Array.isArray(user.assigned_locations) ? user.assigned_locations : []),
        ...(Array.isArray(user.assigned_sites) ? user.assigned_sites : []),
        ...(user.assigned_location ? [user.assigned_location] : []),
      ].map((value: any) => String(value || '').trim()).filter(Boolean));
      const assignedByEmail = String(location.assigned_client_email || '').toLowerCase() === String(user.email || '').toLowerCase();
      if (!assigned.has(String(location.site_name || '').trim()) && !assignedByEmail) {
        return Response.json({ error: 'You can only edit your assigned location' }, { status: 403 });
      }
    }

    const data = body.data || {};
    const update = {
      address: String(data.address || '').trim(),
      site_email: String(data.site_email || '').trim(),
      notes: String(data.notes || ''),
    };
    await base44.asServiceRole.entities.Location.update(locationId, update);
    return Response.json({ success: true, location: { ...location, ...update } });
  } catch (error) {
    console.error('updateMyClientLocation failed', error);
    return Response.json({ error: error?.message || 'Unable to update location' }, { status: 500 });
  }
});
