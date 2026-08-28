import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
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
    const unitLabel = officer.unit_number ? `Unit ${officer.unit_number}` : ([officer.rank, officer.last_name].filter(Boolean).join(' ') || officer.full_name || officer.email);
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
      notes:`WELFARE ESCALATION: ${reason}. Initiated by ${me.full_name || me.email}.`,
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
      author_name:me.full_name || me.email || 'Command',
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
  } catch (error) {
    console.error('escalateCadWelfare failed', error);
    return Response.json({ error:error?.message || 'Unable to escalate welfare check' }, { status:500 });
  }
});