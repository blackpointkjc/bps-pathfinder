import { base44, clearBase44ReadCacheMatching, getBase44RequestHealth } from '@/api/base44Client';

// Single client gateway for Pathfinder live officer location.
// No page/component should read/write ActiveOfficer or invoke getOnDutyUnits/logLocation directly.
// All consumers share the same in-memory snapshot/in-flight request so opening
// several CAD/map panels does not multiply live-location backend reads.
// Realtime ActiveOfficer subscriptions clear this cache immediately on an actual
// location/status change. A one-minute read cache therefore reduces duplicate map,
// health-check, and CAD fetches without delaying genuine realtime invalidation.
const SNAPSHOT_TTL_MS = 60_000;
const FORCE_REFRESH_DEDUPE_MS = 45_000;
const MAX_USABLE_GPS_ACCURACY_METERS = 2000;
const GPS_PUBLISH_MIN_MS = 7 * 1000;
const HEARTBEAT_PUBLISH_MIN_MS = 8 * 60 * 1000;
const CROSS_KIND_BURST_GAP_MS = 20 * 1000;
const PUBLISH_LOCK_PREFIX = 'bps:pathfinder:location-publish:';
const PUBLISH_STAMP_PREFIX = 'bps:pathfinder:location-publish-at:';
const snapshotCache = new Map();
const inflight = new Map();
const lastForcedAt = new Map();
let localPublishPromise = Promise.resolve();

function cacheKey(locationOnly, includeLastKnown) { if (includeLastKnown) return 'admin-location'; return locationOnly ? 'location' : 'full'; }
function clearSnapshotCache() { snapshotCache.clear(); }
export function clearOfficerLocationSnapshotCache() {
  snapshotCache.clear();
  lastForcedAt.clear();
}

function realtimeOfficerRecord(event) {
  return event?.data || event?.record || null;
}

export function applyOfficerLocationEvent(rows = [], event) {
  const current = Array.isArray(rows) ? rows : [];
  const type = String(event?.type || '').toLowerCase();
  const record = realtimeOfficerRecord(event);
  const eventId = String(event?.id || record?.id || '');
  if (!eventId && !record) return current;

  if (type === 'delete') {
    // A deleted ActiveOfficer session means the live session ended. Canonical
    // roster rows are user-backed, so keep the officer but resolve the live state
    // immediately instead of making the row disappear until the next full fetch.
    return current.map(row => {
      const activeId = String(row?.active_officer_id || '');
      const rowId = String(row?.id || '');
      if (activeId !== eventId && rowId !== eventId) return row;
      return {
        ...row,
        status: 'Out of Service',
        session_active: false,
        presence_online: false,
        presence_state: 'offline',
        connection_stale: false,
        current_call_info: '',
        last_update: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
    });
  }

  if (!record) return current;
  const eventEmail = String(record.officer_email || record.email || '').trim().toLowerCase();
  return current.map(row => {
    const rowEmail = String(row?.officer_email || row?.email || '').trim().toLowerCase();
    const activeId = String(row?.active_officer_id || '');
    const rowId = String(row?.id || '');
    const matches = (eventEmail && rowEmail === eventEmail)
      || (eventId && (activeId === eventId || rowId === eventId));
    if (!matches) return row;

    const next = { ...row };
    const fields = [
      'status','session_active','current_call_info','current_location','unit_number',
      'officer_name','first_name','last_name','rank','profile_photo_url','latitude',
      'longitude','heading','speed','accuracy','gps_updated_at','gps_source','last_update',
      'clock_in_time','tracking_session_key'
    ];
    for (const field of fields) {
      if (record[field] !== undefined) next[field] = record[field];
    }
    if (record.last_update !== undefined) next.last_updated = record.last_update;
    if (record.session_active !== undefined) {
      next.presence_online = record.session_active === true;
      next.presence_state = record.session_active === true ? 'online' : 'offline';
      if (record.session_active === false) next.connection_stale = false;
    }
    return next;
  });
}

function applyRealtimeEventToSnapshotCache(event) {
  for (const [key, cached] of snapshotCache.entries()) {
    if (!cached?.payload) continue;
    const payload = cached.payload;
    snapshotCache.set(key, {
      ...cached,
      at: Date.now(),
      payload: {
        ...payload,
        units: Array.isArray(payload.units) ? applyOfficerLocationEvent(payload.units, event) : payload.units,
        users: Array.isArray(payload.users) ? applyOfficerLocationEvent(payload.users, event) : payload.users,
      },
    });
  }
}

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
  const forcePublish = data.end_session === true || data.force_publish === true || data.reset_gps === true || data.status_changed === true;
  const minimumGap = forcePublish ? 0 : (kind === 'gps' ? GPS_PUBLISH_MIN_MS : kind === 'heartbeat' ? HEARTBEAT_PUBLISH_MIN_MS : 0);

  return withPublishLock(email || 'current-user', async () => {
    if (!forcePublish) {
      const requestHealth = getBase44RequestHealth();
      if (requestHealth.rateLimitedUntil) {
        // GPS/heartbeat is background operational traffic. If Base44 has already
        // told this browser to cool down, do not spend another write just to learn
        // the same 429. The next live fix/heartbeat will retry automatically.
        return {
          success: true,
          suppressed: true,
          suppressed_reason: 'api_rate_limit_cooldown',
          retry_after: requestHealth.rateLimitedUntil,
        };
      }
      if (kind === 'heartbeat' && Number(requestHealth.queuedReads || 0) >= 8) {
        return {
          success: true,
          suppressed: true,
          suppressed_reason: 'api_read_pressure',
        };
      }
    }
    if (minimumGap > 0) {
      const identity = email || 'current-user';
      const ownLastAt = lastPublishAt(identity, kind);
      // A fresh GPS update is also a presence heartbeat. Likewise, a just-saved
      // heartbeat/session establishment should suppress an immediate GPS function
      // call for a short burst window so clock-in + tracker startup cannot spend
      // several function requests in the same few seconds.
      const otherKind = kind === 'gps' ? 'heartbeat' : 'gps';
      const otherLastAt = lastPublishAt(identity, otherKind);
      const ownAge = ownLastAt > 0 ? Date.now() - ownLastAt : Infinity;
      const crossAge = otherLastAt > 0 ? Date.now() - otherLastAt : Infinity;
      const ownSuppressed = ownLastAt > 0 && ownAge >= 0 && ownAge < minimumGap;
      const crossSuppressed = otherLastAt > 0 && crossAge >= 0 && crossAge < CROSS_KIND_BURST_GAP_MS;
      if (ownSuppressed || crossSuppressed) {
        return {
          success: true,
          suppressed: true,
          suppressed_reason: crossSuppressed ? 'location_publish_burst_suppressed' : `${kind}_publish_throttled`,
          retry_after_ms: crossSuppressed ? CROSS_KIND_BURST_GAP_MS - crossAge : minimumGap - ownAge,
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
  const now = Date.now();
  const cached = snapshotCache.get(key);
  // The administrator location feed is a superset of the ordinary live-map feed.
  // Reuse it instead of spending another getOnDutyUnits request for the same units.
  const compatibleCached = locationOnly && !includeLastKnown ? snapshotCache.get('admin-location') : null;
  if (!force && cached && now - cached.at < SNAPSHOT_TTL_MS) return cached.payload;
  if (!force && compatibleCached && now - compatibleCached.at < SNAPSHOT_TTL_MS) return compatibleCached.payload;
  if (force && cached && now - Number(lastForcedAt.get(key) || 0) < FORCE_REFRESH_DEDUPE_MS) return cached.payload;
  if (inflight.has(key)) return inflight.get(key);

  // Never turn a known API throttle into another getOnDutyUnits request. Realtime
  // ActiveOfficer events already update the cached roster locally; keep using that
  // verified snapshot until the shared cooldown expires.
  if (force && cached && getBase44RequestHealth().rateLimitedUntil) return cached.payload;

  if (force) {
    lastForcedAt.set(key, now);
    // A force refresh should invalidate the existing stable request key, not create
    // a brand-new random key. Random cache-busting made every status/location event
    // count as a separate network call and defeated the app-wide dedupe layer.
    clearBase44ReadCacheMatching('function:getOnDutyUnits:');
  }
  const requestPayload = locationOnly
    ? { location_only: true, include_last_known: includeLastKnown }
    : {};
  const request = base44.functions.invoke('getOnDutyUnits', requestPayload)
    .then(response => {
      const rawPayload = response?.data || response || {};
      if (rawPayload.error) throw new Error(rawPayload.error);
      // Defense in depth: never let a legacy backend/client return an IP/network
      // estimate (for example ±50,000m) to any Pathfinder map as a live officer fix.
      const payload = scrubSnapshot(rawPayload);
      const cachedAt = Date.now();
      snapshotCache.set(key, { at: cachedAt, payload });
      // A full roster contains the live-location fields required by ordinary map
      // consumers. Cache a live-only derivative so a simultaneous map request does
      // not spend a second getOnDutyUnits call with a different request body.
      if (key === 'full') {
        const liveOnlyPayload = scrubSnapshot({ ...payload, location_only: true, includes_last_known: false });
        snapshotCache.set('location', { at: cachedAt, payload: liveOnlyPayload });
      }
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
      // Apply the realtime ActiveOfficer event to every cached roster snapshot
      // before notifying UI consumers. Components can now paint the new status
      // immediately instead of waiting for another getOnDutyUnits round trip.
      applyRealtimeEventToSnapshotCache(event);
      listener(event);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}
