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

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const primaryRole = String(user.role || '').toLowerCase();
    const allowed = ['admin', 'dispatch', 'officer', 'supervisor'].includes(primaryRole)
      || roles.has('officer')
      || roles.has('cad_access')
      || roles.has('supervisor')
      || roles.has('full_access');
    if (!allowed) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const { call_id, action } = await req.json();
    if (!call_id || !['join', 'leave'].includes(action)) {
      return Response.json({ error: 'call_id and valid action are required' }, { status: 400 });
    }

    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    const now = new Date().toISOString();

    if (action === 'join') {
      const assignedUnits = assigned.includes(user.id) ? assigned : [...assigned, user.id];
      if (!assigned.includes(user.id)) {
        await Promise.all([
          base44.asServiceRole.entities.DispatchCall.update(call_id, {
            assigned_units: assignedUnits,
            status: call.status === 'New' ? 'Dispatched' : call.status,
            time_dispatched: call.time_dispatched || now,
          }),
          base44.asServiceRole.entities.CallAssignment.create({
            call_id,
            unit_id: user.id,
            role: assigned.length ? 'backup' : 'primary',
            assigned_at: now,
            status: 'accepted',
          }),
        ]);
        const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
        const officer = user.unit_number ? `Unit ${user.unit_number}` : ([user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || 'Officer');
        const isAdditional = assigned.length > 0;
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id,
          incident_type: call.incident || '',
          location: call.location || '',
          old_status: call.status || '',
          new_status: call.status === 'New' ? 'Dispatched' : call.status,
          unit_id: user.id,
          unit_name: officer,
          notes: isAdditional ? 'Officer joined as additional unit' : 'Officer accepted primary assignment',
          event_key: `call:${call_id}:self-assignment:${user.id}:${now}`,
          event_type: isAdditional ? 'additional_unit' : 'unit_dispatched',
          announcement_text: `${isAdditional ? 'Additional unit assigned' : 'Unit dispatched'}. ${officer}. CAD number ${cadNumber}.`,
          announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
          cad_number: String(cadNumber),
          triggering_action: 'updateMyCallAssignment.join',
          audio_enabled: true,
          sensitive: false,
        });
      }

      const callInfo = `${call.incident || 'Call for service'} · ${call.location || ''}`.slice(0, 500);
      await base44.asServiceRole.entities.User.update(user.id, {
        current_call_id: String(call_id),
        current_call_info: callInfo,
        last_updated: now,
      }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) {
        if (session.session_active === false) continue;
        await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
          current_call_id: String(call_id),
          current_call_info: callInfo,
          show_lights: false,
          last_update: now,
        }).catch(() => null);
      }
      const units = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 20).catch(() => []);
      for (const unit of units || []) {
        await base44.asServiceRole.entities.Unit.update(unit.id, {
          assigned_call_ids: Array.from(new Set([...(unit.assigned_call_ids || []).map(String), String(call_id)])),
          last_update_at: now,
        }).catch(() => null);
      }
      return Response.json({ success: true, action, assigned_units: assignedUnits, current_call_id: String(call_id), current_call_info: callInfo });
    }

    const assignedUnits = assigned.filter((id: string) => id !== user.id);
    await base44.asServiceRole.entities.DispatchCall.update(call_id, { assigned_units: assignedUnits });

    // Audit cleanup is non-critical to the field action. Keep the response fast and
    // let any matching assignment rows settle without blocking the officer UI.
    const records = await base44.asServiceRole.entities.CallAssignment.filter({ call_id, unit_id: user.id }).catch(() => []);
    await Promise.all((records || [])
      .filter((record: any) => record.status !== 'cleared')
      .map((record: any) => base44.asServiceRole.entities.CallAssignment.update(record.id, {
        status: 'cleared',
        cleared_at: now,
      }).catch(() => null)));

    const leavingCurrentCall = String(user.current_call_id || '') === String(call_id);
    if (leavingCurrentCall) {
      await base44.asServiceRole.entities.User.update(user.id, {
        current_call_id: '',
        current_call_info: '',
        last_updated: now,
      }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) {
        if (session.session_active === false) continue;
        await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
          current_call_id: '',
          current_call_info: '',
          show_lights: false,
          last_update: now,
        }).catch(() => null);
      }
    }
    const units = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 20).catch(() => []);
    for (const unit of units || []) {
      await base44.asServiceRole.entities.Unit.update(unit.id, {
        assigned_call_ids: (unit.assigned_call_ids || []).filter((id: string) => String(id) !== String(call_id)),
        last_update_at: now,
      }).catch(() => null);
    }

    return Response.json({ success: true, action, assigned_units: assignedUnits, current_call_id: leavingCurrentCall ? '' : String(user.current_call_id || '') });
  } catch (error: any) {
    console.error('updateMyCallAssignment failed', error);
    return Response.json({ error: error?.message || 'Assignment update failed' }, { status: 500 });
  }
});