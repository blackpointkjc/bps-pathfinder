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

// Check if a call is near any monitored property
export const isCallNearMonitoredProperty = (call, monitoredProperties) => {
  if (!call?.latitude || !call?.longitude || !monitoredProperties?.length) return false;
  return monitoredProperties.some(prop => {
    if (!prop.enabled || !prop.latitude || !prop.longitude) return false;
    const distance = calculateDistance(call.latitude, call.longitude, prop.latitude, prop.longitude);
    return distance <= (prop.radiusMeters || 500);
  });
};

// Single master AudioContext — we suspend/resume it to start/stop sound
let masterCtx = null;
let alertInterval = null;
let alertRunning = false;
let dispatchAlertMuted = false;

export const setDispatchAlertMuted = (muted) => {
  dispatchAlertMuted = muted;
  if (muted) stopDispatchAlert();
};

const getMasterCtx = () => {
  if (!masterCtx || masterCtx.state === 'closed') {
    masterCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return masterCtx;
};

export const stopDispatchAlert = () => {
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
  if (alertRunning || dispatchAlertMuted) return;
  alertRunning = true;
  playSirenTone();
  alertInterval = setInterval(playSirenTone, 3500);
};

export const playPropertyAlert = () => {
  if (alertRunning) return;
  alertRunning = true;
  playBeepTone(1000, 0.5);
  alertInterval = setInterval(() => playBeepTone(1000, 0.5), 500);
};