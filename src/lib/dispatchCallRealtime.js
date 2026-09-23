import { base44 } from '@/api/base44Client';
import { clearActiveDispatchCallMemoryCache, dedupeOperationalCalls } from '@/lib/activeDispatchCalls';

const listeners = new Set();
let entityUnsubscribe = null;
let connectError = null;

const HIDDEN = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
const statusOf = call => String(call?.status || '').trim().toLowerCase();

function startEntitySubscription() {
  if (entityUnsubscribe || connectError) return;
  try {
    const unsubscribe = base44.entities.DispatchCall.subscribe(event => {
      clearActiveDispatchCallMemoryCache();
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
  maxAgeMs = 8 * 60 * 60 * 1000,
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

  return dedupeOperationalCalls(next).slice(0, limit);
}
