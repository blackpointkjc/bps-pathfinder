let latestFix = null;
const listeners = new Set();
const errorListeners = new Set();

let watchId = null;
let refreshTimer = null;
let retainCount = 0;
let freshRequest = null;
let lifecycleListenersInstalled = false;

export const TACTICAL_GPS_MAX_ACCURACY_METERS = 100;
export const PRECISION_GPS_TARGET_METERS = 50;

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
  return {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Number(position.coords.accuracy),
    heading: Number.isFinite(Number(position.coords.heading)) ? Number(position.coords.heading) : null,
    // The rest of Pathfinder displays officer speed in miles per hour.
    speed: Number.isFinite(Number(position.coords.speed)) ? Number(position.coords.speed) * 2.236936 : 0,
    timestamp: Number(position.timestamp) || Date.now(),
  };
}

function publishLocationError(error) {
  errorListeners.forEach(listener => {
    try { listener(error); } catch (_) {}
  });
}

export function publishLiveLocation(fix) {
  if (!fix || !Number.isFinite(Number(fix.latitude)) || !Number.isFinite(Number(fix.longitude))) return;
  const candidate = {
    latitude: Number(fix.latitude),
    longitude: Number(fix.longitude),
    accuracy: Number.isFinite(Number(fix.accuracy)) ? Number(fix.accuracy) : Infinity,
    heading: Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : null,
    speed: Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : 0,
    timestamp: Number(fix.timestamp) || Date.now(),
  };
  // GPS radios often begin with a coarse Wi-Fi/network fix and improve seconds
  // later. Do not replace a recent precise fix with a substantially worse one.
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

export function subscribeLiveLocation(listener) {
  listeners.add(listener);
  if (latestFix) listener(latestFix);
  return () => listeners.delete(listener);
}

export function requestFreshLiveLocation({ timeoutMs = 15000 } = {}) {
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
  return new Promise((resolve, reject) => {
    let best = getLiveLocation(60000);
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
    unsubscribe = subscribeLiveLocation(consider);
    requestFreshLiveLocation({ timeoutMs: Math.min(timeoutMs, 10000) }).then(consider).catch(error => {
      if (error?.code === 1) finish(error);
    });
    timer = window.setTimeout(() => finish(), timeoutMs);
  });
}

function requestWhenUsable() {
  if (typeof document !== 'undefined' && document.hidden) return;
  requestFreshLiveLocation().catch(() => null);
}

function installLifecycleListeners() {
  if (lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = true;
  window.addEventListener('bps-request-location', requestWhenUsable);
  window.addEventListener('focus', requestWhenUsable);
  window.addEventListener('online', requestWhenUsable);
  document.addEventListener('visibilitychange', requestWhenUsable);
}

function removeLifecycleListeners() {
  if (!lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = false;
  window.removeEventListener('bps-request-location', requestWhenUsable);
  window.removeEventListener('focus', requestWhenUsable);
  window.removeEventListener('online', requestWhenUsable);
  document.removeEventListener('visibilitychange', requestWhenUsable);
}

function ensureSharedWatch() {
  if (watchId !== null || !geolocationSupported()) return;
  watchId = navigator.geolocation.watchPosition(
    position => {
      const fix = normalizePosition(position);
      if (fix) publishLiveLocation(fix);
    },
    publishLocationError,
    GPS_OPTIONS,
  );
  installLifecycleListeners();
  refreshTimer = window.setInterval(requestWhenUsable, 15000);
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
    });

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
