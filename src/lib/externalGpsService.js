import { publishLiveLocation } from '@/lib/liveLocationService';

const listeners = new Set();
let activePort = null;
let activeReader = null;
let connectPromise = null;
let readGeneration = 0;
let serialEventsInstalled = false;
let serialWorker = null;
let pendingWorkerStart = null;
let lineBuffer = '';
let lastMotion = { speed: 0, heading: null };

const STORAGE_BAUD_KEY = 'bps:external-gps-baud';
const DEFAULT_BAUD = 4800;

let state = {
  supported: typeof navigator !== 'undefined' && !!navigator.serial,
  connected: false,
  connecting: false,
  portGranted: false,
  baudRate: DEFAULT_BAUD,
  lastFixAt: null,
  satellites: null,
  hdop: null,
  backgroundReader: false,
  error: '',
};

function emit(patch = {}) {
  state = { ...state, ...patch, supported: typeof navigator !== 'undefined' && !!navigator.serial };
  listeners.forEach(listener => {
    try { listener(state); } catch (_) {}
  });
}

function storedBaud() {
  try {
    const value = Number(localStorage.getItem(STORAGE_BAUD_KEY));
    return [4800, 9600, 38400].includes(value) ? value : DEFAULT_BAUD;
  } catch {
    return DEFAULT_BAUD;
  }
}

function rememberBaud(value) {
  try { localStorage.setItem(STORAGE_BAUD_KEY, String(value)); } catch (_) {}
}

function workerSerialSupported() {
  return externalGpsSupported() && typeof Worker !== 'undefined';
}

function portSelector(port) {
  try {
    const info = port?.getInfo?.() || {};
    return {
      usbVendorId: Number.isFinite(Number(info.usbVendorId)) ? Number(info.usbVendorId) : null,
      usbProductId: Number.isFinite(Number(info.usbProductId)) ? Number(info.usbProductId) : null,
    };
  } catch {
    return {};
  }
}

function ensureSerialWorker() {
  if (serialWorker || !workerSerialSupported()) return serialWorker;
  serialWorker = new Worker(new URL('./externalGpsWorker.js', import.meta.url), {
    type: 'module',
    name: 'bps-external-gps-reader',
  });
  serialWorker.onmessage = event => {
    const data = event?.data || {};
    if (data.type === 'fix' && data.fix) {
      publishLiveLocation(data.fix);
      emit({
        connected: true,
        connecting: false,
        portGranted: true,
        backgroundReader: true,
        lastFixAt: new Date(Number(data.fix.timestamp) || Date.now()).toISOString(),
        satellites: Number.isFinite(Number(data.satellites)) ? Number(data.satellites) : null,
        hdop: Number.isFinite(Number(data.hdop)) ? Number(data.hdop) : null,
        error: '',
      });
      return;
    }
    if (data.type === 'status') {
      const patch = {
        connected: data.connected === true,
        connecting: false,
        portGranted: data.portGranted !== false,
        backgroundReader: data.backgroundReader === true || (data.connected === true && state.backgroundReader),
        baudRate: Number(data.baudRate) || state.baudRate || storedBaud(),
        error: data.error || '',
      };
      emit(patch);
      if (pendingWorkerStart) {
        const pending = pendingWorkerStart;
        pendingWorkerStart = null;
        window.clearTimeout(pending.timeoutId);
        if (data.connected === true) pending.resolve(getExternalGpsStatus());
        else pending.reject(new Error(data.error || 'Unable to open the GPS/COM port in the background reader.'));
      }
    }
  };
  serialWorker.onerror = event => {
    const message = event?.message || 'External GPS background reader failed.';
    emit({ connected: false, connecting: false, backgroundReader: false, error: message });
    if (pendingWorkerStart) {
      const pending = pendingWorkerStart;
      pendingWorkerStart = null;
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
    }
  };
  return serialWorker;
}

function startWorkerPort({ baudRate = storedBaud(), selector = {} } = {}) {
  const worker = ensureSerialWorker();
  if (!worker) return Promise.reject(new Error('Background Web Serial is unavailable.'));
  const baud = [4800, 9600, 38400, 115200].includes(Number(baudRate)) ? Number(baudRate) : DEFAULT_BAUD;
  rememberBaud(baud);
  emit({ connecting: true, error: '', baudRate: baud, portGranted: true, backgroundReader: true });
  if (pendingWorkerStart) {
    window.clearTimeout(pendingWorkerStart.timeoutId);
    pendingWorkerStart.reject(new Error('External GPS connection restarted.'));
    pendingWorkerStart = null;
  }
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (!pendingWorkerStart) return;
      pendingWorkerStart = null;
      emit({ connected: false, connecting: false, backgroundReader: false, error: 'Timed out opening the GPS/COM port in the background reader.' });
      reject(new Error('Timed out opening the GPS/COM port in the background reader.'));
    }, 12000);
    pendingWorkerStart = { resolve, reject, timeoutId };
    worker.postMessage({ type: 'start', baudRate: baud, selector });
  });
}

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

  publishLiveLocation({
    latitude,
    longitude,
    accuracy,
    heading: lastMotion.heading,
    speed: lastMotion.speed,
    timestamp: now,
    source: 'external_serial',
  });
  emit({
    connected: true,
    connecting: false,
    lastFixAt: new Date(now).toISOString(),
    satellites: Number.isFinite(satellites) ? satellites : null,
    hdop: Number.isFinite(hdop) ? hdop : null,
    error: '',
  });
}

async function readLoop(port, generation) {
  const decoder = new TextDecoder();
  try {
    while (activePort === port && generation === readGeneration && port.readable) {
      const reader = port.readable.getReader();
      activeReader = reader;
      try {
        while (activePort === port && generation === readGeneration) {
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
      if (activePort === port && generation === readGeneration) break;
    }
  } catch (error) {
    if (activePort === port && generation === readGeneration) {
      emit({ connected: false, connecting: false, error: error?.message || 'External GPS receiver disconnected.' });
    }
  }
}

async function closeCurrentPort() {
  readGeneration += 1;
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

async function connectPort(port, baudRate) {
  if (!port) throw new Error('No external GPS receiver was selected.');
  const baud = [4800, 9600, 38400].includes(Number(baudRate)) ? Number(baudRate) : DEFAULT_BAUD;
  if (activePort === port && state.connected && state.baudRate === baud) return state;

  emit({ connecting: true, error: '', baudRate: baud, portGranted: true });
  await closeCurrentPort();
  try {
    await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    activePort = port;
    const generation = ++readGeneration;
    rememberBaud(baud);
    emit({ connected: true, connecting: false, baudRate: baud, portGranted: true, error: '' });
    void readLoop(port, generation);
    return state;
  } catch (error) {
    activePort = null;
    emit({ connected: false, connecting: false, error: error?.message || 'Unable to open the external GPS receiver.' });
    throw error;
  }
}

function installSerialEvents() {
  if (serialEventsInstalled || typeof navigator === 'undefined' || !navigator.serial) return;
  serialEventsInstalled = true;
  navigator.serial.addEventListener?.('disconnect', event => {
    if (event?.target === activePort || event?.port === activePort) {
      activePort = null;
      activeReader = null;
      emit({ connected: false, connecting: false, error: 'External GPS receiver disconnected.' });
    }
  });
  navigator.serial.addEventListener?.('connect', () => {
    startExternalGpsAutoReconnect().catch(() => null);
  });
}

export function externalGpsSupported() {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

export function getExternalGpsStatus() {
  return { ...state, supported: externalGpsSupported(), baudRate: state.baudRate || storedBaud() };
}

export function subscribeExternalGpsStatus(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  if (emitCurrent) listener(getExternalGpsStatus());
  return () => listeners.delete(listener);
}

export async function startExternalGpsAutoReconnect() {
  if (!externalGpsSupported()) {
    emit({ supported: false, connected: false });
    return getExternalGpsStatus();
  }
  installSerialEvents();
  if (state.connected || connectPromise) return connectPromise || getExternalGpsStatus();
  connectPromise = navigator.serial.getPorts()
    .then(async ports => {
      emit({ portGranted: Array.isArray(ports) && ports.length > 0 });
      if (!ports?.length) return getExternalGpsStatus();
      return connectPort(ports[0], storedBaud());
    })
    .catch(error => {
      emit({ connected: false, connecting: false, error: error?.message || '' });
      return getExternalGpsStatus();
    })
    .finally(() => { connectPromise = null; });
  return connectPromise;
}

export async function requestExternalGpsConnection({ baudRate = storedBaud() } = {}) {
  if (!externalGpsSupported()) throw new Error('This browser does not support direct USB/serial GPS. Use Chrome or Edge, or let Windows Location Services supply the receiver to the browser.');
  installSerialEvents();
  if (connectPromise) return connectPromise;
  connectPromise = navigator.serial.requestPort()
    .then(port => connectPort(port, baudRate))
    .finally(() => { connectPromise = null; });
  return connectPromise;
}

export async function disconnectExternalGps() {
  await closeCurrentPort();
  emit({ connected: false, connecting: false, lastFixAt: null, satellites: null, hdop: null, error: '' });
  return getExternalGpsStatus();
}
