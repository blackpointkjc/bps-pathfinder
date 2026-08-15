// In-app operational voice announcements using the browser's speech engine.
// This intentionally uses a distinct, deep tactical cadence rather than cloning
// any named actor or character voice.

import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';

let lastText = '';
let lastAt = 0;

function getPreferredVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  return voices.find(v => /en-US/i.test(v.lang) && /male|david|alex|daniel|aaron|fred/i.test(v.name))
    || voices.find(v => /en-US/i.test(v.lang))
    || voices.find(v => /^en/i.test(v.lang))
    || voices[0]
    || null;
}

export function isVoiceSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function isVoiceEnabled() {
  try {
    return localStorage.getItem('bps-voice-enabled') !== 'false';
  } catch {
    return true;
  }
}

export function setVoiceEnabled(enabled) {
  try { localStorage.setItem('bps-voice-enabled', enabled ? 'true' : 'false'); } catch {}
}

export function stopVoice() {
  if (!isVoiceSupported()) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

function buildUtterance(clean, options = {}) {
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = options.lang || 'en-US';
  utterance.rate = options.rate ?? 0.88;
  utterance.pitch = options.pitch ?? 0.72;
  utterance.volume = options.volume ?? 1;
  const voice = getPreferredVoice();
  if (voice) utterance.voice = voice;
  return utterance;
}

function acceptText(clean, dedupeMs) {
  const now = Date.now();
  if (clean === lastText && now - lastAt < dedupeMs) return false;
  lastText = clean;
  lastAt = now;
  return true;
}

let pendingSpeech = null;
let speechSequence = 0;
let unlockListenersInstalled = false;

function speakQueued(clean, options = {}) {
  if (!isVoiceSupported()) return false;
  const token = ++speechSequence;
  let started = false;
  pendingSpeech = { clean, options };
  try {
    const utterance = buildUtterance(clean, options);
    utterance.onstart = () => {
      started = true;
      if (token === speechSequence) pendingSpeech = null;
      window.dispatchEvent(new CustomEvent('bps-voice-started', { detail: { text: clean } }));
    };
    utterance.onend = () => {
      if (token === speechSequence) pendingSpeech = null;
    };
    utterance.onerror = () => {
      if (token === speechSequence && !started) pendingSpeech = { clean, options };
    };
    if (options.interrupt !== false) window.speechSynthesis.cancel();
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      if (token === speechSequence && !started && !window.speechSynthesis.speaking) {
        pendingSpeech = { clean, options };
        window.dispatchEvent(new CustomEvent('bps-voice-blocked'));
      }
    }, 1200);
    return true;
  } catch {
    if (token === speechSequence) pendingSpeech = { clean, options };
    return false;
  }
}

function retryPendingSpeech() {
  if (!pendingSpeech || !isVoiceSupported()) return;
  const queued = pendingSpeech;
  window.speechSynthesis.resume?.();
  speakQueued(queued.clean, { ...queued.options, interrupt: true });
}

export function installVoiceUnlockListeners() {
  if (unlockListenersInstalled || typeof window === 'undefined') return;
  unlockListenersInstalled = true;
  const retry = () => retryPendingSpeech();
  window.addEventListener('pointerdown', retry, true);
  window.addEventListener('touchend', retry, true);
  window.addEventListener('keydown', retry, true);
  window.addEventListener('focus', retry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryPendingSpeech();
  });
}

export function retryVoiceAnnouncement() {
  retryPendingSpeech();
}

export function announceVoice(text, options = {}) {
  if (!text || !isVoiceSupported() || (!options.force && !isVoiceEnabled())) return false;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean || !acceptText(clean, options.dedupeMs ?? 1800)) return false;
  installVoiceUnlockListeners();
  return speakQueued(clean, options);
}

// Promise form used by emergency notifications so a secondary alert tone can
// be deliberately delayed until the spoken safety announcement has finished.
export function announceVoiceAsync(text, options = {}) {
  if (!text || !isVoiceSupported() || !isVoiceEnabled()) return Promise.resolve(false);
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean || !acceptText(clean, options.dedupeMs ?? 1800)) return Promise.resolve(false);
  return new Promise(resolve => {
    try {
      const utterance = buildUtterance(clean, options);
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      if (options.interrupt !== false) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve(false);
    }
  });
}

export function announceNavigationInstruction(instruction, distanceFeet) {
  if (!instruction) return;
  const distance = Number(distanceFeet);
  const distanceText = Number.isFinite(distance) && distance > 0
    ? distance < 1000 ? `in ${Math.round(distance)} feet`
      : `in ${(distance / 5280).toFixed(1)} miles`
    : '';
  announceVoice(`Navigation advisory. ${instruction}${distanceText ? `, ${distanceText}` : ''}.`, { dedupeMs: 3000, rate: 0.84, pitch: 0.68 });
}

export function announcePropertyCall({
  propertyName,
  incident,
  location,
  reference,
  createdAt,
  priority,
  status,
  agency,
  zone,
  crossStreet,
  landmark,
  description,
  hazards,
  callerName,
  callerPhone,
  assignedUnits,
}) {
  let timeText = '';
  if (createdAt) {
    const parsed = parseServerTimestamp(createdAt);
    if (parsed) timeText = formatEasternTime(parsed);
  }
  const units = Array.isArray(assignedUnits) ? assignedUnits.filter(Boolean).join(', ') : String(assignedUnits || '').trim();
  const detailsDuplicate = String(description || '').trim().toLowerCase()
    === `${String(incident || '').trim()} at ${String(location || '').trim()}`.toLowerCase();
  const parts = [
    'Active call for service.',
    incident ? `${incident}.` : 'Unknown incident.',
    location ? `At ${location}.` : 'Address unavailable.',
    priority ? `Priority ${priority}.` : '',
    status ? `Status ${status}.` : '',
    propertyName ? `Property ${propertyName}.` : '',
    timeText ? `Call received at ${timeText} Eastern Time.` : '',
    crossStreet ? `Cross street: ${crossStreet}.` : '',
    landmark ? `Landmark: ${landmark}.` : '',
    agency ? `Agency: ${agency}.` : '',
    zone ? `Zone: ${zone}.` : '',
    reference ? `Call reference: ${reference}.` : '',
    units ? `Assigned units: ${units}.` : 'No units assigned.',
    hazards ? `Known hazards: ${hazards}.` : '',
    callerName ? `Caller: ${callerName}.` : '',
    callerPhone ? `Caller phone: ${callerPhone}.` : '',
    description && !detailsDuplicate ? `Details: ${description}.` : '',
  ].filter(Boolean);
  return announceVoice(parts.join(' '), { dedupeMs: 10000, rate: 0.82, pitch: 0.66, force: true });
}

export function announceDistressSignal({ unit, name }) {
  announceVoice(`Emergency traffic. Officer distress signal. Signal 13. ${unit ? `Unit ${unit}.` : 'Unit unknown.'} ${name ? `Officer ${name}.` : ''} All available units respond.`, { dedupeMs: 15000, rate: 0.76, pitch: 0.62, force: true });
}

export function announceDistressSignalAsync({ unit, name }) {
  return announceVoiceAsync(`Emergency traffic. Officer distress signal. Signal 13. ${unit ? `Unit ${unit}.` : 'Unit unknown.'} ${name ? `Officer ${name}.` : ''} All available units respond.`, { dedupeMs: 15000, rate: 0.76, pitch: 0.62 });
}

export function announceRecordSearch(results = []) {
  if (!results.length) {
    announceVoice('CAD records response. No matching records located.', { dedupeMs: 3000, rate: 0.82, pitch: 0.68 });
    return;
  }
  const linked = results.find(item => item.linked_call_number || item.call_number || item.call_type || item.incident_type || item.call_incident || item.linked_call_type);
  if (linked) {
    const callType = linked.linked_call_type || linked.call_type || linked.incident_type || linked.call_incident || 'related call';
    const callNumber = linked.linked_call_number || linked.call_number || '';
    const location = linked.linked_call_location || linked.location || '';
    announceVoice(`CAD records response. ${results.length} matches located. Related call, ${callType}${callNumber ? `. Call number ${callNumber}` : ''}${location ? `. Location ${location}` : ''}.`, { dedupeMs: 5000, rate: 0.82, pitch: 0.68 });
  } else {
    announceVoice(`CAD records response. ${results.length} matching records located.`, { dedupeMs: 5000, rate: 0.82, pitch: 0.68 });
  }
}