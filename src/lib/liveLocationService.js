let latestFix = null;
const listeners = new Set();
const errorListeners = new Set();

let watchId = null;
let refreshTimer = null;
let retainCount = 0;
let freshRequest = null;
let lifecycleListenersInstalled = false;

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0,
};

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
  latestFix = {
    latitude: Number(fix.latitude),
    longitude: Number(fix.longitude),
    accuracy: Number.isFinite(Number(fix.accuracy)) ? Number(fix.accuracy) : Infinity,
    heading: Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : null,
    speed: Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : 0,
    timestamp: Number(fix.timestamp) || Date.now(),
  };
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

    unsubscribe = subscribeLiveLocation(fix => {
      if (acceptable(fix)) finish(fix);
    });
    releaseTracking = startLiveLocationTracking({
      onError: error => {
        // Permission denial cannot recover without user action. Timeouts and
        // temporarily unavailable fixes may still recover through the shared watch.
        if (error?.code === 1) finish(null, error);
      },
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
