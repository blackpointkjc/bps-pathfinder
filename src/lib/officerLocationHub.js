import { base44 } from '@/api/base44Client';

// Single client gateway for Pathfinder live officer location.
// No page/component should read/write ActiveOfficer or invoke getOnDutyUnits/logLocation directly.
// All consumers share the same in-memory snapshot/in-flight request so opening
// several CAD/map panels does not multiply live-location backend reads.
const SNAPSHOT_TTL_MS = 5000;
const snapshotCache = new Map();
const inflight = new Map();

function cacheKey(locationOnly) { return locationOnly ? 'location' : 'full'; }
function clearSnapshotCache() { snapshotCache.clear(); }

export async function publishOfficerLocation(data = {}) {
  const response = await base44.functions.invoke('logLocation', data);
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  clearSnapshotCache();
  return payload;
}

export async function endOfficerLocationSession() {
  const response = await base44.functions.invoke('logLocation', { end_session: true });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  clearSnapshotCache();
  return payload;
}

export async function getOfficerLocationSnapshot({ locationOnly = false, force = false } = {}) {
  const key = cacheKey(locationOnly);
  const cached = snapshotCache.get(key);
  if (!force && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.payload;
  if (inflight.has(key)) return inflight.get(key);

  const request = base44.functions.invoke('getOnDutyUnits', locationOnly ? { location_only: true } : {})
    .then(response => {
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      snapshotCache.set(key, { at: Date.now(), payload });
      return payload;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export async function getOfficerLocationHistory(officerEmail) {
  if (!officerEmail) return [];
  const response = await base44.functions.invoke('getOnDutyUnits', { history_email: officerEmail });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.history) ? payload.history : [];
}

export function subscribeOfficerLocationChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  try {
    const unsubscribe = base44.entities.ActiveOfficer.subscribe(event => {
      clearSnapshotCache();
      listener(event);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}
