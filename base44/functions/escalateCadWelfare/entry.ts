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

const lower = (v: unknown) => String(v || '').trim().toLowerCase();

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

    const me = await base44.auth.me().then(__limitFullAccess).catch(() => null);
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const roles = new Set((me.additional_roles || []).map(lower));
    const rank = lower(me.rank);
    const supervisoryRank = ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank);
    const allowed = me.role === 'admin' || roles.has('supervisor') || roles.has('full_access') || supervisoryRank;
    if (!allowed) return Response.json({ error:'Supervisor access required' }, { status:403 });

    const body = await req.json().catch(() => ({}));
    const callId = String(body.call_id || '');
    const unitId = String(body.unit_id || '');
    const reason = String(body.reason || 'Officer welfare timer overdue').trim().slice(0, 500);
    if (!callId || !unitId) return Response.json({ error:'call_id and unit_id are required' }, { status:400 });

    const call = await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
    const officer = await base44.asServiceRole.entities.User.get(unitId).catch(() => null);
    if (!call || !officer) return Response.json({ error:'Call or officer not found' }, { status:404 });

    const now = new Date().toISOString();
    const cad = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const unitLabel = [officer.rank,officer.last_name||String(officer.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||officer.full_name||'Officer';
    const initiator=[me.rank,me.last_name||String(me.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||'Supervisor';
    const eventKey = `welfare-escalation:${callId}:${unitId}:${Math.floor(Date.now()/60000)}`;
    const prior = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key:eventKey }, '-created_date', 1).catch(()=>[]);
    if (prior?.length) return Response.json({ success:true, duplicate:true });

    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id:callId,
      incident_type:call.incident || 'Active call',
      location:call.location || '',
      old_status:call.status || '',
      new_status:call.status || '',
      unit_id:unitId,
      unit_name:unitLabel,
      notes:`WELFARE ESCALATION: ${reason}. Initiated by ${initiator}.`,
      event_key:eventKey,
      event_type:'welfare_overdue',
      announcement_text:`Emergency traffic. Welfare check overdue for ${unitLabel} at ${call.location || 'the active call'}. CAD number ${cad}.`,
      announcement_priority:'emergency',
      cad_number:String(cad),
      triggering_action:'escalateCadWelfare',
      audio_enabled:true,
      sensitive:false,
    });
    await base44.asServiceRole.entities.CallNote.create({
      call_id:callId,
      author_id:me.id,
      author_name:initiator,
      note:`[WELFARE ESCALATION] ${unitLabel}: ${reason}`,
      note_type:'hazard',
    }).catch(()=>null);

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 1500).catch(()=>[]);
    const recipients = (users || []).filter((u:any) => {
      const r = new Set((u.additional_roles || []).map(lower));
      return u.email && !u.termination_date && (u.role === 'admin' || u.role === 'dispatch' || u.dispatch_role || r.has('supervisor') || r.has('cad_access') || r.has('full_access'));
    });
    for (const recipient of recipients) {
      await base44.asServiceRole.entities.Notification.create({
        recipient_email:lower(recipient.email),
        type:'call_assignment',
        title:`Welfare Escalation · ${unitLabel}`,
        message:`${reason}. ${call.location || 'Active call'} · CAD ${cad}`,
        is_read:false,
        related_id:callId,
        priority:'critical',
        requires_acknowledgment:true,
        source_name:'CAD Welfare Monitor',
      }).catch(()=>null);
    }

    return Response.json({ success:true, escalated_at:now, recipients:recipients.length });
  } catch (error:any) {
    console.error('escalateCadWelfare failed', error);
    return Response.json({ error:error?.message || 'Unable to escalate welfare check' }, { status:500 });
  }
});