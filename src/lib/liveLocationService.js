import { startBackgroundLocationScheduler, nudgeBackgroundLocationScheduler } from '@/lib/backgroundLocationScheduler';

let latestFix = null;
const listeners = new Set();
const errorListeners = new Set();

let watchId = null;
let refreshTimer = null;
let releaseBackgroundScheduler = null;
let retainCount = 0;
let freshRequest = null;
let lifecycleListenersInstalled = false;
let lastSchedulerTickAt = Date.now();
let lastOperationalResumeAt = 0;

export const TACTICAL_GPS_MAX_ACCURACY_METERS = 100;
export const PRECISION_GPS_TARGET_METERS = 50;
// Browser/device GPS reads do not consume Base44 credits. Force one fresh device
// request per minute while the shared watch remains active; the background
// tracker separately rate-limits server persistence.
export const DEVICE_GPS_REFRESH_MS = 30_000;
export const BROWSER_GPS_MAX_USABLE_ACCURACY_METERS = 2_000;
export const EXTERNAL_GPS_PRIORITY_MS = 2 * 60 * 1000;
export const GPS_WATCH_STALE_MS = 90_000;

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0,
};

export function isTacticalLocationFix(fix, maxAgeMs = 30000) {
  if (!fix) return false;
  const latitude = Number(fix.latitude);
  const longitude = Number(fix.longitude);
  const accuracy = Number(fix.accuracy);
  const timestamp = Number(fix.timestamp) || 0;
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Number.isFinite(accuracy)
    && accuracy <= TACTICAL_GPS_MAX_ACCURACY_METERS
    && timestamp > 0
    && Date.now() - timestamp <= maxAgeMs;
}

export function locationQuality(fix, maxAgeMs = 30000) {
  if (!fix) return { state: 'unavailable', accuracy: null };
  const ageMs = Date.now() - (Number(fix.timestamp) || 0);
  const accuracy = Number(fix.accuracy);
  if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) return { state: 'stale', accuracy: Number.isFinite(accuracy) ? accuracy : null, ageMs };
  if (!Number.isFinite(accuracy) || accuracy > TACTICAL_GPS_MAX_ACCURACY_METERS) return { state: 'low_accuracy', accuracy: Number.isFinite(accuracy) ? accuracy : null, ageMs };
  return { state: 'live', accuracy, ageMs };
}

function geolocationSupported() {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function normalizePosition(position) {
  if (!position?.coords) return null;
  const observedAt = Date.now();
  return {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Number(position.coords.accuracy),
    heading: position.coords.heading !== null && position.coords.heading !== undefined && Number.isFinite(Number(position.coords.heading))
      ? Number(position.coords.heading)
      : null,
    // Chromium/Windows frequently exposes null speed even while GNSS coordinates
    // are changing. Preserve null here so publishLiveLocation can derive MPH from
    // consecutive accepted fixes instead of incorrectly reporting 0 MPH.
    speed: position.coords.speed !== null && position.coords.speed !== undefined && Number.isFinite(Number(position.coords.speed))
      ? Number(position.coords.speed) * 2.236936
      : null,
    // Chromium/Windows can return the same sensor timestamp while an officer is
    // stationary even though getCurrentPosition just successfully reconfirmed the
    // device's position. Pathfinder freshness means "last confirmed location",
    // not "last time the coordinates changed", so stamp the successful observation
    // time and retain the raw sensor timestamp only for diagnostics.
    timestamp: observedAt,
    sensor_timestamp: Number(position.timestamp) || observedAt,
    source: 'browser_geolocation',
  };
}

function publishLocationError(error) {
  errorListeners.forEach(listener => {
    try { listener(error); } catch (_) {}
  });
}

function movementMetrics(previous, next) {
  if (!previous || !next) return { speed: null, heading: null, distance: 0 };
  const lat1 = Number(previous.latitude);
  const lon1 = Number(previous.longitude);
  const lat2 = Number(next.latitude);
  const lon2 = Number(next.longitude);
  const elapsedSeconds = (Number(next.timestamp) - Number(previous.timestamp)) / 1000;
  if (![lat1, lon1, lat2, lon2, elapsedSeconds].every(Number.isFinite) || elapsedSeconds < 0.5 || elapsedSeconds > 180) {
    return { speed: null, heading: null, distance: 0 };
  }
  const toRad = value => value * Math.PI / 180;
  const toDeg = value => value * 180 / Math.PI;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const distance = earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const heading = (toDeg(Math.atan2(y, x)) + 360) % 360;
  // Ignore tiny GPS jitter. Clamp implausible derived vehicle speed rather than
  // letting a bad fix briefly show hundreds of MPH.
  const speed = distance < 3 ? 0 : Math.min(120, (distance / elapsedSeconds) * 2.236936);
  return { speed, heading, distance };
}

export function publishLiveLocation(fix) {
  if (!fix || !Number.isFinite(Number(fix.latitude)) || !Number.isFinite(Number(fix.longitude))) return;
  const candidate = {
    latitude: Number(fix.latitude),
    longitude: Number(fix.longitude),
    accuracy: Number.isFinite(Number(fix.accuracy)) ? Number(fix.accuracy) : Infinity,
    heading: fix.heading !== null && fix.heading !== undefined && Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : null,
    speed: fix.speed !== null && fix.speed !== undefined && Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : null,
    timestamp: Number(fix.timestamp) || Date.now(),
    sensor_timestamp: Number(fix.sensor_timestamp) || Number(fix.timestamp) || Date.now(),
    source: String(fix.source || 'browser_geolocation'),
  };
  const derived = movementMetrics(latestFix, candidate);
  if (!Number.isFinite(Number(candidate.speed))) candidate.speed = derived.speed ?? 0;
  if (!Number.isFinite(Number(candidate.heading)) && Number(candidate.speed) >= 2) candidate.heading = derived.heading;

  // Smooth obviously noisy speed spikes without making the vehicle feel delayed.
  if (latestFix && Number.isFinite(Number(latestFix.speed)) && Number.isFinite(Number(candidate.speed))) {
    const delta = Math.abs(Number(candidate.speed) - Number(latestFix.speed));
    if (delta > 35 && derived.distance < 25) candidate.speed = Number(latestFix.speed);
  }

  // Windows can fall back to IP/network positioning when the CF-33 GNSS sensor
  // momentarily disappears. Those readings can be tens of miles away with a
  // 50,000-100,000m accuracy radius. Never publish that as an officer position.
  if (candidate.source !== 'external_serial' && candidate.accuracy > BROWSER_GPS_MAX_USABLE_ACCURACY_METERS) {
    return;
  }
  // Once a direct NMEA/USB receiver has a recent fix, it owns the location stream.
  // Browser/Wi-Fi positioning must not overwrite it until the external receiver
  // has been silent long enough to be considered unavailable.
  if (latestFix?.source === 'external_serial'
      && candidate.source !== 'external_serial'
      && Date.now() - Number(latestFix.timestamp || 0) <= EXTERNAL_GPS_PRIORITY_MS) {
    return;
  }
  // GPS radios often begin with a coarse Wi-Fi/network fix and improve seconds
  // later. Do not replace a recent precise fix with a substantially worse one.
  // GPS radios often improve their fix over several readings. Do not let a much
  // worse reading replace a recent better one from the same source.
  if (latestFix && candidate.timestamp - latestFix.timestamp < 30000
      && Number.isFinite(latestFix.accuracy)
      && candidate.accuracy > latestFix.accuracy + 25) return;
  latestFix = candidate;
  listeners.forEach(listener => {
    try { listener(latestFix); } catch (_) {}
  });
}

export function getLiveLocation(maxAgeMs = 15000) {
  if (!latestFix) return null;
  if (Date.now() - latestFix.timestamp > maxAgeMs) return null;
  return latestFix;
}

export function subscribeLiveLocation(listener, { emitCurrent = true } = {}) {
  listeners.add(listener);
  if (emitCurrent && latestFix) listener(latestFix);
  return () => listeners.delete(listener);
}

export function requestFreshLiveLocation({ timeoutMs = 15000 } = {}) {
  // The shared live stream is authoritative app-wide. If the USB/NMEA receiver
  // has a current fix, every caller (clock, maps, reports, distress and CAD)
  // receives it directly and must not start a competing browser/Wi-Fi lookup.
  const externalFix = getLiveLocation(EXTERNAL_GPS_PRIORITY_MS);
  if (externalFix?.source === 'external_serial') return Promise.resolve(externalFix);
  if (!geolocationSupported()) {
    const error = new Error('GEOLOCATION_NOT_SUPPORTED');
    error.code = 0;
    return Promise.reject(error);
  }
  if (freshRequest) return freshRequest;

  freshRequest = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        const fix = normalizePosition(position);
        if (fix) publishLiveLocation(fix);
        resolve(fix);
      },
      error => {
        publishLocationError(error);
        reject(error);
      },
      { ...GPS_OPTIONS, timeout: timeoutMs },
    );
  }).finally(() => {
    freshRequest = null;
  });

  return freshRequest;
}

export function requestBestLiveLocation({ timeoutMs = 15000, targetAccuracyMeters = PRECISION_GPS_TARGET_METERS } = {}) {
  if (!geolocationSupported()) return requestFreshLiveLocation({ timeoutMs });
  const current = getLiveLocation(60000);
  if (current && Number.isFinite(Number(current.accuracy)) && Number(current.accuracy) <= targetAccuracyMeters) {
    return Promise.resolve(current);
  }
  return new Promise((resolve, reject) => {
    let best = current;
    let finished = false;
    let timer;
    let unsubscribe = () => {};
    const finish = (error) => {
      if (finished) return;
      finished = true;
      unsubscribe();
      window.clearTimeout(timer);
      if (best) resolve(best); else reject(error || new Error('LIVE_LOCATION_TIMEOUT'));
    };
    const consider = fix => {
      if (!fix) return;
      if (!best || Number(fix.accuracy) < Number(best.accuracy) || Number(fix.timestamp) > Number(best.timestamp) + 30000) best = fix;
      if (Number.isFinite(Number(best.accuracy)) && Number(best.accuracy) <= targetAccuracyMeters) finish();
    };
    // Do not synchronously replay latestFix during subscription. The current fix
    // was evaluated above; replaying it before `unsubscribe` is assigned leaks a
    // listener and eventually creates multiple competing location consumers.
    unsubscribe = subscribeLiveLocation(consider, { emitCurrent: false });
    requestFreshLiveLocation({ timeoutMs: Math.min(timeoutMs, 10000) }).then(consider).catch(error => {
      if (error?.code === 1) finish(error);
    });
    timer = window.setTimeout(() => finish(), timeoutMs);
  });
}

function requestWhenUsable() {
  // Do NOT stop simply because the app is minimized/hidden. That was causing the
  // CF-33 to rely only on Chromium's throttled watchPosition stream. A fresh
  // high-accuracy request is intentionally attempted in the background as well.
  requestFreshLiveLocation().catch(() => null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bps-background-location-tick', {
      detail: { at: Date.now(), hidden: typeof document !== 'undefined' ? document.hidden : false },
    }));
  }
}

function emitOperationalResume(reason = 'resume', previousActivityAt = lastSchedulerTickAt) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  // focus + visibilitychange + pageshow commonly fire together. One recovery
  // event is enough to wake CAD, roster, and location persistence.
  if (now - lastOperationalResumeAt < 1500) return;
  lastOperationalResumeAt = now;
  window.dispatchEvent(new CustomEvent('bps-operational-resume', {
    detail: {
      reason,
      at: now,
      inactive_ms: Math.max(0, now - Number(previousActivityAt || now)),
      hidden: typeof document !== 'undefined' ? document.hidden : false,
    },
  }));
}

function restartBrowserWatchIfStale(force = false) {
  if (retainCount <= 0 || !geolocationSupported()) return false;
  const fixAge = latestFix?.timestamp ? Date.now() - Number(latestFix.timestamp) : Infinity;
  if (!force && fixAge < GPS_WATCH_STALE_MS) return false;

  if (watchId !== null) {
    try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
    watchId = null;
  }
  watchId = navigator.geolocation.watchPosition(
    position => {
      const fix = normalizePosition(position);
      if (fix) publishLiveLocation(fix);
    },
    publishLocationError,
    GPS_OPTIONS,
  );
  return true;
}

export function recoverLiveLocationTracking(reason = 'operational_resume') {
  if (retainCount <= 0) return Promise.resolve(getLiveLocation(EXTERNAL_GPS_PRIORITY_MS));
  restartBrowserWatchIfStale(true);
  lastSchedulerTickAt = Date.now();
  nudgeBackgroundLocationScheduler();
  requestWhenUsable();
  return requestFreshLiveLocation({ timeoutMs: 15000 }).catch(() => getLiveLocation(EXTERNAL_GPS_PRIORITY_MS));
}

function handleBackgroundSchedulerTick(data = {}) {
  const now = Date.now();
  const previous = lastSchedulerTickAt;
  lastSchedulerTickAt = now;
  // A long gap means the browser/OS suspended the page or worker. Recover the
  // geolocation watch and tell operational data owners to catch up immediately.
  if (previous && now - previous > GPS_WATCH_STALE_MS) {
    restartBrowserWatchIfStale(true);
    emitOperationalResume('background_watchdog_gap', previous);
  }
  requestWhenUsable(data);
}

function handleVisibilityChange() {
  // Request immediately both when minimizing and when restoring. The minimize
  // edge gives Pathfinder one last main-thread request before Chromium applies
  // deeper background throttling; restore performs an immediate catch-up.
  const previous = lastSchedulerTickAt;
  requestWhenUsable();
  nudgeBackgroundLocationScheduler();
  if (typeof document === 'undefined' || !document.hidden) {
    restartBrowserWatchIfStale();
    emitOperationalResume('visibility_resume', previous);
  }
}

function handleFocus() {
  const previous = lastSchedulerTickAt;
  restartBrowserWatchIfStale();
  requestWhenUsable();
  nudgeBackgroundLocationScheduler();
  emitOperationalResume('focus', previous);
}

function handleOnline() {
  const previous = lastSchedulerTickAt;
  restartBrowserWatchIfStale();
  requestWhenUsable();
  emitOperationalResume('online', previous);
}

function installLifecycleListeners() {
  if (lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = true;
  window.addEventListener('bps-request-location', requestWhenUsable);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleOnline);
  window.addEventListener('pageshow', handleVisibilityChange);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('freeze', handleVisibilityChange);
  document.addEventListener('resume', handleVisibilityChange);
}

function removeLifecycleListeners() {
  if (!lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = false;
  window.removeEventListener('bps-request-location', requestWhenUsable);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('pageshow', handleVisibilityChange);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('freeze', handleVisibilityChange);
  document.removeEventListener('resume', handleVisibilityChange);
}

function ensureSharedWatch() {
  if (!geolocationSupported()) return;
  restartBrowserWatchIfStale(watchId === null);
  installLifecycleListeners();
  // Keep the device/sensor watch running continuously. Use both a Worker-driven
  // one-minute scheduler (more resilient to minimized-window timer throttling)
  // and a normal window timer as a fallback. freshRequest de-duplicates overlaps,
  // so these do not create duplicate geolocation requests or Base44 writes.
  if (!releaseBackgroundScheduler) {
    releaseBackgroundScheduler = startBackgroundLocationScheduler(handleBackgroundSchedulerTick, DEVICE_GPS_REFRESH_MS);
  }
  if (refreshTimer === null) refreshTimer = window.setInterval(requestWhenUsable, DEVICE_GPS_REFRESH_MS);
  requestWhenUsable();
}

function stopSharedWatch() {
  if (watchId !== null && geolocationSupported()) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (releaseBackgroundScheduler) {
    releaseBackgroundScheduler();
    releaseBackgroundScheduler = null;
  }
  removeLifecycleListeners();
}

export function startLiveLocationTracking({ onError } = {}) {
  retainCount += 1;
  if (typeof onError === 'function') errorListeners.add(onError);
  ensureSharedWatch();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (typeof onError === 'function') errorListeners.delete(onError);
    retainCount = Math.max(0, retainCount - 1);
    if (retainCount === 0) stopSharedWatch();
  };
}

export function waitForLiveLocation({ maxAgeMs = 15000, timeoutMs = 10000, maxAccuracyMeters = Infinity } = {}) {
  const acceptable = fix => !!fix
    && Date.now() - fix.timestamp <= maxAgeMs
    && Number.isFinite(Number(fix.accuracy))
    && Number(fix.accuracy) <= maxAccuracyMeters;
  const current = getLiveLocation(maxAgeMs);
  if (acceptable(current)) return Promise.resolve(current);

  return new Promise((resolve, reject) => {
    let done = false;
    let timer;
    let unsubscribe = () => {};
    let releaseTracking = () => {};

    const finish = (value, error) => {
      if (done) return;
      done = true;
      unsubscribe();
      releaseTracking();
      window.clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };

    releaseTracking = startLiveLocationTracking({
      onError: error => {
        // Permission denial cannot recover without user action. Timeouts and
        // temporarily unavailable fixes may still recover through the shared watch.
        if (error?.code === 1) finish(null, error);
      },
    });
    unsubscribe = subscribeLiveLocation(fix => {
      if (acceptable(fix)) finish(fix);
    }, { emitCurrent: false });

    requestFreshLiveLocation({ timeoutMs }).catch(error => {
      if (error?.code === 1 || error?.message === 'GEOLOCATION_NOT_SUPPORTED') finish(null, error);
    });

    timer = window.setTimeout(() => {
      const error = new Error('LIVE_LOCATION_TIMEOUT');
      error.code = 3;
      finish(null, error);
    }, timeoutMs + 500);
  });
}
