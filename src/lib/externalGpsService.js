import { publishLiveLocation } from '@/lib/liveLocationService';

const listeners = new Set();
let activePort = null;
let activeReader = null;
let connectPromise = null;
let readGeneration = 0;
let serialEventsInstalled = false;
let serialWorker = null;
let pendingWorkerStart = null;
let pendingWorkerStop = null;
let gpsOwner = false;
let gpsOwnerAcquirePromise = null;
let releaseGpsOwnerLock = null;
let gpsChannel = null;
let lineBuffer = '';
let lastMotion = { speed: 0, heading: null };

const STORAGE_BAUD_KEY = 'bps:external-gps-baud';
const STORAGE_SELECTOR_KEY = 'bps:external-gps-selector';
const STORAGE_LOCK_KEY = 'bps:external-gps-locked';
const GPS_OWNER_LOCK = 'bps:pathfinder:external-gps-owner';
const GPS_CHANNEL = 'bps:pathfinder:external-gps-control';
const DEFAULT_BAUD = 4800;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function friendlyOpenError(error) {
  const message = String(error?.message || error || '');
  if (/failed to open serial port|invalidstate|networkerror|busy|in use|already open/i.test(message)) {
    return new Error('The GPS/COM port is already open or still being released. Pathfinder retried the connection. If this continues, close any other Pathfinder tab or GPS/serial program using this antenna, then try again.');
  }
  return error instanceof Error ? error : new Error(message || 'Unable to open the external GPS receiver.');
}

function serialPolicyAllowed() {
  if (typeof document === 'undefined') return true;
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (!policy?.allowsFeature) return true;
  try {
    return policy.allowsFeature('serial');
  } catch {
    return true;
  }
}

function serialApiAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

let state = {
  supported: serialApiAvailable() && serialPolicyAllowed(),
  serialApiAvailable: serialApiAvailable(),
  policyAllowed: serialPolicyAllowed(),
  connected: false,
  connecting: false,
  portGranted: false,
  baudRate: DEFAULT_BAUD,
  lastFixAt: null,
  satellites: null,
  hdop: null,
  backgroundReader: false,
  error: '',
  activeSelector: null,
  lockedToAntenna: false,
  lockedSelector: null,
};

function emit(patch = {}) {
  state = {
    ...state,
    ...patch,
    supported: serialApiAvailable() && serialPolicyAllowed(),
    serialApiAvailable: serialApiAvailable(),
    policyAllowed: serialPolicyAllowed(),
    lockedToAntenna: antennaLockEnabled(),
    lockedSelector: storedSelector(),
  };
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

function storedSelector() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_SELECTOR_KEY) || 'null');
    if (!value || typeof value !== 'object') return null;
    return {
      usbVendorId: Number.isFinite(Number(value.usbVendorId)) ? Number(value.usbVendorId) : null,
      usbProductId: Number.isFinite(Number(value.usbProductId)) ? Number(value.usbProductId) : null,
    };
  } catch {
    return null;
  }
}

function rememberSelector(selector) {
  try { localStorage.setItem(STORAGE_SELECTOR_KEY, JSON.stringify(selector || {})); } catch (_) {}
}

function antennaLockEnabled() {
  try { return localStorage.getItem(STORAGE_LOCK_KEY) === '1'; } catch { return false; }
}

function selectorMatches(port, selector) {
  if (!selector) return false;
  const candidate = portSelector(port);
  const vendorMatches = selector.usbVendorId == null || candidate.usbVendorId === selector.usbVendorId;
  const productMatches = selector.usbProductId == null || candidate.usbProductId === selector.usbProductId;
  return vendorMatches && productMatches && (selector.usbVendorId != null || selector.usbProductId != null);
}

function ensureGpsChannel() {
  if (gpsChannel || typeof BroadcastChannel === 'undefined') return gpsChannel;
  gpsChannel = new BroadcastChannel(GPS_CHANNEL);
  gpsChannel.onmessage = event => {
    const data = event?.data || {};
    if (data.type === 'release-owner' && gpsOwner) {
      void disconnectExternalGps();
    }
  };
  return gpsChannel;
}

async function acquireGpsOwnership({ requestRelease = false, waitMs = 0 } = {}) {
  ensureGpsChannel();
  if (gpsOwner) return true;
  if (!navigator?.locks?.request) return true;
  if (gpsOwnerAcquirePromise) return gpsOwnerAcquirePromise;

  gpsOwnerAcquirePromise = (async () => {
    if (requestRelease) {
      try { gpsChannel?.postMessage({ type: 'release-owner' }); } catch (_) {}
      await delay(250);
    }

    const deadline = Date.now() + Math.max(0, Number(waitMs) || 0);
    do {
      const acquired = await new Promise(resolve => {
        navigator.locks.request(GPS_OWNER_LOCK, { ifAvailable: true, mode: 'exclusive' }, async lock => {
          if (!lock) {
            resolve(false);
            return;
          }
          gpsOwner = true;
          resolve(true);
          await new Promise(release => { releaseGpsOwnerLock = release; });
          releaseGpsOwnerLock = null;
          gpsOwner = false;
        }).catch(() => resolve(true));
      });
      if (acquired) return true;
      if (Date.now() >= deadline) return false;
      await delay(200);
    } while (Date.now() <= deadline);

    return false;
  })().finally(() => {
    gpsOwnerAcquirePromise = null;
  });

  return gpsOwnerAcquirePromise;
}

function releaseGpsOwnership() {
  const release = releaseGpsOwnerLock;
  releaseGpsOwnerLock = null;
  if (release) {
    try { release(); } catch (_) {}
  }
  gpsOwner = false;
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
      if (pendingWorkerStop && data.connected === false) {
        const pending = pendingWorkerStop;
        pendingWorkerStop = null;
        window.clearTimeout(pending.timeoutId);
        pending.resolve(getExternalGpsStatus());
      }
      if (pendingWorkerStart) {
        const pending = pendingWorkerStart;
        pendingWorkerStart = null;
        window.clearTimeout(pending.timeoutId);
        if (data.connected === true) pending.resolve(getExternalGpsStatus());
        else pending.reject(friendlyOpenError(data.error || 'Unable to open the GPS/COM port in the background reader.'));
      }
    }
  };
  serialWorker.onerror = event => {
    const message = event?.message || 'External GPS background reader failed.';
    emit({ connected: false, connecting: false, backgroundReader: false, error: message });
    if (pendingWorkerStop) {
      const pending = pendingWorkerStop;
      pendingWorkerStop = null;
      window.clearTimeout(pending.timeoutId);
      pending.resolve(getExternalGpsStatus());
    }
    if (pendingWorkerStart) {
      const pending = pendingWorkerStart;
      pendingWorkerStart = null;
      window.clearTimeout(pending.timeoutId);
      pending.reject(friendlyOpenError(message));
    }
  };
  return serialWorker;
}

async function stopWorkerPort({ terminate = false } = {}) {
  if (!serialWorker) return;
  if (pendingWorkerStart) {
    window.clearTimeout(pendingWorkerStart.timeoutId);
    pendingWorkerStart.reject(new Error('External GPS connection restarted.'));
    pendingWorkerStart = null;
  }
  await new Promise(resolve => {
    const timeoutId = window.setTimeout(() => {
      if (pendingWorkerStop) pendingWorkerStop = null;
      resolve();
    }, 4000);
    pendingWorkerStop = { resolve, timeoutId };
    try { serialWorker.postMessage({ type: 'stop' }); }
    catch (_) {
      window.clearTimeout(timeoutId);
      pendingWorkerStop = null;
      resolve();
    }
  });
  if (terminate && serialWorker) {
    try { serialWorker.terminate(); } catch (_) {}
    serialWorker = null;
  }
}

async function startWorkerPort({ baudRate = storedBaud(), selector = {} } = {}) {
  if (serialWorker && state.backgroundReader) {
    await stopWorkerPort({ terminate: false });
    await delay(180);
  }
  const worker = ensureSerialWorker();
  if (!worker) throw new Error('Background Web Serial is unavailable.');
  const baud = [4800, 9600, 38400, 115200].includes(Number(baudRate)) ? Number(baudRate) : DEFAULT_BAUD;
  rememberBaud(baud);
  rememberSelector(selector);
  emit({ connecting: true, error: '', baudRate: baud, portGranted: true, backgroundReader: true, activeSelector: selector, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
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
  const baud = [4800, 9600, 38400, 115200].includes(Number(baudRate)) ? Number(baudRate) : DEFAULT_BAUD;
  if (activePort === port && state.connected && state.baudRate === baud) return state;

  emit({ connecting: true, error: '', baudRate: baud, portGranted: true });
  await closeCurrentPort();
  await delay(350);

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      activePort = port;
      const generation = ++readGeneration;
      rememberBaud(baud);
      const selector = portSelector(port);
      rememberSelector(selector);
      emit({ connected: true, connecting: false, baudRate: baud, portGranted: true, error: '', activeSelector: selector, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
      void readLoop(port, generation);
      return state;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || '');
      if (!/failed to open serial port|invalidstate|networkerror|busy|in use|already open/i.test(message) || attempt === 5) break;
      try { if (port?.readable || port?.writable) await port.close(); } catch (_) {}
      const waits = [300, 500, 800, 1200, 1800, 2200];
      await delay(waits[attempt] || 1200);
    }
  }

  activePort = null;
  const friendly = friendlyOpenError(lastError);
  emit({ connected: false, connecting: false, error: friendly.message });
  throw friendly;
}

function installSerialEvents() {
  if (serialEventsInstalled || typeof navigator === 'undefined' || !navigator.serial) return;
  serialEventsInstalled = true;

  if (typeof window !== 'undefined') {
    const releaseOnPageExit = () => {
      try { serialWorker?.postMessage({ type: 'stop' }); } catch (_) {}
      try { serialWorker?.terminate(); } catch (_) {}
      serialWorker = null;
      releaseGpsOwnership();
    };
    window.addEventListener('pagehide', releaseOnPageExit, { capture: true });
    window.addEventListener('beforeunload', releaseOnPageExit, { capture: true });
  }

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
  return serialApiAvailable() && serialPolicyAllowed();
}

export function getExternalGpsStatus() {
  return {
    ...state,
    supported: externalGpsSupported(),
    serialApiAvailable: serialApiAvailable(),
    policyAllowed: serialPolicyAllowed(),
    baudRate: state.baudRate || storedBaud(),
    lockedToAntenna: antennaLockEnabled(),
    lockedSelector: storedSelector(),
  };
}

export function subscribeExternalGpsStatus(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  if (emitCurrent) listener(getExternalGpsStatus());
  return () => listeners.delete(listener);
}

export async function startExternalGpsAutoReconnect() {
  if (!externalGpsSupported()) {
    emit({ supported: false, connected: false, backgroundReader: false });
    return getExternalGpsStatus();
  }
  installSerialEvents();
  if (state.connected || connectPromise) return connectPromise || getExternalGpsStatus();

  connectPromise = (async () => {
    const ownsPort = await acquireGpsOwnership({ waitMs: 0 });
    if (!ownsPort) {
      emit({ connected: false, connecting: false, backgroundReader: false, error: '' });
      return getExternalGpsStatus();
    }

    try {
      const ports = await navigator.serial.getPorts();
      emit({ portGranted: Array.isArray(ports) && ports.length > 0, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
      if (!ports?.length) {
        releaseGpsOwnership();
        return getExternalGpsStatus();
      }

      const remembered = storedSelector();
      const locked = antennaLockEnabled();
      const selectedPort = remembered ? ports.find(port => selectorMatches(port, remembered)) : null;
      if (locked && !selectedPort) {
        emit({ connected: false, connecting: false, backgroundReader: false, error: 'Locked GPS antenna is not currently available.' });
        releaseGpsOwnership();
        return getExternalGpsStatus();
      }

      const preferredPort = selectedPort || ports[0];
      const selector = portSelector(preferredPort);
      const hasStableSelector = selector.usbVendorId != null || selector.usbProductId != null;
      if (workerSerialSupported() && hasStableSelector) {
        try {
          return await startWorkerPort({ baudRate: storedBaud(), selector });
        } catch (workerError) {
          console.warn('External GPS worker reconnect failed, using page reader:', workerError?.message);
          await stopWorkerPort({ terminate: true });
          await delay(350);
        }
      }

      emit({ backgroundReader: false });
      return await connectPort(preferredPort, storedBaud());
    } catch (error) {
      const friendly = friendlyOpenError(error);
      emit({ connected: false, connecting: false, backgroundReader: false, error: friendly.message });
      releaseGpsOwnership();
      return getExternalGpsStatus();
    }
  })().finally(() => { connectPromise = null; });

  return connectPromise;
}

export async function requestExternalGpsConnection({ baudRate = storedBaud() } = {}) {
  if (!serialApiAvailable()) {
    throw new Error('Direct USB/serial GPS is not available in this browser. Use Windows Location Services or Pathfinder Desktop.');
  }
  if (!serialPolicyAllowed()) {
    throw new Error('Direct external GPS selection is unavailable in this browser session.');
  }
  installSerialEvents();
  if (connectPromise) return connectPromise;

  // Keep requestPort directly attached to the user's click. Ownership handoff is
  // performed only after the user selects the receiver, so Chromium's user-gesture
  // requirement is preserved.
  connectPromise = navigator.serial.requestPort()
    .then(async port => {
      const selector = portSelector(port);
      const lockedSelector = storedSelector();
      if (antennaLockEnabled() && lockedSelector && !selectorMatches(port, lockedSelector)) {
        throw new Error('This computer is locked to a different GPS antenna. Unlock the saved antenna before changing receivers.');
      }

      const selectedBaud = Number(baudRate) || DEFAULT_BAUD;
      if (state.connected && state.activeSelector && selectorMatches(port, state.activeSelector) && Number(state.baudRate) === selectedBaud) {
        return getExternalGpsStatus();
      }

      const ownsPort = await acquireGpsOwnership({ requestRelease: true, waitMs: 7000 });
      if (!ownsPort) {
        throw new Error('Another Pathfinder tab is still using the GPS antenna. Close the other Pathfinder tab and try again.');
      }

      rememberSelector(selector);
      await stopWorkerPort({ terminate: true });
      await closeCurrentPort();
      await delay(400);

      const hasStableSelector = selector.usbVendorId != null || selector.usbProductId != null;
      if (workerSerialSupported() && hasStableSelector) {
        try {
          return await startWorkerPort({ baudRate, selector });
        } catch (workerError) {
          console.warn('External GPS background reader unavailable, using exact selected port:', workerError?.message);
          await stopWorkerPort({ terminate: true });
          await delay(400);
        }
      }

      // If the receiver does not expose stable USB IDs, never let the worker
      // guess among approved COM ports. Open the exact SerialPort selected by
      // the officer in this tab.
      emit({ backgroundReader: false });
      return await connectPort(port, baudRate);
    })
    .catch(error => {
      releaseGpsOwnership();
      throw friendlyOpenError(error);
    })
    .finally(() => { connectPromise = null; });

  return connectPromise;
}

export function lockExternalGpsToCurrentAntenna() {
  const selector = state.activeSelector || storedSelector();
  if (!selector || (selector.usbVendorId == null && selector.usbProductId == null)) {
    throw new Error('Pathfinder cannot identify this receiver well enough to lock it. Connect a USB antenna that reports a hardware ID.');
  }
  rememberSelector(selector);
  try { localStorage.setItem(STORAGE_LOCK_KEY, '1'); } catch (_) {}
  emit({ lockedToAntenna: true, lockedSelector: selector });
  return getExternalGpsStatus();
}

export function unlockExternalGpsAntenna() {
  try { localStorage.removeItem(STORAGE_LOCK_KEY); } catch (_) {}
  emit({ lockedToAntenna: false, lockedSelector: storedSelector() });
  return getExternalGpsStatus();
}

export async function disconnectExternalGps() {
  await stopWorkerPort({ terminate: true });
  if (pendingWorkerStart) {
    window.clearTimeout(pendingWorkerStart.timeoutId);
    pendingWorkerStart.reject(new Error('External GPS disconnected.'));
    pendingWorkerStart = null;
  }
  await closeCurrentPort();
  await delay(120);
  releaseGpsOwnership();
  emit({ connected: false, connecting: false, backgroundReader: false, lastFixAt: null, satellites: null, hdop: null, error: '' });
  return getExternalGpsStatus();
}
