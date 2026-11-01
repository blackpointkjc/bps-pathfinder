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

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin'
      || user.role === 'dispatch'
      || roles.has('full_access')
      || roles.has('supervisor')
      || roles.has('cad_access')
      || roles.has('officer')
      || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'Property alert access required' }, { status: 403 });

    const { alert_id, action = 'acknowledged' } = await req.json().catch(() => ({}));
    if (!alert_id) return Response.json({ error: 'alert_id is required' }, { status: 400 });
    if (!['acknowledged', 'silenced'].includes(action)) {
      return Response.json({ error: 'action must be acknowledged or silenced' }, { status: 400 });
    }

    const alert = await base44.asServiceRole.entities.PropertyAlert.get(alert_id);
    if (!alert) return Response.json({ error: 'Property alert not found' }, { status: 404 });
    const call = alert.callId
      ? await base44.asServiceRole.entities.DispatchCall.get(alert.callId).catch(() => null)
      : null;
    const stableCallId = String(call?.external_call_id || call?.agency_cad_number || call?.bps_reference || call?.call_id || alert.callId || '').trim();
    const eventKey = `${String(alert.propertyId || '')}|${stableCallId}`;

    const userEmail = String(user.email || '').trim().toLowerCase();
    if (!userEmail) return Response.json({ error: 'Signed-in user email is required' }, { status: 400 });

    const byEvent = eventKey
      ? await base44.asServiceRole.entities.PropertyAlertReceipt.filter({ user_email: userEmail, event_key: eventKey }, '-dismissed_at', 10).catch(() => [])
      : [];
    const byPair = byEvent.length ? [] : await base44.asServiceRole.entities.PropertyAlertReceipt.filter({
      user_email: userEmail,
      call_id: String(alert.callId || ''),
      property_id: String(alert.propertyId || ''),
    }, '-dismissed_at', 10).catch(() => []);
    const existing = byEvent.length ? byEvent : byPair;

    const data = {
      alert_id,
      call_id: String(alert.callId || ''),
      property_id: String(alert.propertyId || ''),
      event_key: eventKey,
      user_email: userEmail,
      action,
      dismissed_at: new Date().toISOString(),
    };

    const receipt = existing?.[0]
      ? await base44.asServiceRole.entities.PropertyAlertReceipt.update(existing[0].id, data)
      : await base44.asServiceRole.entities.PropertyAlertReceipt.create(data);

    // PropertyAlert is a shared event. Do not mark the event globally acknowledged:
    // every CAD/officer account gets its own dismissal receipt.
    return Response.json({ success: true, alert, receipt });
  } catch (error) {
    console.error('acknowledgePropertyAlert failed', error);
    return Response.json({ error: error?.message || 'Unable to dismiss property alert' }, { status: 500 });
  }
});
