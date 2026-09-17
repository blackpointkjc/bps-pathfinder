import { base44 } from '@/api/base44Client';
import { withRequestTimeout } from '@/lib/requestTimeout';

const CACHE_KEY = 'bps-cad-active-calls-v2';
const CACHE_MAX_AGE_MS = 90 * 60 * 1000;
let inFlight = null;
let memoryRows = null;
let memoryRowsAt = 0;
const MEMORY_DEDUPE_MS = 10_000;

function readLastGoodCalls() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.calls)) return [];
    if (Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE_MS) return [];
    return cached.calls;
  } catch {
    return [];
  }
}

function saveLastGoodCalls(calls) {
  if (!Array.isArray(calls) || calls.length === 0) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      calls,
    }));
  } catch {
    // The live result remains authoritative when storage is unavailable.
  }
}

/**
 * Load operational CAD rows through one bounded backend read. Concurrent dashboard
 * consumers share the same promise. If the function is unavailable during an
 * update, fall back to the entity SDK; if both fail, preserve the last confirmed
 * queue instead of turning a transient request failure into an empty screen.
 */
export async function loadActiveDispatchCallRows(limit = 100) {
  if (Array.isArray(memoryRows) && Date.now() - memoryRowsAt < MEMORY_DEDUPE_MS) {
    return memoryRows.slice(0, limit);
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let primaryError;
    try {
      const response = await withRequestTimeout(
        base44.functions.invoke('getActiveDispatchCalls', { limit }),
        12000,
        'Active call feed',
      );
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      if (!Array.isArray(payload.calls)) throw new Error('Active call feed returned an invalid response.');
      saveLastGoodCalls(payload.calls);
      memoryRows = payload.calls;
      memoryRowsAt = Date.now();
      return payload.calls;
    } catch (error) {
      primaryError = error;
    }

    try {
      const calls = await withRequestTimeout(
        base44.entities.DispatchCall.list('-created_date', limit),
        15000,
        'Active call entity fallback',
      );
      if (!Array.isArray(calls)) throw new Error('Active call fallback returned an invalid response.');
      saveLastGoodCalls(calls);
      memoryRows = calls;
      memoryRowsAt = Date.now();
      return calls;
    } catch (fallbackError) {
      const cached = readLastGoodCalls();
      if (cached.length) return cached;
      throw fallbackError || primaryError;
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export { readLastGoodCalls };
