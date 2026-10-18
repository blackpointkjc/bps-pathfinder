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

    const [directAssignments, ownedUnits, sessions, lastShifts] = await Promise.all([
      base44.asServiceRole.entities.CallAssignment.filter({unit_id:me.id},'-assigned_at',250),
      base44.asServiceRole.entities.Unit.filter({user_id:me.id},'-last_update_at',20).catch(()=>[]),
      base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:me.email},'-last_update',10).catch(()=>[]),
      base44.asServiceRole.entities.TimeEntry.filter({officer_email:me.email},'-clock_in',5).catch(()=>[]),
    ]);
    const aliases=[String(me.id),String(me.email||''),...(ownedUnits||[]).map((row:any)=>String(row.id)),...(sessions||[]).map((row:any)=>String(row.id))].filter(Boolean);
    const alternate=aliases.filter(id=>id!==String(me.id));
    const extraAssignments=(await Promise.all(alternate.map(id=>base44.asServiceRole.entities.CallAssignment.filter({unit_id:id},'-assigned_at',60).catch(()=>[])))).flat();
    const assignments=[...new Map([...(directAssignments||[]),...extraAssignments].map((row:any)=>[row.id,row])).values()];
    const openShift=(lastShifts||[]).find((row:any)=>row.clock_in&&!row.clock_out&&row.archived!==true);
    const shiftStart=openShift ? Date.parse(openShift.clock_in)-5*60*1000 : Date.now()-12*60*60*1000;
    const recentCutoff=Number.isFinite(shiftStart)?shiftStart:Date.now()-12*60*60*1000;
    const welfareChecks = await base44.asServiceRole.entities.OfficerWelfareCheck.filter({ officer_email: lower(me.email) }, '-requested_at', 100).catch(() => []);
    const activeAssignments=(assignments||[]).filter((a:any)=> !['cleared','cancelled','canceled'].includes(lower(a.status))
      && Number.isFinite(Date.parse(a.assigned_at||a.created_date||''))
      && Date.parse(a.assigned_at||a.created_date||'')>=recentCutoff);
    // CAD's assigned_units is a second explicit assignment source when a
    // legacy dispatcher wrote the call but missed its CallAssignment row.
    const linkedCalls=(await Promise.all(aliases.map(id=>base44.asServiceRole.entities.DispatchCall.filter({assigned_units:{$in:[id]}},'-created_date',40).catch(()=>[])))).flat()
      .filter((call:any)=>!isTerminalCall(call) && Date.parse(call.time_dispatched||call.created_date||'')>=recentCutoff);
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
    for (const call of calls) {
      const assignment = activeAssignments.find((a: any) => String(a.call_id) === String(call.id));
      const notes = await base44.asServiceRole.entities.CallNote.filter({ call_id: call.id }, '-created_date', 100).catch(() => []);
      queue.push({
        ...call,
        assignment:assignment || {status:'pending',assigned_at:call.time_dispatched||call.created_date,unit_id:me.id,call_id:call.id},
        dispatch_notes: notes || [],
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