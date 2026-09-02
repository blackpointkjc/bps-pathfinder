let activePort = null;
let activeReader = null;
let generation = 0;
let lineBuffer = '';
let lastMotion = { speed: 0, heading: null };

function coordinate(value, hemisphere, degreeDigits) {
  const raw = String(value || '').trim();
  if (!raw || raw.length <= degreeDigits) return null;
  const degrees = Number(raw.slice(0, degreeDigits));
  const minutes = Number(raw.slice(degreeDigits));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  let result = degrees + minutes / 60;
  const hemi = String(hemisphere || '').toUpperCase();
  if (hemi === 'S' || hemi === 'W') result *= -1;
  return Number.isFinite(result) ? result : null;
}

function checksumValid(sentence) {
  const line = String(sentence || '').trim();
  if (!line.startsWith('$') || !line.includes('*')) return true;
  const star = line.lastIndexOf('*');
  const expected = Number.parseInt(line.slice(star + 1, star + 3), 16);
  if (!Number.isFinite(expected)) return true;
  let checksum = 0;
  for (let index = 1; index < star; index += 1) checksum ^= line.charCodeAt(index);
  return checksum === expected;
}

function estimatedAccuracy(hdop, fixQuality) {
  const dilution = Number(hdop);
  const quality = Number(fixQuality);
  if (!Number.isFinite(dilution) || dilution <= 0) return quality >= 4 ? 3 : 15;
  const multiplier = quality >= 4 ? 1.5 : quality === 2 ? 3 : 5;
  return Math.max(2, Math.min(1000, dilution * multiplier));
}

function handleSentence(sentence) {
  const line = String(sentence || '').trim();
  if (!line.startsWith('$') || !checksumValid(line)) return;
  const fields = line.replace(/\*[0-9A-F]{2}$/i, '').split(',');
  const type = String(fields[0] || '').slice(-3).toUpperCase();

  if (type === 'RMC') {
    if (String(fields[2] || '').toUpperCase() !== 'A') return;
    const speedKnots = Number(fields[7]);
    const course = Number(fields[8]);
    lastMotion = {
      speed: Number.isFinite(speedKnots) ? speedKnots * 1.150779 : 0,
      heading: Number.isFinite(course) ? course : null,
    };
    return;
  }

  if (type !== 'GGA') return;
  const fixQuality = Number(fields[6]);
  if (!Number.isFinite(fixQuality) || fixQuality <= 0) return;
  const latitude = coordinate(fields[2], fields[3], 2);
  const longitude = coordinate(fields[4], fields[5], 3);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const satellites = Number(fields[7]);
  const hdop = Number(fields[8]);
  const accuracy = estimatedAccuracy(hdop, fixQuality);
  const now = Date.now();

  self.postMessage({
    type: 'fix',
    fix: {
      latitude,
      longitude,
      accuracy,
      heading: lastMotion.heading,
      speed: lastMotion.speed,
      timestamp: now,
      source: 'external_serial',
    },
    satellites: Number.isFinite(satellites) ? satellites : null,
    hdop: Number.isFinite(hdop) ? hdop : null,
  });
}

async function stopPort() {
  generation += 1;
  const reader = activeReader;
  activeReader = null;
  if (reader) {
    try { await reader.cancel(); } catch (_) {}
    try { reader.releaseLock(); } catch (_) {}
  }
  const port = activePort;
  activePort = null;
  if (port?.readable || port?.writable) {
    try { await port.close(); } catch (_) {}
  }
  lineBuffer = '';
}

function portMatches(port, selector = {}) {
  if (!port) return false;
  const info = port.getInfo?.() || {};
  const vendorWanted = Number(selector.usbVendorId);
  const productWanted = Number(selector.usbProductId);
  if (Number.isFinite(vendorWanted) && Number(info.usbVendorId) !== vendorWanted) return false;
  if (Number.isFinite(productWanted) && Number(info.usbProductId) !== productWanted) return false;
  return true;
}

async function selectGrantedPort(selector = {}) {
  if (!self.navigator?.serial?.getPorts) return null;
  const ports = await self.navigator.serial.getPorts();
  if (!ports?.length) return null;
  const selected = ports.find(port => portMatches(port, selector));
  return selected || ports[0];
}

async function readLoop(port, localGeneration) {
  const decoder = new TextDecoder();
  try {
    while (activePort === port && localGeneration === generation && port.readable) {
      const reader = port.readable.getReader();
      activeReader = reader;
      try {
        while (activePort === port && localGeneration === generation) {
          const { value, done } = await reader.read();
          if (done) break;
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() || '';
          lines.forEach(handleSentence);
        }
      } finally {
        try { reader.releaseLock(); } catch (_) {}
        if (activeReader === reader) activeReader = null;
      }
      if (activePort === port && localGeneration === generation) break;
    }
  } catch (error) {
    if (activePort === port && localGeneration === generation) {
      self.postMessage({ type: 'status', connected: false, error: error?.message || 'External GPS receiver disconnected.' });
    }
  }
}

async function startPort({ baudRate = 4800, selector = {} } = {}) {
  await stopPort();
  if (!self.navigator?.serial) {
    self.postMessage({ type: 'status', connected: false, error: 'Web Serial is not available in this background worker.' });
    return;
  }
  const port = await selectGrantedPort(selector);
  if (!port) {
    self.postMessage({ type: 'status', connected: false, portGranted: false, error: 'No approved GPS/COM port is available.' });
    return;
  }
  const baud = [4800, 9600, 38400, 115200].includes(Number(baudRate)) ? Number(baudRate) : 4800;
  try {
    await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    activePort = port;
    const localGeneration = ++generation;
    self.postMessage({ type: 'status', connected: true, portGranted: true, baudRate: baud, error: '', backgroundReader: true });
    void readLoop(port, localGeneration);
  } catch (error) {
    self.postMessage({ type: 'status', connected: false, portGranted: true, error: error?.message || 'Unable to open the approved GPS/COM port.' });
  }
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type === 'start') void startPort(data);
  if (data.type === 'stop') void stopPort().then(() => self.postMessage({ type: 'status', connected: false, error: '' }));
};
