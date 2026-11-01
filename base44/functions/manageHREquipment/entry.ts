import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<30*60*1000;
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

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const allowed = user.role === 'admin' || roles.has('hr') || roles.has('full_access') || String(user.rank || '').toLowerCase() === 'human resources';
    if (!allowed) return Response.json({ error: 'HR access required' }, { status: 403 });

    const { action, equipment_id, officer_email } = await req.json().catch(() => ({}));
    if (!equipment_id || !['assign', 'unassign'].includes(action)) {
      return Response.json({ error: 'equipment_id and valid action are required' }, { status: 400 });
    }
    const equipment = await base44.asServiceRole.entities.Equipment.get(equipment_id);
    if (!equipment) return Response.json({ error: 'Equipment not found' }, { status: 404 });

    if (action === 'assign') {
      if (!officer_email) return Response.json({ error: 'officer_email is required' }, { status: 400 });
      const users = await base44.asServiceRole.entities.User.filter({ email: officer_email });
      const target = users?.[0];
      if (!target || target.termination_date) return Response.json({ error: 'Active employee not found' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.Equipment.update(equipment_id, { assigned_to: officer_email, status: 'assigned' });
      return Response.json({ success: true, equipment: updated });
    }

    const updated = await base44.asServiceRole.entities.Equipment.update(equipment_id, { assigned_to: null, status: 'available' });
    return Response.json({ success: true, equipment: updated });
  } catch (error) {
    console.error('manageHREquipment failed', error);
    return Response.json({ error: error?.message || 'Unable to update equipment assignment' }, { status: 500 });
  }
});