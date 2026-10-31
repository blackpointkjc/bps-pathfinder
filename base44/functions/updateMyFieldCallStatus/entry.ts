import { isOutOfOffice } from './absencePolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending') || ['client','student','pending'].includes(String(user.user_type || '').toLowerCase());
    if (blocked) return Response.json({ error: 'Officer access required' }, { status: 403 });

    const { call_id, status, disposition = '' } = await req.json().catch(() => ({}));
    const officerRecord=await base44.asServiceRole.entities.User.get(user.id);
    if(status!=='Cleared'&&isOutOfOffice(officerRecord))return Response.json({error:'Out of office: contact dispatch for coverage.'},{status:409});
    const allowedStatuses = new Set(['Acknowledged', 'Enroute', 'On Scene', 'Cleared']);
    if (!call_id || !allowedStatuses.has(status)) return Response.json({ error: 'Valid call and status are required' }, { status: 400 });
    const call = await base44.asServiceRole.entities.DispatchCall.get(call_id);
    if (!call) return Response.json({ error: 'Call not found' }, { status: 404 });

    // Never short-circuit a clear request. Even if the CAD call was already marked
    // Cleared by another unit/dispatcher, this officer's assignment and assigned_units
    // membership still must be closed so the call cannot return to their queue.
    // CAD's overall call status is independent of every unit's assignment.
    // Never skip an officer status transition because ANOTHER officer already
    // marked the incident Enroute/On Scene.


    const [ownedUnits, ownedSessions]=await Promise.all([
      base44.asServiceRole.entities.Unit.filter({user_id:user.id},'-last_update_at',30).catch(()=>[]),
      base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:user.email},'-last_update',15).catch(()=>[]),
    ]);
    const aliases=[String(user.id),String(user.email||''),...(ownedUnits||[]).map((row:any)=>String(row.id)),...(ownedSessions||[]).map((row:any)=>String(row.id))];
    // Combined call_id + unit_id filters were returning no matches for valid
    // legacy assignments: the officer state changed but the CallAssignment
    // remained ACCEPTED. Query by call and filter canonical unit aliases locally.
    const allForCall=await base44.asServiceRole.entities.CallAssignment.filter({call_id},'-assigned_at',150);
    const assignmentRows=(allForCall||[]).filter((row:any)=>aliases.includes(String(row.unit_id)));
    const hasActiveAssignment=assignmentRows.some((row:any)=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
    const assigned = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    const assignedIds = assigned.map((id:any) => String(id));
    if (!assignedIds.some((id:string)=>aliases.includes(id)) && !hasActiveAssignment && user.role !== 'admin') {
      return Response.json({ error: 'You must be assigned to this call before changing its status' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const unitAlreadyOnScene=assignmentRows.some((a:any)=>String(a.status||'').toLowerCase()==='on_scene')
      || ((ownedSessions||[]).some((session:any)=>String(session.current_call_id||'')===String(call_id)&&String(session.status||'').toLowerCase()==='on scene'));
    if(unitAlreadyOnScene && ['Acknowledged','Enroute'].includes(status))return Response.json({success:true,status:'On Scene',duplicate_transition:true,message:'Your unit is already On Scene. Earlier stages will not overwrite arrival.'});
    const assignments = assignmentRows;
    const assignmentStatus = status === 'Acknowledged' ? 'accepted' : status === 'Enroute' ? 'enroute' : status === 'On Scene' ? 'on_scene' : 'cleared';
    for (const assignment of (assignments || []).filter((row:any)=>!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()))) {
      const patch: Record<string, unknown> = { status: assignmentStatus };
      if (status === 'Acknowledged' && !assignment.accepted_at) patch.accepted_at = now;
      if (status === 'Cleared') patch.cleared_at = now;
      if (status === 'Cleared' && disposition) patch.description = `${assignment.description || ''} Disposition: ${String(disposition).trim()}`.trim().slice(0, 1000);
      await base44.asServiceRole.entities.CallAssignment.update(assignment.id, patch);
    }

    // Unit acknowledgement, travel and arrival belong solely to that officer's
    // CallAssignment and officer presence. DispatchCall.status is a *dispatch*
    // lifecycle, not a mirror of whichever officer clicked a button last.
    // Only an actual final-unit clearance can close the shared CAD call.
    if (status==='Cleared') {
      const otherActive=(allForCall||[]).some((a:any)=>!aliases.includes(String(a.unit_id))&&!['cleared','cancelled','canceled'].includes(String(a.status||'').toLowerCase()));
      const otherLegacyAssigned=assignedIds.some((id:string)=>!aliases.includes(id));
      const patch:Record<string,unknown>={assigned_units:assignedIds.filter((id:string)=>!aliases.includes(id))};
      if(!otherActive&&!otherLegacyAssigned){
        patch.status='Cleared';patch.time_cleared=now;patch.manual_dismissed=true;patch.manual_dismissed_at=now;
        if(disposition)patch.disposition=String(disposition).trim().slice(0,1000);
      }
      await base44.asServiceRole.entities.DispatchCall.update(call_id,patch);
    }

    const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
    const officer = [user.rank,user.last_name||String(user.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ') || user.full_name || 'Officer';

    // Keep every operational status source synchronized. Supervisor views read the
    // live ActiveOfficer stream, while other CAD surfaces may read User/Unit.
    if (status !== 'Cleared') {
      const officerStatus = status === 'Acknowledged' ? 'Dispatched' : status;
      const callInfo = `${call.incident || 'Call for service'} · ${call.location || ''}`.slice(0, 500);
      await base44.asServiceRole.entities.User.update(user.id, {
        status: officerStatus,
        current_call_id: call_id,
        current_call_info: callInfo,
        status_since: now,
        last_updated: now,
      }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) {
        if (session.session_active === false) continue;
        await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
          status: officerStatus,
          current_call_id: String(call_id),
          current_call_info: callInfo,
          show_lights: false,
          last_update: now,
        }).catch(() => null);
      }
      const unitRows = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 20).catch(() => []);
      for (const unit of unitRows || []) {
        await base44.asServiceRole.entities.Unit.update(unit.id, {
          status: officerStatus,
          assigned_call_ids: Array.from(new Set([...(unit.assigned_call_ids || []).map(String), String(call_id)])),
          last_update_at: now,
        }).catch(() => null);
      }
    }
    const eventType = status === 'Acknowledged' ? 'unit_acknowledged' : status === 'Enroute' ? 'unit_enroute' : status === 'On Scene' ? 'unit_on_scene' : 'unit_cleared';
    const wording = status === 'Acknowledged'
      ? `${officer} acknowledged the assignment. CAD number ${cadNumber}.`
      : status === 'Enroute'
        ? `${officer} en route. CAD number ${cadNumber}.`
        : status === 'On Scene'
          ? `${officer} on scene. CAD number ${cadNumber}.`
          : `${officer} cleared from the call. CAD number ${cadNumber}.`;
    await base44.asServiceRole.entities.CallStatusLog.create({
      call_id,
      incident_type: call.incident || '',
      location: call.location || '',
      old_status: call.status || '',
      new_status: status,
      unit_id: user.id,
      unit_name: officer,
      notes: 'Verified officer field status transition',
      latitude: call.latitude,
      longitude: call.longitude,
      event_key: `call:${call_id}:unit:${user.id}:status:${status}:${now}`,
      event_type: eventType,
      announcement_text: wording,
      announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
      cad_number: String(cadNumber),
      triggering_action: 'updateMyFieldCallStatus',
      audio_enabled: true,
      sensitive: false,
    });

    await base44.asServiceRole.entities.CallNote.create({
      call_id,author_id:user.id,author_name:officer,
      note:`[${status.toUpperCase()}] ${officer}${status==='Cleared'&&disposition?` — ${String(disposition).trim()}`:''}.`,
      note_type:status==='On Scene'?'arrival':status==='Cleared'?'clear':'update',
    }).catch((error:any)=>console.error('Unable to mirror unit action into shared notes',error?.message));

    if (status === 'Cleared') {
      // Move the officer directly to the next active queued assignment instead of
      // briefly marking them Available when another dispatched call is waiting.
      const remainingAssignments = await base44.asServiceRole.entities.CallAssignment.filter({ unit_id: user.id }, '-assigned_at', 500).catch(() => []);
      const activeRemaining = (remainingAssignments || []).filter((a: any) => String(a.call_id) !== String(call_id) && !['cleared','cancelled'].includes(String(a.status || '').toLowerCase()));
      const priorityWeight: Record<string, number> = { critical:0, high:1, medium:2, low:3 };
      const candidates: any[] = [];
      for (const assignment of activeRemaining) {
        const queuedCall = await base44.asServiceRole.entities.DispatchCall.get(assignment.call_id).catch(() => null);
        if (!queuedCall || ['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(queuedCall.status || '').toLowerCase())) continue;
        candidates.push({ assignment, call:queuedCall });
      }
      candidates.sort((a,b) => {
        const p = (priorityWeight[String(a.call.priority || '').toLowerCase()] ?? 2) - (priorityWeight[String(b.call.priority || '').toLowerCase()] ?? 2);
        if (p) return p;
        return new Date(a.assignment.assigned_at || a.call.time_received || a.call.created_date || 0).getTime() - new Date(b.assignment.assigned_at || b.call.time_received || b.call.created_date || 0).getTime();
      });
      const next = candidates[0];
      const nextCad = next ? (next.call.agency_cad_number || next.call.bps_reference || next.call.call_id || next.call.id) : '';
      const nextStatus = next ? 'Dispatched' : 'Available';
      const nextInfo = next ? `${next.call.incident || 'Call for service'} · ${next.call.location || ''}`.slice(0, 500) : '';
      await base44.asServiceRole.entities.User.update(user.id, { status: nextStatus, current_call_id: next?.call?.id || '', current_call_info: nextInfo, status_since: now, last_updated: now }).catch(() => null);
      const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 10).catch(() => []);
      for (const session of sessions || []) if (session.session_active !== false) await base44.asServiceRole.entities.ActiveOfficer.update(session.id, { status: nextStatus, current_call_id: next?.call?.id || '', current_call_info: nextInfo, show_lights: false, last_update: now }).catch(() => null);
      if (next) {
        await base44.asServiceRole.entities.CallNote.create({ call_id:next.call.id, author_id:user.id, author_name:officer, note:`[QUEUE] Previous call cleared. This is now the officer's next active call (${nextCad}).`, note_type:'update' }).catch(()=>null);
      }
      return Response.json({ success:true, status, next_call_id:next?.call?.id || '', next_call_number:nextCad || '' });
    }

    return Response.json({ success: true, status });
  } catch (error: any) {
    console.error('updateMyFieldCallStatus failed', error);
    return Response.json({ error: error?.message || 'Unable to update call status' }, { status: 500 });
  }
});