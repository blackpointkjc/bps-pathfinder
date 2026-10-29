import { base44 } from '@/api/base44Client';
import { withRequestTimeout } from '@/lib/requestTimeout';

const CACHE_KEY = 'bps-cad-active-calls-v5';
const CACHE_MAX_AGE_MS = 65 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
let inFlight = null;
let memoryRows = null;
let memoryRowsAt = 0;
const MEMORY_DEDUPE_MS = 3_000;
let requestBackoffUntil = 0;
const BACKEND_FEED_LIMIT = 500;
const SEMANTIC_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function normalizedText(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function callTimestamp(call) {
  const created = new Date(call?.created_date || 0).getTime();
  const received = new Date(call?.time_received || 0).getTime();
  if (Number.isFinite(received) && Number.isFinite(created) && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
  return Number.isFinite(created) && created > 0 ? created : (Number.isFinite(received) ? received : 0);
}

function isVisibleActiveCall(call) {
  const status = String(call?.status || '').trim().toLowerCase();
  // A long-running incident remains active until an explicit closure. Its
  // received time is not an expiry time, even when the upstream feed is delayed.
  return call?.manual_dismissed !== true && !TERMINAL_STATUSES.has(status);
}

function filterVisibleActiveCalls(rows = []) {
  return (rows || []).filter(isVisibleActiveCall);
}

function preferCall(current, candidate) {
  if (!current) return candidate;
  const score = call =>
    (call?.official_cad_verified && (call?.agency_cad_number || call?.call_id) ? 8 : 0)
    + (call?.agency_cad_number ? 4 : 0)
    + (call?.external_call_id ? 2 : 0)
    + (Array.isArray(call?.assigned_units) && call.assigned_units.length ? 2 : 0)
    + (call?.latitude && call?.longitude ? 1 : 0);
  const currentScore = score(current);
  const candidateScore = score(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  return callTimestamp(candidate) >= callTimestamp(current) ? candidate : current;
}

export function dedupeOperationalCalls(rows = []) {
  const sorted = filterVisibleActiveCalls(rows).sort((a, b) => callTimestamp(b) - callTimestamp(a));
  const stable = new Map();
  const unkeyed = [];

  for (const call of sorted) {
    const descriptionKey = String(call?.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
    const stableKey = call?.external_call_id
      || (call?.agency_cad_number ? `${call.source || call.agency || ''}:cad:${call.agency_cad_number}` : '')
      || descriptionKey
      || '';
    if (!stableKey) {
      unkeyed.push(call);
      continue;
    }
    stable.set(stableKey, preferCall(stable.get(stableKey), call));
  }

  const candidates = [...stable.values(), ...unkeyed].sort((a, b) => callTimestamp(b) - callTimestamp(a));
  const result = [];
  for (const call of candidates) {
    const incident = normalizedText(call?.incident);
    const location = normalizedText(call?.location);
    const stamp = callTimestamp(call);
    const duplicateIndex = result.findIndex(existing =>
      incident
      && location
      && normalizedText(existing?.incident) === incident
      && normalizedText(existing?.location) === location
      && Math.abs(callTimestamp(existing) - stamp) <= SEMANTIC_DUPLICATE_WINDOW_MS
    );
    if (duplicateIndex >= 0) {
      result[duplicateIndex] = preferCall(result[duplicateIndex], call);
    } else {
      result.push(call);
    }
  }
  return result.sort((a, b) => callTimestamp(b) - callTimestamp(a));
}

function readLastGoodCalls() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.calls)) return [];
    if (Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE_MS) return [];
    return filterVisibleActiveCalls(cached.calls);
  } catch {
    return [];
  }
}

function saveLastGoodCalls(calls) {
  if (!Array.isArray(calls)) return;
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
  if (Date.now() < requestBackoffUntil) {
    if (Array.isArray(memoryRows)) return filterVisibleActiveCalls(memoryRows).slice(0, limit);
    const cached = readLastGoodCalls();
    if (cached.length) return cached.slice(0, limit);
    throw new Error('Active calls are waiting for the API retry window.');
  }
  if (inFlight) return (await inFlight).slice(0, limit);

  inFlight = (async () => {
    let primaryError;
    try {
      // Read the operational queue through the service-role function. Direct entity
      // reads depend on each viewer's RLS and were leaving Command Dashboard blank
      // for valid CAD/supervisor accounts even though active calls existed.
      const response = await withRequestTimeout(
        // Every consumer uses the same backend request shape. Components ask for
        // 100/200/500 rows, which previously produced separate cache keys and
        // three network calls for the same feed during one page load.
        base44.functions.invoke('getActiveDispatchCalls', { limit: BACKEND_FEED_LIMIT }),
        12000,
        'Active call feed',
      );
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      const calls = payload.calls;
      if (!Array.isArray(calls)) throw new Error('Active call feed returned an invalid response.');
      const deduped = dedupeOperationalCalls(calls);
      saveLastGoodCalls(deduped);
      memoryRows = deduped;
      const serverReadAt = Date.parse(payload.fetched_at || '');
      memoryRowsAt = Number.isFinite(serverReadAt) ? Math.min(serverReadAt, Date.now()) : Date.now();
      return deduped;
    } catch (error) {
      primaryError = error;
      if (Number(error?.status || error?.response?.status) === 429 || /429|rate limit|too many requests/i.test(String(error?.message || error?.response?.data?.error || ''))) {
        requestBackoffUntil = Date.now() + 20_000;
        if (Array.isArray(memoryRows)) return filterVisibleActiveCalls(memoryRows);
        const cached = readLastGoodCalls();
        if (cached.length) return cached;
        throw error;
      }
    }

    // Never fall back to an unverified raw entity list: historical open statuses
    // are exactly what inflated the active board to the 500-row response cap.
    const cached = readLastGoodCalls();
    if (cached.length) return cached;
    throw primaryError;
  })().finally(() => {
    inFlight = null;
  });

  return (await inFlight).slice(0, limit);
}

export function clearActiveDispatchCallMemoryCache() {
  memoryRows = null;
  memoryRowsAt = 0;
}

export { readLastGoodCalls };

export const getActiveDispatchCallReadTime = () => memoryRowsAt;
