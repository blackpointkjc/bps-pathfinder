import { base44 } from '@/api/base44Client';

// Single client gateway for Pathfinder live officer location.
// No page/component should read/write ActiveOfficer or invoke getOnDutyUnits/logLocation directly.
// All consumers share the same in-memory snapshot/in-flight request so opening
// several CAD/map panels does not multiply live-location backend reads.
// Realtime ActiveOfficer subscriptions clear this cache immediately on an actual
// location/status change. A 15-second read cache therefore reduces duplicate map,
// health-check, and CAD fetches without delaying genuine live updates.
const SNAPSHOT_TTL_MS = 15000;
const MAX_USABLE_GPS_ACCURACY_METERS = 2000;
const snapshotCache = new Map();
const inflight = new Map();

function cacheKey(locationOnly) { return locationOnly ? 'location' : 'full'; }
function clearSnapshotCache() { snapshotCache.clear(); }

function validCoords(lat, lng) {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined
    && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180
    && !(Number(lat) === 0 && Number(lng) === 0);
}

function scrubUnitLocation(unit = {}) {
  const clean = { ...unit };
  const accuracy = Number(clean.accuracy);
  const liveUsable = validCoords(clean.latitude, clean.longitude)
    && Number.isFinite(accuracy)
    && accuracy <= MAX_USABLE_GPS_ACCURACY_METERS;
  if (!liveUsable) {
    if (validCoords(clean.latitude, clean.longitude)) clean.rejected_live_accuracy = Number.isFinite(accuracy) ? accuracy : null;
    clean.latitude = null;
    clean.longitude = null;
    clean.heading = null;
    clean.speed = 0;
    clean.gps_updated_at = null;
  }

  const coarseAccuracy = Number(clean.coarse_accuracy);
  if (validCoords(clean.coarse_latitude, clean.coarse_longitude)
      && (!Number.isFinite(coarseAccuracy) || coarseAccuracy > MAX_USABLE_GPS_ACCURACY_METERS)) {
    clean.coarse_latitude = null;
    clean.coarse_longitude = null;
    clean.coarse_gps_updated_at = null;
  }

  const lastAccuracy = Number(clean.last_known_accuracy);
  if (validCoords(clean.last_known_latitude, clean.last_known_longitude)
      && Number.isFinite(lastAccuracy)
      && lastAccuracy > MAX_USABLE_GPS_ACCURACY_METERS) {
    clean.last_known_latitude = null;
    clean.last_known_longitude = null;
    clean.last_gps_updated_at = null;
  }
  return clean;
}

function isLiveUnit(unit = {}) {
  return unit?.session_active === true
    && String(unit?.status || '').trim().toLowerCase() !== 'out of service';
}

function scrubSnapshot(payload = {}) {
  return {
    ...payload,
    // The shared client gateway is another hard boundary: stale backend payloads
    // cannot leak signed-out officers into CAD, Navigation, or supervisor maps.
    units: Array.isArray(payload.units) ? payload.units.map(scrubUnitLocation).filter(isLiveUnit) : payload.units,
    users: Array.isArray(payload.users) ? payload.users.map(scrubUnitLocation).filter(isLiveUnit) : payload.users,
  };
}

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
      const rawPayload = response?.data || response || {};
      if (rawPayload.error) throw new Error(rawPayload.error);
      // Defense in depth: never let a legacy backend/client return an IP/network
      // estimate (for example ±50,000m) to any Pathfinder map as a live officer fix.
      const payload = scrubSnapshot(rawPayload);
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
