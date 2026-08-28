import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (v: unknown) => String(v || '').trim().toLowerCase();
const terminal = new Set(['cleared','cancelled','canceled','closed','resolved','completed']);
const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ unit_id: me.id }, '-assigned_at', 500).catch(() => []);
    const welfareChecks = await base44.asServiceRole.entities.OfficerWelfareCheck.filter({ officer_email: lower(me.email) }, '-requested_at', 100).catch(() => []);
    const activeAssignments = (assignments || []).filter((a: any) => !['cleared','cancelled'].includes(lower(a.status)));
    const callIds = [...new Set(activeAssignments.map((a: any) => String(a.call_id || '')).filter(Boolean))];
    const calls: any[] = [];
    for (const callId of callIds) {
      const call = await base44.asServiceRole.entities.DispatchCall.get(callId).catch(() => null);
      if (call && !terminal.has(lower(call.status))) calls.push(call);
    }

    const queue: any[] = [];
    for (const call of calls) {
      const assignment = activeAssignments.find((a: any) => String(a.call_id) === String(call.id));
      const notes = await base44.asServiceRole.entities.CallNote.filter({ call_id: call.id }, '-created_date', 100).catch(() => []);
      queue.push({
        ...call,
        assignment,
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
  } catch (error) {
    console.error('getMyDispatchQueue failed', error);
    return Response.json({ error: error?.message || 'Unable to load officer dispatch queue' }, { status: 500 });
  }
});