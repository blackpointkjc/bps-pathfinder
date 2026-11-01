import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const id = String(body.id || '');
    if (!id) return Response.json({ error: 'Time entry is required' }, { status: 400 });

    const entry = await base44.asServiceRole.entities.TimeEntry.get(id);
    if (!entry) return Response.json({ success: true, already_removed: true });
    if (String(entry.officer_email || '').toLowerCase() !== String(user.email).toLowerCase()) {
      return Response.json({ error: 'You can only roll back your own time entry' }, { status: 403 });
    }
    const created = new Date(entry.created_date || entry.clock_in || 0).getTime();
    if (!created || Date.now() - created > 10 * 60 * 1000) {
      return Response.json({ error: 'This time entry is too old to roll back automatically' }, { status: 409 });
    }
    await base44.asServiceRole.entities.TimeEntry.delete(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('rollbackMyTimeEntry failed', error);
    return Response.json({ error: error?.message || 'Unable to roll back time entry' }, { status: 500 });
  }
});
