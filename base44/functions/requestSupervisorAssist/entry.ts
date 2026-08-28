import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
function distanceMiles(lat1:number, lon1:number, lat2:number, lon2:number) {
  const r = 3958.8, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function isSupervisor(u:any) {
  const roles = new Set((u?.additional_roles || []).map(lower));
  const rank = lower(u?.rank);
  return u?.role === 'admin' || roles.has('supervisor') || roles.has('full_access') || ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const callId = String(body.call_id || '');
    if (!callId) return Response.json({ error: 'call_id is required' }, { status: 400 });
    const call = await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 750);
    const active = await base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 500);
    const assignments = await base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 1200);
    const now = Date.now();
    const freshCutoff = now - 15 * 60 * 1000;
    const activeByEmail = new Map<string,any>();
    for (const row of active || []) {
      const email = lower(row.officer_email);
      if (!email || activeByEmail.has(email)) continue;
      activeByEmail.set(email, row);
    }

    const requesterSession = activeByEmail.get(lower(me.email));
    const originLat = Number(call.latitude ?? requesterSession?.latitude);
    const originLon = Number(call.longitude ?? requesterSession?.longitude);
    if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) return Response.json({ error: 'No reliable call/requester coordinates available for closest-supervisor assignment' }, { status: 409 });

    const liveCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 300).catch(()=>[]);
    const liveCallIds = new Set((liveCalls || []).filter((c:any)=>!['cleared','cancelled','closed','resolved','completed'].includes(lower(c.status))).map((c:any)=>String(c.id)));
    const busyIds = new Set((assignments || []).filter((a:any) => String(a.call_id) !== callId && liveCallIds.has(String(a.call_id)) && !['cleared','cancelled'].includes(lower(a.status))).map((a:any)=>String(a.unit_id)));
    const already = new Set((assignments || []).filter((a:any)=>String(a.call_id)===callId && !['cleared','cancelled'].includes(lower(a.status))).map((a:any)=>String(a.unit_id)));

    const existingSupervisor = (users || []).find((u:any) => already.has(String(u.id)) && isSupervisor(u));
    if (existingSupervisor) {
      const existingLast = String(existingSupervisor.last_name || existingSupervisor.full_name || '').trim().split(/\s+/).pop();
      const existingRank = String(existingSupervisor.rank || 'Supervisor').trim();
      const existingLabel = [existingRank, existingLast].filter(Boolean).join(' ') || 'Supervisor';
      return Response.json({ success:true, assigned:true, already_assigned:true, supervisor:{ id:existingSupervisor.id, name:existingLabel, unit_number:existingSupervisor.unit_number || '', distance_miles:null } });
    }

    const candidates:any[] = [];
    for (const u of users || []) {
      if (!isSupervisor(u) || !u.email || u.termination_date || already.has(String(u.id)) || busyIds.has(String(u.id))) continue;
      const session = activeByEmail.get(lower(u.email));
      const gpsAt = new Date(session?.gps_updated_at || 0).getTime();
      const lat = Number(session?.latitude), lon = Number(session?.longitude), accuracy = Number(session?.accuracy);
      const status = lower(session?.status || u.status);
      if (!session || session.session_active === false || gpsAt < freshCutoff || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(accuracy) || accuracy > 150) continue;
      if (!['available','signed in','signed_in'].includes(status)) continue;
      candidates.push({ user:u, session, distance:distanceMiles(originLat,originLon,lat,lon) });
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const chosen = candidates[0];
    if (!chosen) return Response.json({ success:false, assigned:false, reason:'No available supervisor with fresh GPS is currently eligible.' });

    const nowIso = new Date().toISOString();
    const existing = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: callId, unit_id: chosen.user.id }, '-assigned_at', 5).catch(()=>[]);
    let assignment = (existing || []).find((a:any)=>!['cleared','cancelled'].includes(lower(a.status)));
    if (!assignment) assignment = await base44.asServiceRole.entities.CallAssignment.create({
      call_id: callId, unit_id: chosen.user.id, role:'backup', assigned_at:nowIso, status:'pending',
      description:`Supervisor requested by ${me.full_name || me.email}. Automatically assigned as closest eligible supervisor.`
    });

    const assignedUnits = Array.from(new Set([...(call.assigned_units || []).map(String), String(chosen.user.id)]));
    await base44.asServiceRole.entities.DispatchCall.update(callId, { assigned_units: assignedUnits });
    await base44.asServiceRole.entities.User.update(chosen.user.id, { status:'Dispatched', current_call_id:callId, current_call_info:`Supervisor assist · ${call.agency_cad_number || call.bps_reference || call.call_id || call.id}`, status_since:nowIso, last_updated:nowIso }).catch(()=>null);
    await base44.asServiceRole.entities.ActiveOfficer.update(chosen.session.id, { status:'Dispatched', current_call_info:`Supervisor assist · ${call.incident || 'Active call'}`, last_update:nowIso }).catch(()=>null);
    const unitRows = await base44.asServiceRole.entities.Unit.filter({ user_id: chosen.user.id }, '-last_update_at', 20).catch(()=>[]);
    for (const unit of unitRows || []) {
      await base44.asServiceRole.entities.Unit.update(unit.id, {
        status:'Dispatched',
        assigned_call_ids:Array.from(new Set([...(unit.assigned_call_ids || []).map(String), callId])),
        last_update_at:nowIso,
      }).catch(()=>null);
    }

    const cad = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const supervisorLast = String(chosen.user.last_name || chosen.user.full_name || '').trim().split(/\s+/).pop();
    const supervisorRank = String(chosen.user.rank || 'Supervisor').trim();
    const label = [supervisorRank, supervisorLast].filter(Boolean).join(' ') || 'Supervisor';
    const eventKey = `supervisor-request:${callId}:${assignment.id}`;
    const prior = await base44.asServiceRole.entities.CallStatusLog.filter({ event_key:eventKey }, '-created_date', 1).catch(()=>[]);
    if (!prior?.length) await base44.asServiceRole.entities.CallStatusLog.create({
      call_id:callId, incident_type:call.incident || '', location:call.location || '', old_status:call.status || '', new_status:call.status || 'Dispatched',
      unit_id:chosen.user.id, unit_name:label, notes:`Supervisor requested by ${me.full_name || me.email}. Closest available supervisor assigned automatically.`,
      event_key:eventKey, event_type:'additional_unit', announcement_text:`Supervisor requested. ${label}, respond to ${call.location || 'the active call'}. CAD number ${cad}.`, announcement_priority:'high', cad_number:String(cad), triggering_action:'requestSupervisorAssist', audio_enabled:true, sensitive:false
    });
    await base44.asServiceRole.entities.CallNote.create({ call_id:callId, author_id:me.id, author_name:me.full_name || me.email || 'Requester', note:`[SUPERVISOR REQUEST] Closest available supervisor assigned: ${label} (${chosen.distance.toFixed(2)} mi).`, note_type:'update' }).catch(()=>null);
    await base44.asServiceRole.entities.Notification.create({ recipient_email:lower(chosen.user.email), type:'call_assignment', title:`Supervisor Assist · ${cad}`, message:`You were automatically assigned as the closest available supervisor to ${call.location || 'an active call'}.`, is_read:false, related_id:callId, priority:'high', requires_acknowledgment:true, source_name:'CAD Supervisor Request' }).catch(()=>null);

    return Response.json({ success:true, assigned:true, supervisor:{ id:chosen.user.id, name:label, unit_number:chosen.user.unit_number || '', distance_miles:Number(chosen.distance.toFixed(2)) }, assignment_id:assignment.id });
  } catch (error) {
    console.error('requestSupervisorAssist failed', error);
    return Response.json({ error:error?.message || 'Unable to request supervisor' }, { status:500 });
  }
});