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
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access') && !supervisoryRank) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }

    const assignments = await base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 3000);
    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 3000);
    const users = await base44.asServiceRole.entities.User.list('-updated_date', 1500);
    const sessions = await base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1500);
    const callById = new Map((calls || []).map((c:any)=>[String(c.id), c]));
    const userById = new Map((users || []).map((u:any)=>[String(u.id), u]));
    const sessionByEmail = new Map<string,any>();
    for (const s of sessions || []) {
      const key = lower(s.officer_email);
      if (!key || sessionByEmail.has(key)) continue;
      sessionByEmail.set(key, s);
    }
    const now = Date.now();
    const board:any[] = [];
    for (const a of assignments || []) {
      if (['cleared','cancelled'].includes(lower(a.status))) continue;
      const call:any = callById.get(String(a.call_id));
      if (!call || ['cleared','cancelled','closed','completed','resolved'].includes(lower(call.status))) continue;
      const officer:any = userById.get(String(a.unit_id));
      if (!officer) continue;
      const session = sessionByEmail.get(lower(officer.email));
      const anchor = a.status === 'accepted' && a.accepted_at ? a.accepted_at : a.assigned_at;
      const elapsedSeconds = Math.max(0, Math.floor((now - new Date(anchor || 0).getTime()) / 1000));
      const pendingAckSeconds = Math.max(30, Number(call.welfare_acknowledgement_seconds || 120));
      const sceneWelfareSeconds = Math.max(60, Number(call.welfare_check_seconds || 900));
      const overdue = lower(a.status) === 'pending'
        ? elapsedSeconds >= pendingAckSeconds
        : lower(a.status) === 'on_scene' ? elapsedSeconds >= sceneWelfareSeconds : false;
      board.push({
        assignment_id:a.id, call_id:call.id, cad_number:call.agency_cad_number || call.bps_reference || call.call_id || call.id,
        incident:call.incident || 'Call for service', location:call.location || '', priority:call.priority || 'medium',
        unit_id:officer.id, unit_number:session?.unit_number || officer.unit_number || '', officer_name:officer.full_name || [officer.first_name, officer.last_name].filter(Boolean).join(' ') || officer.email,
        assignment_status:a.status || 'pending', assigned_at:a.assigned_at || '', accepted_at:a.accepted_at || '', elapsed_seconds:elapsedSeconds,
        overdue,
        officer_status:session?.status || officer.status || '',
        gps_updated_at:session?.gps_updated_at || '',
        gps_accuracy:session?.accuracy ?? null,
        latitude:session?.latitude ?? null,
        longitude:session?.longitude ?? null,
      });
    }
    board.sort((a,b)=>Number(b.overdue)-Number(a.overdue) || b.elapsed_seconds-a.elapsed_seconds);
    return Response.json({ success:true, board, overdue_count:board.filter(x=>x.overdue).length });
  } catch (error) {
    console.error('getSupervisorWelfareBoard failed', error);
    return Response.json({ error:error?.message || 'Unable to load welfare board' }, { status:500 });
  }
});