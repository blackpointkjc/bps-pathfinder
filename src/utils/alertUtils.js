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

// Shared interval ref for all repeating alerts
let alertIntervalRef = null;
let alertActive = false;

export const stopAllAlerts = () => {
  if (alertIntervalRef) {
    clearInterval(alertIntervalRef);
    alertIntervalRef = null;
  }
  alertActive = false;
};

// Alias for backwards compat
export const stopPropertyAlert = stopAllAlerts;

const playTone = (freq, volume = 0.4) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
};

// Police siren alert - fast ascending wail like a radio pre-alert
const playPoliceTone = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const totalDuration = 2.0;

    // Main siren oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';

    // Sweep up 600→1400Hz three times rapidly - classic police wail
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(1400, now + 0.5);
    osc.frequency.setValueAtTime(600, now + 0.5);
    osc.frequency.linearRampToValueAtTime(1400, now + 1.0);
    osc.frequency.setValueAtTime(600, now + 1.0);
    osc.frequency.linearRampToValueAtTime(1400, now + 1.5);
    osc.frequency.setValueAtTime(600, now + 1.5);
    osc.frequency.linearRampToValueAtTime(1000, now + totalDuration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain.gain.setValueAtTime(0.5, now + totalDuration - 0.1);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);

    // Low-pass filter to soften harsh sawtooth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    osc.disconnect(gain);
    osc.connect(filter);
    filter.connect(gain);

    osc.start(now);
    osc.stop(now + totalDuration + 0.05);
  } catch (e) {}
};

// Play repeating dispatch alert until acknowledged
export const playDispatchAlert = () => {
  if (alertActive) return;
  alertActive = true;
  playPoliceTone();
  alertIntervalRef = setInterval(playPoliceTone, 3000);
};

// Play continuous high-priority beep for property alerts
export const playPropertyAlert = () => {
  if (alertActive) return;
  alertActive = true;
  playTone(1000, 0.5);
  alertIntervalRef = setInterval(() => playTone(1000, 0.5), 500);
};