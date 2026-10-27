import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
const terminalCall = (call: any) => ['cleared','cancelled','canceled','closed','completed','resolved'].includes(lower(call?.status)) || call?.manual_dismissed === true;
const validCoord = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const roles = new Set((me.additional_roles || []).map(lower));
    const rank = lower(me.rank);
    const supervisoryRank = ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(rank);
    if (me.role !== 'admin' && lower(me.role) !== 'supervisor' && me.is_supervisor !== true && !roles.has('supervisor') && !roles.has('full_access') && !supervisoryRank) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }

    // One bounded snapshot powers the entire supervisor overview. Read the
    // independent sources together so the board does not wait through five serial
    // database round trips before it can paint.
    const [calls, allAssignments, welfareChecks, statusLogs, users, dutyEntries] = await Promise.all([
      base44.functions.invoke('getActiveDispatchCalls', {limit:500}).then((response:any) => { const data=response?.data||response; if(data?.error||!Array.isArray(data?.calls))throw new Error(data?.error||'Active call feed unavailable'); return data.calls; }),
      base44.asServiceRole.entities.CallAssignment.list('-assigned_at', 600),
      base44.asServiceRole.entities.OfficerWelfareCheck.list('-requested_at', 200),
      base44.asServiceRole.entities.CallStatusLog.list('-created_date', 300),
      base44.asServiceRole.entities.User.list('-updated_date', 750),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 750),
    ]);
    const activeCalls = (calls || []).filter((call:any) => !terminalCall(call));
    const activeCallIds = new Set(activeCalls.map((call:any) => String(call.id)));
    const assignments = (allAssignments || [])
      .filter((a:any) => activeCallIds.has(String(a.call_id)) && !['cleared','cancelled'].includes(lower(a.status)));
    // Officer GPS/status is intentionally NOT loaded here. All live-location data
    // comes from the canonical workforce/location feeds.

    const callById = new Map(activeCalls.map((c:any)=>[String(c.id), c]));
    const userById = new Map((users || []).map((u:any)=>[String(u.id), u]));
    const latestActions=new Map<string,any>();
    for(const log of (statusLogs||[])){
      if(!log.call_id||!log.unit_id||!['unit_on_scene','unit_enroute','unit_acknowledged','unit_cleared'].includes(String(log.event_type||'')))continue;
      const key=`${log.call_id}|${log.unit_id}`;
      if(!latestActions.has(key))latestActions.set(key,log);
    }
    const now = Date.now();
    const openDutyByEmail=new Map<string,any>();
    for(const entry of (dutyEntries||[]).filter((row:any)=>row.clock_in&&!row.clock_out&&row.archived!==true)) {
      const email=lower(entry.officer_email);
      if(email && !openDutyByEmail.has(email))openDutyByEmail.set(email,entry);
    }
    const onDutyEmails = new Set(openDutyByEmail.keys());
    const lastConfirmedWelfare=new Map<string,any>();
    for(const check of (welfareChecks||[])){
      if(lower(check.status)!=='ok'||!check.response_at)continue;
      const key=`${check.call_id}|${check.unit_id}`;
      const previous=lastConfirmedWelfare.get(key);
      if(!previous||Date.parse(check.response_at)>Date.parse(previous.response_at))lastConfirmedWelfare.set(key,check);
    }
    const board:any[] = [];
    for (const a of assignments || []) {
      const call:any = callById.get(String(a.call_id));
      const officer:any = userById.get(String(a.unit_id));
      if (!call || !officer) continue;
      // Historical or off-duty assignments remain in CAD but are not current welfare escalations.
      const assignedAtMs = new Date(a.assigned_at || 0).getTime();
      const currentShift = openDutyByEmail.get(lower(officer.email));
      const started = currentShift?.clock_in ? Date.parse(currentShift.clock_in)-2*60*60*1000 : now-12*60*60*1000;
      if (!onDutyEmails.has(lower(officer.email)) || !Number.isFinite(assignedAtMs) || assignedAtMs < started || assignedAtMs > now+60000) continue;
      const action=latestActions.get(`${call.id}|${officer.id}`);
      const trustedAction=action&&Date.parse(action.created_date||'')>=Date.parse(a.assigned_at||'');
      const currentStatus=trustedAction&&action.event_type==='unit_on_scene'?'on_scene'
        :trustedAction&&action.event_type==='unit_enroute'?'enroute':a.status;
      const lastWelfare=lastConfirmedWelfare.get(`${call.id}|${officer.id}`);
      const anchor = lower(currentStatus)==='on_scene' ? (
        [a.assigned_at, trustedAction&&action.event_type==='unit_on_scene'?action.created_date:null,lastWelfare?.response_at]
          .filter(Boolean).sort((a:any,b:any)=>Date.parse(a)-Date.parse(b)).at(-1) || a.assigned_at
      ) : lower(currentStatus)==='accepted' && a.accepted_at ? a.accepted_at : a.assigned_at;
      const elapsedSeconds = Math.max(0, Math.floor((now - new Date(anchor || 0).getTime()) / 1000));
      const pendingAckSeconds = Math.max(30, Number(call.welfare_acknowledgement_seconds || 120));
      const sceneWelfareSeconds = Math.max(60, Number(call.welfare_check_seconds || 900));
      const overdue = lower(a.status) === 'pending'
        ? elapsedSeconds >= pendingAckSeconds
        : lower(currentStatus) === 'on_scene' ? elapsedSeconds >= sceneWelfareSeconds : false;
      board.push({
        assignment_id:a.id, call_id:call.id, cad_number:call.agency_cad_number || call.bps_reference || call.call_id || call.id,
        incident:call.incident || 'Call for service', location:call.location || '', priority:call.priority || 'medium',
        unit_id:officer.id, unit_number:officer.unit_number || '', officer_email:lower(officer.email),
        officer_name:[String(officer.rank || '').trim(), String(officer.last_name || '').trim() || String(officer.full_name || '').trim().split(/\s+/).pop()].filter(Boolean).join(' ') || 'Officer',
        assignment_status:currentStatus || 'pending', assigned_at:a.assigned_at || '', accepted_at:a.accepted_at || '', elapsed_seconds:elapsedSeconds, overdue,
      });
    }
    board.sort((a,b)=>Number(b.overdue)-Number(a.overdue) || b.elapsed_seconds-a.elapsed_seconds);

    const displayByEmail: Record<string,string> = {};
    for (const officer of users || []) {
      const email = lower(officer.email);
      if (!email) continue;
      const last = String(officer.last_name || '').trim() || String(officer.full_name || '').trim().split(/\s+/).pop() || '';
      displayByEmail[email] = [String(officer.rank || '').trim(), last].filter(Boolean).join(' ') || 'Officer';
    }

    const activeWelfareChecks = (welfareChecks || []).filter((check:any) => activeCallIds.has(String(check.call_id)) && lower(check.status) === 'pending')
      .map((check:any) => ({ ...check, elapsed_seconds: Math.max(0, Math.floor((now - new Date(check.requested_at || 0).getTime()) / 1000)) }));

    const supervisorUserIds = new Set((users || []).filter((u:any) => {
      const itemRoles = new Set((u.additional_roles || []).map(lower));
      const itemRank = lower(u.rank);
      return u.role === 'admin' || lower(u.role) === 'supervisor' || u.is_supervisor === true || itemRoles.has('supervisor') || itemRoles.has('full_access') || ['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel'].includes(itemRank);
    }).map((u:any) => String(u.id)));
    const activeSupervisorCallIds = new Set((assignments || []).filter((a:any) => supervisorUserIds.has(String(a.unit_id))).map((a:any) => String(a.call_id)));
    const pendingSupervisorRequests = (statusLogs || [])
      .filter((log:any) => log.triggering_action === 'requestSupervisorAssist.pending' && activeCallIds.has(String(log.call_id)) && !activeSupervisorCallIds.has(String(log.call_id)))
      .map((log:any) => {
        const call:any = callById.get(String(log.call_id));
        return {
          id:log.id,
          call_id:log.call_id,
          cad_number:log.cad_number || call?.agency_cad_number || call?.bps_reference || call?.call_id || log.call_id,
          incident:call?.incident || log.incident_type || 'Call for service',
          location:call?.location || log.location || '',
          requested_by:log.unit_name || 'Officer',
          requested_at:log.created_date || '',
          elapsed_seconds:Math.max(0, Math.floor((now - new Date(log.created_date || 0).getTime()) / 1000)),
          status:'pending',
        };
      });

    return Response.json({
      success:true,
      board,
      welfare_checks:activeWelfareChecks,
      supervisor_requests:pendingSupervisorRequests,
      display_by_email:displayByEmail,
      active_calls:activeCalls,
      overdue_count:board.filter(x=>x.overdue).length,
      generated_at:new Date().toISOString(),
    });
  } catch (error:any) {
    console.error('getSupervisorWelfareBoard failed', error);
    return Response.json({ error:error?.message || 'Unable to load supervisor operations snapshot' }, { status:500 });
  }
});