// Calculate distance between two lat/lng coordinates in meters
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
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
  if (!call?.latitude || !call?.longitude || !monitoredProperties?.length) {
    return false;
  }
  
  return monitoredProperties.some(prop => {
    if (!prop.enabled || !prop.latitude || !prop.longitude) return false;
    const distance = calculateDistance(
      call.latitude, call.longitude,
      prop.latitude, prop.longitude
    );
    return distance <= (prop.radiusMeters || 500);
  });
};

// Play continuous beeping for monitored property alerts
let beepIntervalRef = null;

export const playPropertyAlert = () => {
  // Stop any existing beeping first
  stopPropertyAlert();
  
  try {
    const playBeep = () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    };
    
    // Play once immediately
    playBeep();
    
    // Then repeat every 500ms
    beepIntervalRef = setInterval(playBeep, 500);
  } catch (e) {
    console.error('Error playing property alert:', e);
  }
};

export const stopPropertyAlert = () => {
  if (beepIntervalRef) {
    clearInterval(beepIntervalRef);
    beepIntervalRef = null;
  }
};

// Play standard dispatch alert (non-repeating)
export const playDispatchAlert = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tones = [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1100, start: 0.15, duration: 0.12 },
      { freq: 880, start: 0.30, duration: 0.12 },
      { freq: 1100, start: 0.45, duration: 0.18 },
    ];
    tones.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    });
  } catch (e) {
    console.error('Error playing dispatch alert:', e);
  }
};