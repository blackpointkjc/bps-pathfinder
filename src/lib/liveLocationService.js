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
    const finish = (value, error) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const unsubscribe = subscribeLiveLocation(fix => {
      if (acceptable(fix)) finish(fix);
    });
    const timer = setTimeout(() => finish(null, new Error('LIVE_LOCATION_TIMEOUT')), timeoutMs);
  });
}
