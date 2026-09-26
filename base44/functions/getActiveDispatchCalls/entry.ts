import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const ACTIVE_MAX_AGE_MS = 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);

function callTimestamp(call: any) {
  const created = call?.created_date ? new Date(call.created_date).getTime() : 0;
  const received = call?.time_received ? new Date(call.time_received).getTime() : 0;
  if (Number.isFinite(received) && received > 0 && Number.isFinite(created) && created > 0 && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
  if (Number.isFinite(created) && created > 0) return created;
  return Number.isFinite(received) && received > 0 ? received : 0;
}

function isVisibleActiveCall(call: any, now = Date.now()) {
  if (TERMINAL_STATUSES.has(lower(call?.status))) return false;
  const stamp = callTimestamp(call);
  return stamp > 0 && now - stamp < ACTIVE_MAX_AGE_MS;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((me.additional_roles || []).map((role: string) => lower(role)));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending')
      || ['client', 'student', 'pending'].includes(lower(me.user_type))
      || ['client', 'student'].includes(lower(me.rank));
    if (blocked) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(50, Math.min(200, Number(body?.limit || 100)));
    const rows = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 1000);
    const now = Date.now();
    const calls = (Array.isArray(rows) ? rows : [])
      .filter(call => isVisibleActiveCall(call, now))
      .sort((a, b) => callTimestamp(b) - callTimestamp(a))
      .slice(0, limit);

    return Response.json({
      success: true,
      calls,
      filtered_out: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - calls.length),
      max_age_minutes: 60,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('getActiveDispatchCalls failed', error);
    return Response.json(
      { error: error?.message || 'Unable to load active dispatch calls' },
      { status: 500 },
    );
  }
});
