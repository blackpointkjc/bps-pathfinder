import { releaseClosedCall } from '../updateCadCallStatus/releaseClosedCall.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
const terminal = new Set(['cleared','cancelled','canceled','closed','resolved','completed']);
// The officer's CallAssignment is the canonical queue lifecycle. An upstream/public
// time_closed timestamp must not remove a Pathfinder assignment before the officer
// or dispatcher actually clears/unassigns it.
const isTerminalCall = (call: any) => terminal.has(lower(call?.status)) || call?.manual_dismissed === true;
const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [ownedUnits, sessions, lastShifts] = await Promise.all([
      base44.asServiceRole.entities.Unit.filter({user_id:me.id},'-last_update_at',20).catch(()=>[]),
      base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:me.email},'-last_update',10).catch(()=>[]),
      base44.asServiceRole.entities.TimeEntry.filter({officer_email:me.email},'-clock_in',5).catch(()=>[]),
    ]);
    const aliases=[String(me.id),String(me.email||''),...(ownedUnits||[]).map((row:any)=>String(row.id)),...(sessions||[]).map((row:any)=>String(row.id))].filter(Boolean);
    const [assignments, linkedRecords] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({unit_id:{$in:aliases}},'-assigned_at',300),
      base44.asServiceRole.entities.DispatchCall.filter({assigned_units:{$in:aliases}},'-created_date',80),
    ]);
    const openShift=(lastShifts||[]).find((row:any)=>row.clock_in&&!row.clock_out&&row.archived!==true);
    const shiftStart=openShift ? Date.parse(openShift.clock_in)-2*60*60*1000 : Date.now()-12*60*60*1000;
    const recentCutoff=Number.isFinite(shiftStart)?shiftStart:Date.now()-12*60*60*1000;
    const welfareChecks = await base44.asServiceRole.entities.OfficerWelfareCheck.filter({ officer_email: lower(me.email) }, '-requested_at', 100).catch(() => []);
    const activeAssignments=(assignments||[]).filter((a:any)=> !['cleared','cancelled','canceled'].includes(lower(a.status))
      && Number.isFinite(Date.parse(a.assigned_at||a.created_date||''))
      && Date.parse(a.assigned_at||a.created_date||'')>=recentCutoff);
    // CAD's assigned_units is a second explicit assignment source when a
    // legacy dispatcher wrote the call but missed its CallAssignment row.
    const linkedCalls=(linkedRecords||[]).filter((call:any)=>!isTerminalCall(call) && Date.parse(call.time_dispatched||call.created_date||'')>=recentCutoff);
    const linkedById=new Map(linkedCalls.map((call:any)=>[String(call.id),call]));
    const callIds = [...new Set([...activeAssignments.map((a: any) => String(a.call_id || '')),...linkedById.keys()].filter(Boolean))];
    const calls: any[] = [];
    for (const callId of callIds) {
      const call = linkedById.get(callId) || await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
      if (!call || isTerminalCall(call)) {
        // Reconcile stale officer assignments when dispatch/upstream already closed
        // or archived the CAD call. Leaving CallAssignment active is what caused a
        // cleared call to reappear in the officer queue on the next refresh.
        if (call) await releaseClosedCall(base44.asServiceRole.entities, call);
        const stale = activeAssignments.filter((a: any) => String(a.call_id) === String(callId));
        const closedAt = new Date().toISOString();
        await Promise.all(stale.map((assignment: any) =>
          base44.asServiceRole.entities.CallAssignment.update(assignment.id, {
            status: 'cleared',
            cleared_at: assignment.cleared_at || closedAt,
          }).catch(() => null)
        ));
        continue;
      }
      calls.push(call);
    }

    const queue: any[] = [];
    const directory=await base44.asServiceRole.entities.User.list('-updated_date',500);
    const actors=new Map(directory.map((u:any)=>[String(u.id),u]));
    const named=(u:any)=>[u?.rank,u?.last_name||String(u?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||'CAD';
    for (const call of calls) {
      const assignment = activeAssignments.find((a: any) => String(a.call_id) === String(call.id));
      // Unit queue data stays independent of the dispatcher call's global
      // status. Notes are loaded separately through sharedCadTimeline, the
      // *only* shared live stream between the two views.
      const [logs,allCallAssignments]=await Promise.all([
        base44.asServiceRole.entities.CallStatusLog.filter({call_id:call.id},'-created_date',45),
        base44.asServiceRole.entities.CallAssignment.filter({call_id:call.id},'-assigned_at',80),
      ]);
      const activeForCall=(allCallAssignments||[]).filter((a:any)=>!['cleared','cancelled','canceled'].includes(lower(a.status)));
      const namedPrimary=activeForCall.find((a:any)=>lower(a.role)==='primary')||activeForCall.slice().sort((a:any,b:any)=>Date.parse(a.assigned_at||0)-Date.parse(b.assigned_at||0))[0];
      const latestOwnEvent=(logs||[]).find((log:any)=>String(log.unit_id)===String(me.id)&&['unit_on_scene','unit_enroute','unit_acknowledged'].includes(String(log.event_type||''))&&Date.parse(log.created_date||'')>=Date.parse(assignment?.assigned_at||call.time_dispatched||call.created_date||''));
      const ownStatus=latestOwnEvent?.event_type==='unit_on_scene'?'on_scene':latestOwnEvent?.event_type==='unit_enroute'?'enroute':assignment?.status||'pending';
      queue.push({
        ...call,
        assignment:{...(assignment||{assigned_at:call.time_dispatched||call.created_date,unit_id:me.id,call_id:call.id}),status:ownStatus},
        assigned_officers:activeForCall.map((a:any)=>({
          unit_id:a.unit_id,officer_name:actors.has(String(a.unit_id))?named(actors.get(String(a.unit_id))):'Assigned Officer',
          role:String(a.id)===String(namedPrimary?.id)?'primary':'additional',status:a.status||'pending',assigned_at:a.assigned_at,
        })).sort((a:any,b:any)=>(a.role==='primary'?-1:1)-(b.role==='primary'?-1:1)),
        welfare_check: (welfareChecks || []).find((check:any) => String(check.call_id) === String(call.id) && lower(check.status) === 'pending') || null,
        queue_priority: priorityWeight[lower(call.priority)] ?? 2,
      });
    }

    queue.sort((a, b) => {
      const p = Number(a.queue_priority) - Number(b.queue_priority);
      if (p) return p;
      const at = new Date(a.assignment?.assigned_at || a.time_received || a.created_date || 0).getTime();
      const bt = new Date(b.assignment?.assigned_at || b.time_received || b.created_date || 0).getTime();
      return at - bt;
    });

    return Response.json({ success: true, queue, current_call_id: queue[0]?.id || '', count: queue.length });
  } catch (error:any) {
    console.error('getMyDispatchQueue failed', error);
    return Response.json({ error: error?.message || 'Unable to load officer dispatch queue' }, { status: 500 });
  }
});