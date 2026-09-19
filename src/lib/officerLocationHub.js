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
const GPS_PUBLISH_MIN_MS = 35000;
const HEARTBEAT_PUBLISH_MIN_MS = 120000;
const PUBLISH_LOCK_PREFIX = 'bps:pathfinder:location-publish:';
const PUBLISH_STAMP_PREFIX = 'bps:pathfinder:location-publish-at:';
const snapshotCache = new Map();
const inflight = new Map();
let localPublishPromise = Promise.resolve();

function cacheKey(locationOnly, includeLastKnown) { if (includeLastKnown) return 'admin-location'; return locationOnly ? 'location' : 'full'; }
function clearSnapshotCache() { snapshotCache.clear(); }

function publishKind(data = {}) {
  if (data.end_session === true) return 'end';
  const hasGps = Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude));
  return hasGps && data.heartbeat_only !== true ? 'gps' : 'heartbeat';
}

function publishStampKey(email, kind) {
  return `${PUBLISH_STAMP_PREFIX}${String(email || 'unknown').trim().toLowerCase()}:${kind}`;
}

function lastPublishAt(email, kind) {
  try { return Number(localStorage.getItem(publishStampKey(email, kind)) || 0) || 0; }
  catch { return 0; }
}

function notePublishAt(email, kind, at = Date.now()) {
  try { localStorage.setItem(publishStampKey(email, kind), String(at)); } catch {}
}

async function withPublishLock(email, task) {
  const lockName = `${PUBLISH_LOCK_PREFIX}${String(email || 'unknown').trim().toLowerCase()}`;
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(lockName, { mode: 'exclusive' }, task);
  }
  localPublishPromise = localPublishPromise.catch(() => null).then(task);
  return localPublishPromise;
}

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
  // Fresh sessions are live. A retained active session may also remain visible as
  // an explicitly stale/last-known marker so supervisors do not lose the officer
  // from the map while a background heartbeat or GPS fix is recovering.
  return unit?.session_active === true || unit?.presence_online === true || unit?.map_visible === true;
}

function scrubSnapshot(payload = {}) {
  return {
    ...payload,
    // Full snapshots expose an enriched `units` roster for the status board,
    // including signed-out/OOS officers and profile photos. Location-only snapshots
    // remain live-only unless an administrator explicitly requests last-known data.
    units: Array.isArray(payload.units)
      ? payload.units.map(scrubUnitLocation).filter(unit => payload.location_only !== true || payload.includes_last_known === true || isLiveUnit(unit))
      : payload.units,
    users: Array.isArray(payload.users) ? payload.users.map(scrubUnitLocation).filter(unit => payload.includes_last_known === true || isLiveUnit(unit)) : payload.users,
  };
}

export async function publishOfficerLocation(data = {}) {
  const email = String(data.officer_email || '').trim().toLowerCase();
  const kind = publishKind(data);
  const forcePublish = data.end_session === true || Boolean(data.status) || data.force_publish === true || data.reset_gps === true;
  const minimumGap = forcePublish ? 0 : (kind === 'gps' ? GPS_PUBLISH_MIN_MS : kind === 'heartbeat' ? HEARTBEAT_PUBLISH_MIN_MS : 0);

  return withPublishLock(email || 'current-user', async () => {
    if (minimumGap > 0) {
      const identity = email || 'current-user';
      const ownLastAt = lastPublishAt(identity, kind);
      // A fresh GPS update is also a presence heartbeat. Do not let another tab
      // immediately send a heartbeat-only write after GPS just succeeded.
      const recentGpsAt = kind === 'heartbeat' ? lastPublishAt(identity, 'gps') : 0;
      const lastAt = Math.max(ownLastAt, recentGpsAt);
      const age = Date.now() - lastAt;
      if (lastAt > 0 && age >= 0 && age < minimumGap) {
        return {
          success: true,
          suppressed: true,
          suppressed_reason: `${kind}_publish_throttled`,
          retry_after_ms: minimumGap - age,
        };
      }
    }

    const response = await base44.functions.invoke('logLocation', data);
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    if (minimumGap > 0) notePublishAt(email || 'current-user', kind);
    clearSnapshotCache();
    return payload;
  });
}

export async function endOfficerLocationSession() {
  const response = await base44.functions.invoke('logLocation', { end_session: true });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  clearSnapshotCache();
  return payload;
}

export async function getOfficerLocationSnapshot({ locationOnly = false, force = false, includeLastKnown = false } = {}) {
  const key = cacheKey(locationOnly, includeLastKnown);
  const cached = snapshotCache.get(key);
  if (!force && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.payload;
  if (inflight.has(key)) return inflight.get(key);

  const request = base44.functions.invoke('getOnDutyUnits', locationOnly ? { location_only: true, include_last_known: includeLastKnown } : {})
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
