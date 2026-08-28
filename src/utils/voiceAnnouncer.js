// In-app operational voice announcements using the browser's speech engine.
// The default profile is an original polished American AI-assistant cadence.
// It is calm, authoritative, and synthetic without cloning any named voice.

import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';

let lastText = '';
let lastAt = 0;
let lockedVoice = null;
let runtimeConfig = { volume: 1, voiceProfile: 'american_ai' };

export function setVoiceRuntimeConfig(config = {}) {
  runtimeConfig = {
    volume: Number.isFinite(Number(config.volume)) ? Math.min(1, Math.max(0, Number(config.volume))) : runtimeConfig.volume,
    voiceProfile: config.voiceProfile || runtimeConfig.voiceProfile,
  };
  lockedVoice = null;
}

function getPreferredVoice(profile = runtimeConfig.voiceProfile) {
  if (profile === 'system_default') return null;
  if (lockedVoice) return lockedVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const americanAiNames = /Microsoft (Guy|Christopher|Andrew|Brian|Davis|Eric)|Google US English|Alex|Samantha/i;
  lockedVoice = voices.find(v => /en-US/i.test(v.lang) && americanAiNames.test(v.name))
    || voices.find(v => /en-US/i.test(v.lang) && v.localService)
    || voices.find(v => /en-US/i.test(v.lang))
    || voices.find(v => /^en/i.test(v.lang) && americanAiNames.test(v.name))
    || voices.find(v => /^en/i.test(v.lang))
    || voices[0]
    || null;
  return lockedVoice;
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
  if (!enabled) {
    clearAutomaticRetry(true);
    pendingSpeech = null;
    lastBlockedSpeech = null;
    activeSpeech = null;
    speechQueue.length = 0;
  }
}

export function stopVoice() {
  if (!isVoiceSupported()) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

function buildUtterance(clean, options = {}) {
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = options.lang || 'en-US';
  // One consistent, natural radio voice across Pathfinder. Avoid the unnaturally
  // low pitch/rate combination that made announcements sound synthetic.
  utterance.rate = options.rate ?? 0.93;
  utterance.pitch = options.pitch ?? 0.86;
  utterance.volume = options.volume ?? runtimeConfig.volume;
  const voice = getPreferredVoice(options.voiceProfile);
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
let lastBlockedSpeech = null;
let activeSpeech = null;
let speechSequence = 0;
let unlockListenersInstalled = false;
let automaticRetryTimer = null;
let automaticRetryAttempt = 0;
let automaticRetrySequence = null;
const speechQueue = [];
const PRIORITY = { emergency: 100, critical: 80, high: 60, normal: 40, low: 20 };

function processedEventKey(eventId) {
  return eventId ? `bps-voice-event:${String(eventId)}` : '';
}

function wasEventProcessed(eventId) {
  const key = processedEventKey(eventId);
  if (!key) return false;
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function markEventProcessed(eventId) {
  const key = processedEventKey(eventId);
  if (!key) return;
  try { localStorage.setItem(key, '1'); } catch {}
}

// Reserve an event synchronously before it enters the speech queue. localStorage
// writes are visible to every same-origin tab, closing the check-then-create race
// where two realtime subscriptions received the same event in the same instant.
// A blocked item stays retryable in the tab that owns the queued utterance, while
// refreshes and sibling tabs cannot enqueue it again.
function claimEventForThisBrowser(eventId) {
  if (!eventId) return true;
  const key = `bps-voice-claim:${String(eventId)}`;
  try {
    if (localStorage.getItem(key)) return false;
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, token);
    return localStorage.getItem(key) === token;
  } catch {
    return true;
  }
}

// Safe diagnostic: verifies the refresh/realtime claim gate without speaking,
// creating a CAD event, or leaving test state behind.
export function runVoiceDedupeSelfTest() {
  if (typeof window === 'undefined') return { passed: false, reason: 'Browser context unavailable' };
  const eventId = `phase1-self-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const claimKey = `bps-voice-claim:${eventId}`;
  try {
    const firstClaim = claimEventForThisBrowser(eventId);
    const secondClaim = claimEventForThisBrowser(eventId);
    localStorage.removeItem(claimKey);
    return { passed: firstClaim === true && secondClaim === false };
  } catch (error) {
    try { localStorage.removeItem(claimKey); } catch {}
    return { passed: false, reason: error?.message || 'Voice dedupe test failed' };
  }
}

function clearAutomaticRetry(resetAttempts = true) {
  if (automaticRetryTimer) window.clearTimeout(automaticRetryTimer);
  automaticRetryTimer = null;
  if (resetAttempts) {
    automaticRetryAttempt = 0;
    automaticRetrySequence = null;
  }
}

function scheduleAutomaticRetry(item) {
  if (!item || typeof window === 'undefined' || !isVoiceEnabled()) return;
  if (automaticRetrySequence !== item.sequence) {
    clearAutomaticRetry(true);
    automaticRetrySequence = item.sequence;
  }
  if (automaticRetryTimer || automaticRetryAttempt >= 6) return;
  const delays = [1500, 3000, 6000, 12000, 20000, 30000];
  const delay = delays[automaticRetryAttempt] || 30000;
  automaticRetryAttempt += 1;
  automaticRetryTimer = window.setTimeout(() => {
    automaticRetryTimer = null;
    retryPendingSpeech();
  }, delay);
}

function nextQueuedSpeech() {
  if (activeSpeech || !speechQueue.length || !isVoiceSupported()) return;
  speechQueue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  const item = speechQueue.shift();
  activeSpeech = item;
  pendingSpeech = item;
  let started = false;
  try {
    const utterance = buildUtterance(item.clean, item.options);
    utterance.onstart = () => {
      started = true;
      clearAutomaticRetry(true);
      pendingSpeech = null;
      if (lastBlockedSpeech?.sequence === item.sequence) lastBlockedSpeech = null;
      window.dispatchEvent(new CustomEvent('bps-voice-started', { detail: { text: item.clean, eventId: item.options.eventId || null } }));
    };
    const finish = success => {
      if (success) {
        markEventProcessed(item.options.eventId);
        if (lastBlockedSpeech?.sequence === item.sequence) lastBlockedSpeech = null;
      }
      if (activeSpeech?.sequence === item.sequence) activeSpeech = null;
      if (!success) {
        pendingSpeech = item;
        lastBlockedSpeech = item;
        scheduleAutomaticRetry(item);
      }
      item.resolve?.(success);
      nextQueuedSpeech();
    };
    utterance.onend = () => finish(true);
    utterance.onerror = event => {
      lastBlockedSpeech = item;
      window.dispatchEvent(new CustomEvent('bps-voice-blocked', { detail: { text: item.clean, reason: event?.error || 'playback_failed' } }));
      finish(false);
    };
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      if (activeSpeech?.sequence === item.sequence && !started && !window.speechSynthesis.speaking) {
        pendingSpeech = item;
        lastBlockedSpeech = item;
        activeSpeech = null;
        window.dispatchEvent(new CustomEvent('bps-voice-blocked', { detail: { text: item.clean, reason: 'browser_blocked' } }));
        scheduleAutomaticRetry(item);
      }
    }, 1200);
  } catch (error) {
    pendingSpeech = item;
    lastBlockedSpeech = item;
    activeSpeech = null;
    item.resolve?.(false);
    window.dispatchEvent(new CustomEvent('bps-voice-blocked', { detail: { text: item.clean, reason: error?.message || 'playback_failed' } }));
    scheduleAutomaticRetry(item);
  }
}

function speakQueued(clean, options = {}, resolve = null) {
  if (!isVoiceSupported() || wasEventProcessed(options.eventId)) return false;
  if (!claimEventForThisBrowser(options.eventId)) return false;
  const priority = PRIORITY[options.priority] ?? PRIORITY.normal;
  const duplicate = speechQueue.some(item => options.eventId && item.options.eventId === options.eventId);
  if (duplicate || (activeSpeech && options.eventId && activeSpeech.options.eventId === options.eventId)) return false;

  const item = { clean, options, priority, sequence: ++speechSequence, resolve };
  speechQueue.push(item);

  // Emergency traffic may preempt lower-priority speech. Routine/high traffic
  // never interrupts an emergency; it waits in the shared queue.
  if (priority >= PRIORITY.emergency && activeSpeech && activeSpeech.priority < PRIORITY.emergency) {
    try { window.speechSynthesis.cancel(); } catch {}
    activeSpeech = null;
  }
  nextQueuedSpeech();
  return true;
}

function retryPendingSpeech() {
  const blocked = pendingSpeech || lastBlockedSpeech;
  if (!blocked || !isVoiceSupported() || !isVoiceEnabled()) return false;
  const retryItem = { ...blocked, resolve: null };
  pendingSpeech = null;
  lastBlockedSpeech = null;
  speechQueue.splice(0, speechQueue.length, ...speechQueue.filter(item => item.sequence !== blocked.sequence));
  if (activeSpeech?.sequence === blocked.sequence) activeSpeech = null;
  try { window.speechSynthesis.cancel(); } catch {}
  speechQueue.unshift(retryItem);
  window.speechSynthesis.resume?.();
  nextQueuedSpeech();
  return true;
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
  setVoiceEnabled(true);
  return retryPendingSpeech();
}

export function announceVoice(text, options = {}) {
  if (!text || !isVoiceSupported() || (!options.force && !isVoiceEnabled())) return false;
  // Keep every caller on the same voice/cadence. Call-site rate/pitch overrides
  // were the reason users heard two noticeably different announcement voices.
  options = { ...options, rate: 0.93, pitch: 0.86, lang: 'en-US' };
  const clean = String(text)
    .replace(/\bCAD\b/gi, 'C A D')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || wasEventProcessed(options.eventId) || !acceptText(clean, options.dedupeMs ?? 1800)) return false;
  installVoiceUnlockListeners();
  return speakQueued(clean, options);
}

// Promise form used by emergency notifications so a secondary alert tone can
// be deliberately delayed until the spoken safety announcement has finished.
export function announceVoiceAsync(text, options = {}) {
  if (!text || !isVoiceSupported() || !isVoiceEnabled()) return Promise.resolve(false);
  options = { ...options, rate: 0.93, pitch: 0.86, lang: 'en-US' };
  const clean = String(text)
    .replace(/\bCAD\b/gi, 'C A D')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || wasEventProcessed(options.eventId) || !acceptText(clean, options.dedupeMs ?? 1800)) return Promise.resolve(false);
  installVoiceUnlockListeners();
  return new Promise(resolve => {
    if (!speakQueued(clean, options, resolve)) resolve(false);
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
  announceVoice(`Emergency traffic. Officer distress signal. Signal 13. ${unit ? `Unit ${unit}.` : 'Unit unknown.'} ${name ? `Officer ${name}.` : ''} All available units respond.`, { dedupeMs: 15000, rate: 0.76, pitch: 0.62, force: true, priority: 'emergency' });
}

export function announceDistressSignalAsync({ unit, name, eventId }) {
  return announceVoiceAsync(`Emergency traffic. Officer distress signal. Signal 13. ${unit ? `Unit ${unit}.` : 'Unit unknown.'} ${name ? `Officer ${name}.` : ''} All available units respond.`, { dedupeMs: 15000, rate: 0.76, pitch: 0.62, priority: 'emergency', eventId: eventId ? `distress:${eventId}` : undefined });
}

export function announceRecordSearch(results = [], metadata = {}) {
  const isPersonSearch = metadata.searchType === 'person';
  const warrantText = isPersonSearch
    ? (metadata.warrantMatches > 0
      ? `${metadata.warrantMatches} warrant record${metadata.warrantMatches === 1 ? '' : 's'} located in Pathfinder.`
      : 'No warrant records located in Pathfinder.')
    : '';

  if (!results.length) {
    announceVoice(`CAD records response. No matching records located.${warrantText ? ` ${warrantText}` : ''}`, { dedupeMs: 3000, rate: 0.82, pitch: 0.68, force: true });
    return;
  }
  const linked = results.find(item => item.linked_call_number || item.call_number || item.call_type || item.incident_type || item.call_incident || item.linked_call_type);
  if (linked) {
    const callType = linked.linked_call_type || linked.call_type || linked.incident_type || linked.call_incident || 'related call';
    const callNumber = linked.linked_call_number || linked.call_number || '';
    const location = linked.linked_call_location || linked.location || '';
    announceVoice(`CAD records response. ${results.length} matches located. Related call, ${callType}${callNumber ? `. Call number ${callNumber}` : ''}${location ? `. Location ${location}` : ''}.${warrantText ? ` ${warrantText}` : ''}`, { dedupeMs: 5000, rate: 0.82, pitch: 0.68, force: true });
  } else {
    announceVoice(`CAD records response. ${results.length} matching records located.${warrantText ? ` ${warrantText}` : ''}`, { dedupeMs: 5000, rate: 0.82, pitch: 0.68, force: true });
  }
}