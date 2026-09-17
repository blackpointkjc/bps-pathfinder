import { base44 } from '@/api/base44Client';

const listeners = new Set();
let entityUnsubscribe = null;
let connectError = null;

const HIDDEN = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
const statusOf = call => String(call?.status || '').trim().toLowerCase();

function startEntitySubscription() {
  if (entityUnsubscribe || connectError) return;
  try {
    const unsubscribe = base44.entities.DispatchCall.subscribe(event => {
      for (const listener of [...listeners]) {
        try { listener(event); } catch (error) { console.warn('[CAD realtime] listener failed', error); }
      }
    });
    entityUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch (error) {
    connectError = error;
    console.warn('[CAD realtime] subscription unavailable; fallback refresh remains active', error?.message || error);
  }
}

function stopEntitySubscriptionIfIdle() {
  if (listeners.size || !entityUnsubscribe) return;
  try { entityUnsubscribe(); } catch {}
  entityUnsubscribe = null;
  connectError = null;
}

export function subscribeDispatchCallChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  startEntitySubscription();
  return () => {
    listeners.delete(listener);
    stopEntitySubscriptionIfIdle();
  };
}

export function applyDispatchCallEvent(currentCalls, event, {
  hideClosed = true,
  maxAgeMs = 65 * 60 * 1000,
  limit = 250,
} = {}) {
  const current = Array.isArray(currentCalls) ? currentCalls : [];
  const type = String(event?.type || '').toLowerCase();
  const data = event?.data;
  const eventId = String(event?.id || data?.id || '');
  if (!eventId || !['create', 'update', 'delete'].includes(type)) return current;

  let next;
  if (type === 'delete') {
    next = current.filter(call => String(call?.id || '') !== eventId);
  } else {
    const normalized = { ...(data || {}), id: data?.id || event?.id };
    const index = current.findIndex(call => String(call?.id || '') === eventId);
    if (index >= 0) {
      next = [...current];
      next[index] = { ...current[index], ...normalized };
    } else {
      next = [normalized, ...current];
    }
  }

  const now = Date.now();
  next = next.filter(call => {
    if (!call?.id) return false;
    if (hideClosed && (HIDDEN.has(statusOf(call)) || call.manual_dismissed === true)) return false;
    if (!maxAgeMs) return true;
    const created = Date.parse(call.created_date || '');
    const received = Date.parse(call.time_received || '');
    const reliable = created && received && Math.abs(created - received) < 24 * 60 * 60 * 1000 ? received : (created || received);
    return !Number.isFinite(reliable) || reliable <= 0 || now - reliable <= maxAgeMs;
  });

  const unique = new Map();
  for (const call of next) {
    const upstream = call.external_call_id || String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1] || call.id;
    const existing = unique.get(upstream);
    const existingOfficial = Boolean(existing?.official_cad_verified && (existing?.agency_cad_number || existing?.call_id));
    const candidateOfficial = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
    if (!existing || (!existingOfficial && candidateOfficial)) unique.set(upstream, call);
  }

  return [...unique.values()]
    .sort((a, b) => Date.parse(b.time_received || b.created_date || '') - Date.parse(a.time_received || a.created_date || ''))
    .slice(0, limit);
}
