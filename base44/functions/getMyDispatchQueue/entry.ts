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

    const [ownedUnits, sessions] = await Promise.all([
      base44.asServiceRole.entities.Unit.filter({user_id:me.id},'-last_update_at',20).catch(()=>[]),
      base44.asServiceRole.entities.ActiveOfficer.filter({officer_email:me.email},'-last_update',10).catch(()=>[]),

    ]);
    const aliases=[String(me.id),String(me.email||''),...(ownedUnits||[]).map((row:any)=>String(row.id)),...(sessions||[]).map((row:any)=>String(row.id))].filter(Boolean);
    // One bounded roster snapshot per queue refresh, rather than unsupported
    // $in filters plus N+1 reads and side-effect writes for each assigned call.
    const [allRecentAssignments,allRecentCalls,allRecentLogs,directory]=await Promise.all([
      base44.asServiceRole.entities.CallAssignment.list('-assigned_at',500),
      base44.asServiceRole.entities.DispatchCall.list('-created_date',600),
      base44.asServiceRole.entities.CallStatusLog.list('-created_date',650),
      base44.asServiceRole.entities.User.list('-updated_date',350),
    ]);
    const ownedAssignmentGroups = await Promise.all(aliases.map(id => base44.asServiceRole.entities.CallAssignment.filter({unit_id:id},'-assigned_at',300)));
    const assignments = [...new Map(ownedAssignmentGroups.flat().map((a:any)=>[String(a.id),a])).values()];
    const linkedRecords=(allRecentCalls||[]).filter((call:any)=>Array.isArray(call.assigned_units)&&call.assigned_units.some((id:any)=>aliases.includes(String(id))));

    const welfareChecks = await base44.asServiceRole.entities.OfficerWelfareCheck.filter({ officer_email: lower(me.email) }, '-requested_at', 100).catch(() => []);
    const activeAssignments=(assignments||[]).filter((a:any)=> !['cleared','cancelled','canceled'].includes(lower(a.status)));
    // CAD's assigned_units is a second explicit assignment source when a
    // legacy dispatcher wrote the call but missed its CallAssignment row.
    const linkedCalls=(linkedRecords||[]).filter((call:any)=>!isTerminalCall(call));
    const linkedById=new Map(linkedCalls.map((call:any)=>[String(call.id),call]));
    const callIds=[...new Set([...activeAssignments.map((a:any)=>String(a.call_id||'')),...linkedById.keys()].filter(Boolean))];
    const callById=new Map((allRecentCalls||[]).map((call:any)=>[String(call.id),call]));
    await Promise.all(callIds.filter(id=>!linkedById.has(id)&&!callById.has(id)).map(async id=>{
      const row=await base44.asServiceRole.entities.DispatchCall.get(id).catch(()=>null);
      if(row)callById.set(id,row);
    }));
    const calls:any[]=[];
    for(const callId of callIds){
      const call=linkedById.get(callId)||callById.get(callId);
      // Never change other officers' assignments in a *read* operation.
      // Actual CAD closure/clearance owns assignment cleanup.
      if(call&&!isTerminalCall(call))calls.push(call);
    }

    const queue: any[] = [];
    const actors=new Map((directory||[]).map((u:any)=>[String(u.id),u]));
    const named=(u:any)=>[u?.rank,u?.last_name||String(u?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ')||'CAD';
    for (const call of calls) {
      const assignment = activeAssignments.find((a: any) => String(a.call_id) === String(call.id));
      // Unit queue data stays independent of the dispatcher call's global
      // status. Notes are loaded separately through sharedCadTimeline, the
      // *only* shared live stream between the two views.
      const logs=(allRecentLogs||[]).filter((row:any)=>String(row.call_id)===String(call.id));
      const allCallAssignments=(allRecentAssignments||[]).filter((row:any)=>String(row.call_id)===String(call.id));
      const activeForCall=(allCallAssignments||[]).filter((a:any)=>!['cleared','cancelled','canceled'].includes(lower(a.status)));
      const namedPrimary=activeForCall.find((a:any)=>lower(a.role)==='primary')||activeForCall.slice().sort((a:any,b:any)=>Date.parse(a.assigned_at||0)-Date.parse(b.assigned_at||0))[0];
      const latestOwnEvent=(logs||[]).find((log:any)=>aliases.includes(String(log.unit_id))&&['unit_on_scene','unit_enroute','unit_acknowledged'].includes(String(log.event_type||''))&&Date.parse(log.created_date||'')>=Date.parse(assignment?.assigned_at||call.time_dispatched||call.created_date||''));
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