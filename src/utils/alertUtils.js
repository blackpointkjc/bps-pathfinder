// Calculate distance between two lat/lng coordinates in meters
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const pointInPolygon = (lat, lng, polygon = []) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects = ((lngI > lng) !== (lngJ > lng)) &&
      (lat < ((latJ - latI) * (lng - lngI)) / ((lngJ - lngI) || Number.EPSILON) + latI);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointToSegmentMeters = (lat, lng, a, b) => {
  const originLat = lat * Math.PI / 180;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(originLat);
  const px = 0;
  const py = 0;
  const ax = (a[1] - lng) * metersPerLng;
  const ay = (a[0] - lat) * metersPerLat;
  const bx = (b[1] - lng) * metersPerLng;
  const by = (b[0] - lat) * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
};

export const evaluatePropertyMatch = (call, property, nearbyFeet = 100) => {
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !property?.enabled) return null;
  const nearbyMeters = nearbyFeet * 0.3048;

  if (property.boundary_type === 'polygon' && Array.isArray(property.polygon) && property.polygon.length >= 3) {
    if (pointInPolygon(lat, lng, property.polygon)) {
      return { property, relation: 'inside', distanceMeters: 0, distanceFeet: 0 };
    }
    let distanceMeters = Infinity;
    for (let i = 0; i < property.polygon.length; i += 1) {
      const next = (i + 1) % property.polygon.length;
      distanceMeters = Math.min(distanceMeters, pointToSegmentMeters(lat, lng, property.polygon[i], property.polygon[next]));
    }
    if (distanceMeters <= nearbyMeters) {
      return { property, relation: 'nearby', distanceMeters, distanceFeet: distanceMeters / 0.3048 };
    }
    return null;
  }

  if (!Number.isFinite(Number(property.latitude)) || !Number.isFinite(Number(property.longitude))) return null;
  const distanceMeters = calculateDistance(lat, lng, Number(property.latitude), Number(property.longitude));
  const radius = Number(property.radiusMeters || 0);
  if (distanceMeters <= radius) return { property, relation: 'inside', distanceMeters: 0, distanceFeet: 0 };
  const edgeDistance = distanceMeters - radius;
  return edgeDistance <= nearbyMeters
    ? { property, relation: 'nearby', distanceMeters: edgeDistance, distanceFeet: edgeDistance / 0.3048 }
    : null;
};

export const locationToMonitoredProperty = (location) => {
  if (!location?.property_monitoring_enabled) return null;
  const polygon = Array.isArray(location.property_monitoring_polygon)
    ? location.property_monitoring_polygon.map(point => Array.isArray(point) ? point : [Number(point.lat), Number(point.lng)]).filter(pair => pair.every(Number.isFinite))
    : [];
  return {
    id: location.id,
    location_id: location.id,
    name: location.site_name,
    address: location.address,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    enabled: location.active !== false && location.property_monitoring_enabled === true,
    boundary_type: location.property_monitoring_boundary_type || (polygon.length >= 3 ? 'polygon' : 'circle'),
    radiusMeters: Number(location.property_monitoring_radius_meters || 500),
    polygon,
    description: location.property_monitoring_description || '',
  };
};

export const monitoredPropertiesFromLocations = (locations = []) => locations.map(locationToMonitoredProperty).filter(Boolean);

export const findPropertyMatch = (call, monitoredProperties, nearbyFeet = 100) => {
  const matches = (monitoredProperties || [])
    .map(property => evaluatePropertyMatch(call, property, nearbyFeet))
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  return matches[0] || null;
};

export const isCallNearMonitoredProperty = (call, monitoredProperties) => Boolean(findPropertyMatch(call, monitoredProperties));

// Alerts are based on the call's relationship to a monitored property. User location is not required.
export const shouldAlertForGeofence = (call, user, monitoredProperties) => Boolean(findPropertyMatch(call, monitoredProperties));

// Single master AudioContext — we suspend/resume it to start/stop sound
let masterCtx = null;
let alertInterval = null;
let alertRunning = false;
let alertGeneration = 0;
let dispatchAlertMuted = typeof window !== 'undefined' && localStorage.getItem('bps_dispatch_alert_muted') === 'true';

export const setDispatchAlertMuted = (muted) => {
  dispatchAlertMuted = Boolean(muted);
  if (typeof window !== 'undefined') {
    localStorage.setItem('bps_dispatch_alert_muted', String(dispatchAlertMuted));
    window.dispatchEvent(new CustomEvent('bps-alert-mute-changed', { detail: { muted: dispatchAlertMuted } }));
  }
  if (dispatchAlertMuted) stopDispatchAlert();
};

export const isDispatchAlertMuted = () => {
  if (typeof window !== 'undefined') {
    dispatchAlertMuted = localStorage.getItem('bps_dispatch_alert_muted') === 'true';
  }
  return dispatchAlertMuted;
};

const getMasterCtx = () => {
  if (!masterCtx || masterCtx.state === 'closed') {
    masterCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return masterCtx;
};

export const stopDispatchAlert = () => {
  alertGeneration += 1;
  alertRunning = false;
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }
  if (masterCtx) {
    try { masterCtx.suspend(); } catch (e) {}
    // Close and null it so next alert gets a fresh context
    try { masterCtx.close(); } catch (e) {}
    masterCtx = null;
  }
};

// stopAllAlerts is an alias — does NOT affect officer distress (separate AudioContext)
export const stopAllAlerts = stopDispatchAlert;

// Alias for backwards compat
export const stopPropertyAlert = stopDispatchAlert;

const playSirenTone = () => {
  if (!alertRunning) return;
  try {
    const ctx = getMasterCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const duration = 2.0;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = 2200;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    // 3-sweep wail: 600→1400 Hz
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(1400, now + 0.6);
    osc.frequency.setValueAtTime(600, now + 0.6);
    osc.frequency.linearRampToValueAtTime(1400, now + 1.2);
    osc.frequency.setValueAtTime(600, now + 1.2);
    osc.frequency.linearRampToValueAtTime(1200, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.05);
    gain.gain.setValueAtTime(0.45, now + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.1);
  } catch (e) {}
};

const playBeepTone = (freq = 1000, vol = 0.5) => {
  if (!alertRunning) return;
  try {
    const ctx = getMasterCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {}
};

export const playDispatchAlert = () => {
  if (alertRunning || isDispatchAlertMuted()) return;
  alertGeneration += 1;
  alertRunning = true;
  playSirenTone();
  alertInterval = setInterval(playSirenTone, 3500);
};

export const playPropertyAlert = () => {
  if (alertRunning || isDispatchAlertMuted()) return;
  alertGeneration += 1;
  const generation = alertGeneration;
  alertRunning = true;

  // Property alerts are an attention burst, not an endless alarm. Keep the visual
  // alert on screen until acknowledged, but stop audio automatically after 6 seconds.
  playBeepTone(1000, 0.5);
  alertInterval = setInterval(() => playBeepTone(1000, 0.5), 650);
  window.setTimeout(() => {
    // Do not let an old property-alert timeout stop a newer dispatch/property alarm.
    if (alertRunning && alertGeneration === generation) stopDispatchAlert();
  }, 6000);
};