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

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

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
    const roles = rolesOf(user);
    const hasHR = user.role === 'admin' || roles.has('hr') || roles.has('full_access') || String(user.rank || '').toLowerCase() === 'human resources';
    if (!hasHR) return Response.json({ error: 'HR access required' }, { status: 403 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';
    if (action === 'list') {
      const divisions = await base44.asServiceRole.entities.Division.list('division_name', 1000);
      return Response.json({ success: true, divisions: divisions || [] });
    }
    if (action === 'create') {
      const division = await base44.asServiceRole.entities.Division.create(body.data || {});
      return Response.json({ success: true, division });
    }
    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Division ID required' }, { status: 400 });
      const old=await base44.asServiceRole.entities.Division.get(body.id);
      if(old && (old.division_level==='region'||old.is_subdivision!==true)
          && body.data?.division_name && String(body.data.division_name).trim().toLowerCase()!==String(old.division_name).trim().toLowerCase()){
        const platoons=await base44.asServiceRole.entities.CompanyPlatoon.filter({region:old.division_name},'-created_date',1000).catch(()=>[]);
        if(platoons.length)return Response.json({error:'Move or reassign this Region’s Platoons before renaming the Region.'},{status:409});
      }
      const division = await base44.asServiceRole.entities.Division.update(body.id, body.data || {});
      return Response.json({ success: true, division });
    }
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Division ID required' }, { status: 400 });
      const original=await base44.asServiceRole.entities.Division.get(body.id);
      if(original && (original.division_level==='region'||original.is_subdivision!==true)){
        const platoons=await base44.asServiceRole.entities.CompanyPlatoon.filter({region:original.division_name},'-created_date',1000).catch(()=>[]);
        if(platoons.length)return Response.json({error:'This Region has Platoons. Move or delete them before deleting the Region.'},{status:409});
      }
      await base44.asServiceRole.entities.Division.delete(body.id);
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageHRDivisions failed', error);
    return Response.json({ error: error?.message || 'Unable to manage divisions' }, { status: 500 });
  }
});