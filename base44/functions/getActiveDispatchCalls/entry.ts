import { createClientFromRequest } from 'npm:@base44/sdk';

const readCache = new Map<string, { at:number; rows:any[]; pending?:Promise<any[]> }>();
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const TERMINAL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);

function callTimestamp(call: any) {
  const created = call?.created_date ? new Date(call.created_date).getTime() : 0;
  const received = call?.time_received ? new Date(call.time_received).getTime() : 0;
  if (Number.isFinite(received) && received > 0 && Number.isFinite(created) && created > 0 && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
  if (Number.isFinite(created) && created > 0) return created;
  return Number.isFinite(received) && received > 0 ? received : 0;
}

// Active calls are a rolling one-hour view. Rows whose source never published a
// closure previously stayed on the board for days.
const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

function isVisibleActiveCall(call: any) {
  if (call?.manual_dismissed === true || TERMINAL_STATUSES.has(lower(call?.status))) return false;
  const stamp = callTimestamp(call);
  return stamp > 0 && Date.now() - stamp <= ACTIVE_WINDOW_MS;
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
    const limit = Math.max(50, Math.min(500, Number(body?.limit || 100)));
    const cacheKey = (req.headers.get('Base44-App-Id') || '') + ':' + (req.headers.get('X-Data-Env') || 'prod');
    let cached = readCache.get(cacheKey);
    if (!cached || Date.now() - cached.at >= 3000) {
      if (!cached?.pending) {
        cached = { at:0, rows:[], pending:(async () => {
          const counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key:'dispatch_call' }, '-updated_date', 1))[0];
          if (!Array.isArray(counter?.active_source_snapshot)) throw new Error('Live source verification is pending. Refresh after the next source sync.');
          const snapshot = counter.active_source_snapshot;
          const external = (row: any) => String(row.external_call_id || String(row.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1] || '');
          const legacy = (row: any) => !row.agency || !row.time_received || !row.incident ? '' : [String(row.agency || '').trim().toUpperCase(), String(row.time_received || ''), String(row.incident || '').trim().toUpperCase().replace(/\s+/g,' ')].join('|');
          const keys = new Set(snapshot.map(external).filter(Boolean));
          const fallbackKeys = new Set(snapshot.map(legacy).filter(Boolean));
          const times = [...new Set(snapshot.map((row:any)=>row.time_received).filter(Boolean))];
          const rows = await base44.asServiceRole.entities.DispatchCall.filter({
            manual_dismissed: {$ne:true},
            status: {$nin:['Cleared','Cancelled','Canceled','Closed','Completed','Resolved','cleared','cancelled','canceled','closed','completed','resolved']},
            $or:[{external_call_id:{$in:[...keys]}},{time_received:{$in:times}},
              {$and:[{source_channel:{$exists:false}},{external_call_id:{$exists:false}}]},
              {assigned_units:{$exists:true,$ne:[]}}, {source:'pulsepoint'}],
          }, '-created_date', 1000);
          return rows.filter((row:any) => {
            const imported = lower(row.source) !== 'pulsepoint' && (/grac|website/i.test(String(row.source_channel || '')+' '+external(row)) || ['richmond','henrico','chesterfield'].includes(lower(row.source)));
            return !imported || (row.assigned_units || []).length > 0 || keys.has(external(row)) || fallbackKeys.has(legacy(row));
          });
        })() };
        readCache.set(cacheKey, cached);
      }
      try { cached.rows = await cached.pending!; cached.at = Date.now(); cached.pending = undefined; }
      catch (error) { readCache.delete(cacheKey); throw error; }
    }
    const rows = cached.rows;
    const calls = (Array.isArray(rows) ? rows : [])
      .filter(call => isVisibleActiveCall(call))
      .sort((a, b) => callTimestamp(b) - callTimestamp(a))
      .slice(0, limit);

    return Response.json({
      success: true,
      calls,
      filtered_out: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - calls.length),
      status_based: true,
      fetched_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('getActiveDispatchCalls failed', error);
    return Response.json(
      { error: error?.message || 'Unable to load active dispatch calls' },
      { status: Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(String(error?.message)) ? 429 : 500 },
    );
  }
});