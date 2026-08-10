let latestFix = null;
const listeners = new Set();

export function publishLiveLocation(fix) {
  if (!fix || !Number.isFinite(Number(fix.latitude)) || !Number.isFinite(Number(fix.longitude))) return;
  latestFix = {
    latitude: Number(fix.latitude),
    longitude: Number(fix.longitude),
    accuracy: Number(fix.accuracy) || 0,
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
    let watchId = null;
    let unsubscribe = () => {};

    const finish = (value, error) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      if (watchId !== null && navigator?.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (error) reject(error); else resolve(value);
    };

    unsubscribe = subscribeLiveLocation(fix => {
      if (acceptable(fix)) finish(fix);
    });

    // The app-wide background tracker intentionally runs only after an officer is
    // clocked in. Time Clock still needs a GPS fix BEFORE clock-in, so request one
    // directly here instead of waiting for a tracker that is not running yet.
    if (!('geolocation' in navigator)) {
      const error = new Error('GEOLOCATION_NOT_SUPPORTED');
      error.code = 0;
      finish(null, error);
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      position => {
        const fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp || Date.now(),
        };
        publishLiveLocation(fix);
        if (acceptable(fix)) finish(fix);
      },
      error => finish(null, error),
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: Math.min(maxAgeMs, 2000),
      }
    );

    timer = setTimeout(() => {
      const error = new Error('LIVE_LOCATION_TIMEOUT');
      error.code = 3;
      finish(null, error);
    }, timeoutMs + 500);
  });
}
