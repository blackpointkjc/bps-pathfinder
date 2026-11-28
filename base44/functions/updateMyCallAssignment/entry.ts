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
    if (['client','student','visitor','pending','support'].some(r=>roles.has(r)||primaryRole===r||String(user.user_type||'').toLowerCase()===r)) return Response.json({error:'Officer access required'},{status:403});
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
      if(call.manual_dismissed||call.time_cleared||['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(call.status||'').toLowerCase()))return Response.json({error:'Incident is no longer active'},{status:409});
      if(!roles.has('officer')&&primaryRole!=='officer')return Response.json({error:'Field officer role required to attach to an incident'},{status:403});
      if(user.dispatch_hold_new_calls===true)return Response.json({error:'Dispatch has placed new assignments on hold'},{status:409});
      const currentSessions=await base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:String(user.email||'').trim().toLowerCase()},'-last_update',10);
      const latest=(currentSessions||[])[0];
      const status=String(latest?.status||user.status||'').toLowerCase();
      const heartbeat=Date.parse(latest?.last_update||'');
      if(!latest||latest.session_active===false||!Number.isFinite(heartbeat)||Date.now()-heartbeat>15*60000||!['available','dispatched','enroute','on scene','busy','on patrol'].includes(status))return Response.json({error:'You must be an online field officer in an operational duty status to attach to a call'},{status:409});
      const currentId=String(latest.current_call_id||user.current_call_id||'');
      const queued=Boolean(currentId&&currentId!==String(call_id))||(['dispatched','enroute','on scene','busy'].includes(status)&&currentId!==String(call_id));

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
            status: queued?'pending':'accepted',
            ...(queued?{}:{accepted_at:now}),
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
      if(!queued)await base44.asServiceRole.entities.User.update(user.id, {
        status:'Dispatched',
        current_call_id: String(call_id),
        current_call_info: callInfo,
        last_updated: now,
      }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) {
        if (queued||session.session_active === false) continue;
        await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
          status:'Dispatched',
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
      return Response.json({ success: true, action, queued, assigned_units: assignedUnits, current_call_id: queued?currentId:String(call_id), current_call_info: queued?(latest.current_call_info||user.current_call_info||''):callInfo });
    }

    const db=base44.asServiceRole.entities;
    const [sessions,units]=await Promise.all([db.ActiveOfficer.filter({officer_email:user.email},'-last_update',10),db.Unit.filter({user_id:user.id},'-last_update_at',20)]);
    const aliases=new Set([user.id,user.email,...(sessions||[]).map(s=>s.id),...(units||[]).map(u=>u.id)].filter(Boolean).map(String));
    const assignedUnits=assigned.filter(id=>!aliases.has(String(id)));
    const records=await db.CallAssignment.filter({call_id},'-assigned_at',150);
    const active=records.filter(row=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
    if(!assigned.some(id=>aliases.has(String(id)))&&!active.some(row=>aliases.has(String(row.unit_id))))return Response.json({error:'You are not attached to this incident'},{status:403});
    for(const record of active.filter(row=>aliases.has(String(row.unit_id))))await db.CallAssignment.update(record.id,{status:'cleared',cleared_at:now});
    await db.DispatchCall.update(call_id,{assigned_units:assignedUnits});
    const remaining=active.filter(row=>!aliases.has(String(row.unit_id))).sort((a,b)=>Date.parse(a.assigned_at||'')-Date.parse(b.assigned_at||''));
    if(remaining.length&&!remaining.some(row=>row.role==='primary'))await db.CallAssignment.update(remaining[0].id,{role:'primary'});
    const currentId=String((sessions||[]).find(s=>s.session_active!==false)?.current_call_id||user.current_call_id||'');
    const leavingCurrentCall=currentId===String(call_id);
    let nextId=currentId;
    let nextStatus='';
    if(leavingCurrentCall){
      const groups=await Promise.all([...aliases].map(unit_id=>db.CallAssignment.filter({unit_id},'-assigned_at',300)));
      const nextRows=[...new Map(groups.flat().filter(row=>String(row.call_id)!==String(call_id)&&!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase())).map(row=>[String(row.call_id),row])).values()];
      const candidates=(await Promise.all(nextRows.map(async row=>({row,call:await db.DispatchCall.get(row.call_id).catch(()=>null)})))).filter(item=>item.call&&!item.call.manual_dismissed&&!item.call.time_cleared&&!['cleared','cancelled','canceled','closed','completed','resolved'].includes(String(item.call.status||'').toLowerCase()));
      const weight={critical:0,high:1,medium:2,low:3};
      candidates.sort((a,b)=>(weight[String(a.call.priority||'').toLowerCase()]??2)-(weight[String(b.call.priority||'').toLowerCase()]??2)||Date.parse(a.row.assigned_at||'')-Date.parse(b.row.assigned_at||''));
      const next=candidates[0]?.call;
      nextId=next?String(next.id):'';
      nextStatus=next?'Dispatched':'Available';
      const info=next?`${next.incident||'Call for service'} · ${next.location||''}`.slice(0,500):'';
      const patch={status:nextStatus,current_call_id:nextId,current_call_info:info,status_since:now};
      await db.User.update(user.id,{...patch,last_updated:now});
      for(const session of sessions||[])if(session.session_active!==false)await db.ActiveOfficer.update(session.id,{...patch,show_lights:false,last_update:now});
    }
    for(const unit of units||[])await db.Unit.update(unit.id,{...(leavingCurrentCall?{status:nextStatus}:{}),assigned_call_ids:(unit.assigned_call_ids||[]).filter(id=>String(id)!==String(call_id)),last_update_at:now});
    return Response.json({success:true,action,assigned_units:assignedUnits,current_call_id:nextId});

  } catch (error: any) {
    console.error('updateMyCallAssignment failed', error);
    return Response.json({ error: error?.message || 'Assignment update failed' }, { status: 500 });
  }
});