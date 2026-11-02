const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).trim().toLowerCase()));
    const allowed = String(user.role || '').trim().toLowerCase() === 'dispatch' || user.dispatch_role === true || roles.has('dispatch');
    if (!allowed) return Response.json({ error: 'Dispatcher role required' }, { status: 403 });

    const { call_id, priority, reason } = await req.json().catch(() => ({}));
    const allowedPriorities = new Set(['low', 'medium', 'high', 'critical']);
    if (!call_id || !allowedPriorities.has(priority)) return Response.json({ error: 'Valid call and priority are required' }, { status: 400 });

    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });
    if (call.priority === priority && call.priority_override === true) return Response.json({ success: true, priority, duplicate_transition: true });

    const weights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const upgraded = weights[priority] > weights[call.priority || 'medium'];
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.DispatchCall.update(call_id, { priority, priority_override: true });
    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;

    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id,
      incident_type: call.incident || '',
      location: call.location || '',
      old_status: call.status || '',
      new_status: call.status || '',
      unit_name: user.unit_number || user.full_name || user.email || 'Dispatch',
      notes: reason || `Priority changed from ${call.priority || 'medium'} to ${priority}`,
      event_key: `call:${call_id}:priority:${call.priority || 'medium'}:${priority}:${now}`,
      event_type: 'priority_upgraded',
      announcement_text: upgraded ? `Call priority upgraded to ${priority}. CAD number ${cadNumber}.` : '',
      announcement_priority: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'normal',
      cad_number: String(cadNumber),
      triggering_action: 'updateCadCallPriority',
      audio_enabled: upgraded,
      sensitive: false,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DispatchCall',
      entity_id: call_id,
      action: upgraded ? 'priority_upgrade' : 'priority_change',
      actor_id: user.id,
      actor_name: user.full_name || user.email,
      before_value: JSON.stringify({ priority: call.priority }),
      after_value: JSON.stringify({ priority }),
      notes: reason || '',
      timestamp: now,
    }).catch(() => null);

    return Response.json({ success: true, priority, upgraded });
  } catch (error: any) {
    console.error('updateCadCallPriority failed', error);
    return Response.json({ error: error?.message || 'Unable to update call priority' }, { status: 500 });
  }
});
