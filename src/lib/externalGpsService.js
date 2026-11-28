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
let lastGgaFixAt = 0;
let nextAutomaticReconnectAt = 0;
let consecutiveReconnectFailures = 0;
let lastSerialDataAt = 0;
let manualDisconnect = false;
let reconnectTimer=null;
let workerUnsupported=false;
let handoffUntil=0;
let suspended=false;
const SERIAL_STALL_MS = 18_000;
const RECOVERY_COOLDOWN_MS = 8_000;

const STORAGE_BAUD_KEY = 'bps:external-gps-baud';
const STORAGE_SELECTOR_KEY = 'bps:external-gps-selector';
const STORAGE_LOCK_KEY = 'bps:external-gps-locked';
const STORAGE_MODE_KEY = 'bps:external-gps-source-preference';
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
  baudRate: storedBaud(),
  connectedAt: null,
  lastFixAt: null,
  lastDataAt: null,
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
    return [4800, 9600, 38400, 115200].includes(value) ? value : DEFAULT_BAUD;
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

function gpsPreferredSource() {
  try { return localStorage.getItem(STORAGE_MODE_KEY) || 'external'; } catch { return 'external'; }
}

function rememberGpsSource(value) {
  try { localStorage.setItem(STORAGE_MODE_KEY, value); } catch {}
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
      void yieldExternalGpsOwnership();
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
        }).catch(() => resolve(false));
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
  return !workerUnsupported && externalGpsSupported() && typeof Worker !== 'undefined';
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
    if (data.type === 'data') {
      lastSerialDataAt = Date.now();
      if (!state.lastDataAt || Date.now() - Date.parse(state.lastDataAt) > 4000) emit({ lastDataAt: new Date().toISOString() });
      return;
    }
    if (data.type === 'read_warning' && data.code === 'SERIAL_FRAMING') {
      emit({ connected:true, connecting:false, error:String(data.message||'GPS serial data is being recovered.') });
      return;
    }
    if (data.type === 'fix' && data.fix) {
      publishLiveLocation(data.fix);
      lastSerialDataAt = Date.now();
      consecutiveReconnectFailures = 0;
      nextAutomaticReconnectAt=0;
      emit({
        lastDataAt: new Date().toISOString(),
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
        connectedAt: data.connected === true ? (state.connectedAt || new Date().toISOString()) : null,
        connecting: false,
        portGranted: data.portGranted !== false,
        backgroundReader: data.backgroundReader === true || (data.connected === true && state.backgroundReader),
        baudRate: Number(data.baudRate) || state.baudRate || storedBaud(),
        error: data.error || '',
        lastDataAt: state.lastDataAt,
      };
      const expectedStop=!!pendingWorkerStop;
      if(data.connected===true){nextAutomaticReconnectAt=0;consecutiveReconnectFailures=0;lastSerialDataAt=Date.now();}
      emit(patch);
      if(data.connected!==true&&!expectedStop&&!pendingWorkerStart&&!connectPromise)queueReconnect(500,true);
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
    emit({ connected: false, connectedAt: null, connecting: false, backgroundReader: false, error: message });
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
    }else if(!connectPromise){workerUnsupported=true;queueReconnect(500,true);}
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
  emit({ connecting: true, error: '', lastFixAt: null, lastDataAt: null, satellites: null, hdop: null, baudRate: baud, portGranted: true, backgroundReader: true, activeSelector: selector, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
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
    }, 5000);
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
    const speedMph = Number.isFinite(speedKnots) ? speedKnots * 1.150779 : 0;
    lastMotion = {
      // Consumer-grade GNSS receivers can report several MPH of false motion
      // while parked. Treat anything below 5 MPH as stationary so a stopped patrol
      // unit cannot appear to be creeping at 3–4 MPH on live CAD maps.
      speed: speedMph >= 5 ? speedMph : 0,
      heading: Number.isFinite(course) ? course : null,
    };
    // Retain location from receivers that stream RMC without GGA; do not
    // overwrite a recent higher-quality GGA satellite position.
    if (Date.now() - lastGgaFixAt > 5000) {
      const latitude = coordinate(fields[3], fields[4], 2);
      const longitude = coordinate(fields[5], fields[6], 3);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const now = Date.now();
        publishLiveLocation({ latitude, longitude, accuracy: 100,
          speed: lastMotion.speed, heading: lastMotion.heading,
          timestamp: now, source: 'external_serial' });
        emit({ connected: true, connecting: false, lastFixAt: new Date(now).toISOString(), error: '' });
      }
    }
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
  lastGgaFixAt = now;

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

const recoverableSerialError = error => /framing|parity|buffer.?overrun|break.?error/i.test(String(error?.name || '')+' '+String(error?.message || ''));
async function readLoop(port, generation) {
  const decoder=new TextDecoder();
  let recentErrors=0;
  let windowStart=Date.now();
  try {
    while (activePort === port && generation === readGeneration && port.readable) {
      const reader = port.readable.getReader();
      activeReader = reader;
      let recoverable=false;
      try {
        while (activePort === port && generation === readGeneration) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.byteLength) {
            lastSerialDataAt = Date.now();
            recentErrors=0;
            windowStart=Date.now();
            if (!state.lastDataAt || lastSerialDataAt - Date.parse(state.lastDataAt) > 4000) emit({ lastDataAt: new Date().toISOString(), error:'' });
          }
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split(/\r\n|\n|\r/);
          lineBuffer = (lines.pop() || '').slice(-4096);
          lines.forEach(handleSentence);
        }
      } catch (error) {
        if (!(activePort === port && generation === readGeneration) || !port.readable || !recoverableSerialError(error)) throw error;
        recoverable=true;
        lineBuffer='';
        const now=Date.now();
        if(now-windowStart>30000){recentErrors=0;windowStart=now;}
        recentErrors++;
        if(recentErrors===3 || recentErrors===8){
          emit({ connected:true, error:'GPS framing errors detected; recovering the serial stream. If repeated, verify the antenna baud rate in GPS settings.' });
        }
        await delay(Math.min(2000,150*recentErrors));
      } finally {
        try { reader.releaseLock(); } catch (_) {}
        if (activeReader === reader) activeReader = null;
      }
      if(!recoverable)break;
    }
  } catch(error){
    if(activePort===port && generation===readGeneration)
      emit({ connected:false, connecting:false, error:error?.message||'External GPS receiver disconnected.' });
  }
  if(activePort===port && generation===readGeneration){
    emit({connected:false,connecting:false,connectedAt:null,error:'GPS serial stream disconnected. Reconnecting approved antenna…'});
    queueReconnect(500,true);
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
  // Explicit reconnects must reopen even the same active port.

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
      lastSerialDataAt = Date.now();
      nextAutomaticReconnectAt=0;consecutiveReconnectFailures=0;
      emit({ connected: true, connectedAt: new Date().toISOString(), connecting: false, baudRate: baud, portGranted: true, lastDataAt: null, lastFixAt: null, satellites: null, hdop: null, error: '', activeSelector: selector, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
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

// Independent receiver recovery, not tied to map or React component remounts.
function queueReconnect(delayMs=500,reset=false){
  if(manualDisconnect||suspended||gpsPreferredSource()==='device')return;
  if(reset){nextAutomaticReconnectAt=0;consecutiveReconnectFailures=0;}
  clearTimeout(reconnectTimer);
  reconnectTimer=setTimeout(async()=>{
    reconnectTimer=null;
    if(connectPromise){try{await connectPromise;}catch{}}
    if(manualDisconnect||suspended||gpsPreferredSource()==='device')return;
    await startExternalGpsAutoReconnect({recoverStale:true}).catch(()=>null);
    if(!state.connected&&(state.portGranted||storedSelector()||antennaLockEnabled())&&!manualDisconnect&&!suspended&&gpsPreferredSource()!=='device')queueReconnect(Math.max(1000,nextAutomaticReconnectAt-Date.now(),handoffUntil-Date.now()));
  },Math.max(100,delayMs));
}
async function yieldExternalGpsOwnership(){
  handoffUntil=Date.now()+10000;
  clearTimeout(reconnectTimer);
  await stopWorkerPort({terminate:true}).catch(()=>null);
  await closeCurrentPort().catch(()=>null);
  releaseGpsOwnership();
  emit({connected:false,connecting:false,connectedAt:null,backgroundReader:false,error:'Receiver in use by another Pathfinder tab.'});
  queueReconnect(10000);
}
function installSerialEvents() {
  if (serialEventsInstalled || typeof navigator === 'undefined' || !navigator.serial) return;
  serialEventsInstalled = true;
  if(typeof window!=='undefined'){
    window.addEventListener('pagehide',()=>{
      suspended=true;clearTimeout(reconnectTimer);
      try{serialWorker?.terminate();}catch{}
      serialWorker=null;
      void closeCurrentPort().finally(releaseGpsOwnership);
      emit({connected:false,connecting:false,connectedAt:null,backgroundReader:false});
    });
    const resume=()=>{if(document.visibilityState==='hidden')return;suspended=false;queueReconnect(100,true);};
    window.addEventListener('pageshow',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('bps-operational-resume',resume);
    document.addEventListener('visibilitychange',resume);
    // A worker-owned port is not equal to the page's SerialPort object.
    // Match the approved hardware selector as well as the page port.
    navigator.serial.addEventListener?.('disconnect',event=>{
      const port=event?.port||event?.target;
      const selector=state.activeSelector||storedSelector();
      if(port!==activePort&&!selectorMatches(port,selector)&&!(state.backgroundReader&&state.connected&&!port?.getInfo))return;
      void (async()=>{
        await stopWorkerPort({terminate:true}).catch(()=>null);
        await closeCurrentPort().catch(()=>null);
        releaseGpsOwnership();
        emit({connected:false,connectedAt:null,connecting:false,backgroundReader:false,error:'External GPS receiver disconnected. Reconnecting…'});
        queueReconnect(250,true);
      })();
    });
    navigator.serial.addEventListener?.('connect',()=>{queueReconnect(100,true);});
  }
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
    preferredSource:gpsPreferredSource(),
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

export async function startExternalGpsAutoReconnect({ recoverStale = false } = {}) {
  if (!externalGpsSupported()) {
    emit({ supported: false, connected: false, backgroundReader: false });
    return getExternalGpsStatus();
  }
  installSerialEvents();
  if (manualDisconnect || suspended || Date.now()<handoffUntil || gpsPreferredSource() === 'device') return getExternalGpsStatus();
  if (connectPromise) return connectPromise;

  // No NMEA satellite fix is NOT a USB disconnection. GPS receivers can keep
  // streaming valid NMEA sentences through tunnels, garages or poor sky view.
  // Never close an open COM port solely because its last satellite fix is old.
  const connectedAtMs = state.connectedAt ? Date.parse(state.connectedAt) : 0;
  const dataAtMs = lastSerialDataAt || (state.lastDataAt ? Date.parse(state.lastDataAt) : 0);
  const serialStreamStalled = state.connected && recoverStale
    // Chromium may freeze worker-to-page messages while minimized. Resume
    // before deciding a physically connected COM port has stopped streaming.
    && (typeof document === 'undefined' || document.visibilityState === 'visible')
    && connectedAtMs > 0 && Date.now() - connectedAtMs > SERIAL_STALL_MS
    && Date.now() - (dataAtMs || connectedAtMs) > SERIAL_STALL_MS;
  if (state.connected && !serialStreamStalled) return getExternalGpsStatus();
  if (Date.now() < nextAutomaticReconnectAt){if(!state.connected)queueReconnect(nextAutomaticReconnectAt-Date.now());return getExternalGpsStatus();}
  // Gate all automatic retries, including concurrent watchdogs on navigation,
  // login and time clock. Real transport failures use bounded exponential backoff.
  nextAutomaticReconnectAt = Date.now() + (serialStreamStalled
    ? RECOVERY_COOLDOWN_MS
    : Math.min(15000, 1000 * 2 ** Math.min(consecutiveReconnectFailures, 4)));

  emit({connecting:true,error:''});
  connectPromise = (async () => {
    if (serialStreamStalled) {
      // Only a silent serial data stream, not missing satellite fixes, can
      // initiate a port restart; a cooldown prevents oscillation.
      await stopWorkerPort({ terminate: true }).catch(() => null);
      await closeCurrentPort().catch(() => null);
      releaseGpsOwnership();
      emit({ connected: false, connectedAt: null, connecting: true, backgroundReader: false, error: '' });
      await delay(300);
    }

    const ownsPort = await acquireGpsOwnership({ requestRelease: false, waitMs: serialStreamStalled ? 2500 : 0 });
    if (!ownsPort) {
      emit({ connected: false, connecting: false, backgroundReader: false, error: '' });
      return getExternalGpsStatus();
    }

    try {
      const ports = await navigator.serial.getPorts();
      emit({ portGranted: Array.isArray(ports) && ports.length > 0, lockedToAntenna: antennaLockEnabled(), lockedSelector: storedSelector() });
      if (!ports?.length) {
        emit({connected:false,connecting:false,error:'Waiting for the approved GPS receiver to be attached.'});
        releaseGpsOwnership();
        return getExternalGpsStatus();
      }

      const remembered = storedSelector();
      const locked = antennaLockEnabled();
      const matches=remembered?ports.filter(port=>selectorMatches(port,remembered)):[];
      const selectedPort=matches.length===1?matches[0]:null;
      if (locked && !selectedPort) {
        emit({ connected: false, connecting: false, backgroundReader: false, error: 'Locked GPS antenna is not currently available.' });
        releaseGpsOwnership();
        return getExternalGpsStatus();
      }

      const preferredPort = selectedPort || (!remembered&&ports.length === 1 ? ports[0] : null);
      if (!preferredPort) {
        emit({
          connected: false,
          connectedAt: null,
          connecting: false,
          backgroundReader: false,
          error: 'Multiple approved COM ports are available. Select the GPS antenna from Pathfinder before reconnecting.',
        });
        releaseGpsOwnership();
        return getExternalGpsStatus();
      }
      const selector = portSelector(preferredPort);
      const hasStableSelector = selector.usbVendorId != null || selector.usbProductId != null;
      if (workerSerialSupported() && hasStableSelector) {
        try {
          const ready = await startWorkerPort({ baudRate: storedBaud(), selector });
          consecutiveReconnectFailures = 0;
          return ready;
        } catch (workerError) {
          workerUnsupported=true;
          console.warn('External GPS worker reconnect failed, using page reader:', workerError?.message);
          await stopWorkerPort({ terminate: true });
          await delay(350);
        }
      }

      emit({ backgroundReader: false });
      const ready = await connectPort(preferredPort, storedBaud());
      consecutiveReconnectFailures = 0;
      return ready;
    } catch (error) {
      consecutiveReconnectFailures += 1;
      const friendly = friendlyOpenError(error);
      emit({ connected: false, connecting: false, backgroundReader: false, error: friendly.message });
      releaseGpsOwnership();
      return getExternalGpsStatus();
    }
  })().finally(() => { connectPromise = null; if(!state.connected&&(state.portGranted||storedSelector()||antennaLockEnabled()))queueReconnect(Math.max(1000,nextAutomaticReconnectAt-Date.now())); });

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
  manualDisconnect = false;
  suspended=false;handoffUntil=0;clearTimeout(reconnectTimer);
  nextAutomaticReconnectAt = 0;
  consecutiveReconnectFailures = 0;

  // A previously authorized COM port can be reopened without a native browser
  // chooser. The OS/browser permission dialog is needed only on first approval,
  // or when the saved receiver is no longer available and a new one is chosen.
  // Try the exact in-memory port first, then the unique saved USB identity.
  // Never silently substitute a different COM port when multiple ports share
  // identical USB vendor/product IDs (Windows serial adapters often do).
  const saved = storedSelector();
  // On initial approval, open the native permission chooser immediately in
  // the user's click; awaiting getPorts first could lose Chromium activation.
  const firstPermission = !saved && !state.portGranted;
  const selectPort = firstPermission ? navigator.serial.requestPort() : (async () => {
    const authorized = await navigator.serial.getPorts().catch(() => []);
    const matching = saved ? authorized.filter(port => selectorMatches(port, saved)) : [];
    const reuse = activePort && authorized.includes(activePort) ? activePort
      : matching.length === 1 ? matching[0]
      : !saved && authorized.length === 1 ? authorized[0] : null;
    if (reuse) return reuse;
    if (antennaLockEnabled() && saved) {
      emit({ connected:false, connecting:false, portGranted:authorized.length>0,
        error:'Saved antenna is unavailable. Change the receiver from Pathfinder settings.' });
      throw new Error('Saved receiver is missing or ambiguous. Use GPS settings to authorize a replacement.');
    }
    // On a deliberate replacement (after unlock), permission is still owned
    // by Chromium; no app can legally bypass its native authorization UI.
    return navigator.serial.requestPort();
  })();
  connectPromise = selectPort
    .then(async port => {
      const selector = portSelector(port);
      const lockedSelector = storedSelector();
      if (antennaLockEnabled() && lockedSelector && !selectorMatches(port, lockedSelector)) {
        throw new Error('This computer is locked to a different GPS antenna. Unlock the saved antenna before changing receivers.');
      }

      const selectedBaud = Number(baudRate) || DEFAULT_BAUD;
      // A connected COM port can be silently streaming no NMEA data or no
      // position. An explicit user reconnect must actually restart the reader.
      // Otherwise the Reconnect button returns success without doing anything.

      const ownsPort = await acquireGpsOwnership({ requestRelease: true, waitMs: 7000 });
      if (!ownsPort) {
        throw new Error('Another Pathfinder tab is still using the GPS antenna. Close the other Pathfinder tab and try again.');
      }

      rememberSelector(selector);
      rememberGpsSource('external');
      // The selected receiver is pinned across app sessions. Reconnect/baud
      // refreshes reuse its existing permission without reopening the chooser.
      if (selector.usbVendorId != null || selector.usbProductId != null) {
        try { localStorage.setItem(STORAGE_LOCK_KEY, '1'); } catch (_) {}
      }
      await stopWorkerPort({ terminate: true });
      await closeCurrentPort();
      await delay(400);

      const hasStableSelector = selector.usbVendorId != null || selector.usbProductId != null;
      const approvedMatches = (await navigator.serial.getPorts().catch(() => []))
        .filter(approved => selectorMatches(approved, selector));
      // The worker can identify USB vendor/product but not Windows COM numbers.
      // With two ports exposing the same ID, it must not guess the wrong COM.
      if (workerSerialSupported() && hasStableSelector && approvedMatches.length === 1) {
        try {
          return await startWorkerPort({ baudRate, selector });
        } catch (workerError) {
          workerUnsupported=true;
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
  // Unlock means the next receiver chooser must be free to select a different
  // device. Clear both the lock flag and saved selector so a stale USB ID cannot
  // silently steer reconnection back to the old antenna.
  try {
    localStorage.removeItem(STORAGE_LOCK_KEY);
    localStorage.removeItem(STORAGE_SELECTOR_KEY);
  } catch (_) {}
  emit({ lockedToAntenna: false, lockedSelector: null, activeSelector: state.connected ? state.activeSelector : null });
  return getExternalGpsStatus();
}

export async function disconnectExternalGps() {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  rememberGpsSource('device');
  nextAutomaticReconnectAt = Date.now() + 30_000;
  await stopWorkerPort({ terminate: true });
  if (pendingWorkerStart) {
    window.clearTimeout(pendingWorkerStart.timeoutId);
    pendingWorkerStart.reject(new Error('External GPS disconnected.'));
    pendingWorkerStart = null;
  }
  await closeCurrentPort();
  await delay(120);
  releaseGpsOwnership();
  emit({ connected: false, connectedAt: null, connecting: false, backgroundReader: false, lastFixAt: null, satellites: null, hdop: null, error: '' });
  return getExternalGpsStatus();
}
