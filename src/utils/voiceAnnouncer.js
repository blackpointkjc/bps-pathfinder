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

export function announceVoice(text, options = {}) {
  if (!text || !isVoiceSupported() || !isVoiceEnabled()) return false;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean || !acceptText(clean, options.dedupeMs ?? 1800)) return false;
  try {
    const utterance = buildUtterance(clean, options);
    if (options.interrupt !== false) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
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
  announceVoice(`${instruction}${distanceText ? `, ${distanceText}` : ''}.`, { dedupeMs: 3000, rate: 0.84, pitch: 0.68 });
}

export function announcePropertyCall({ propertyName, incident, location, reference, createdAt }) {
  let timeText = '';
  if (createdAt) {
    const parsed = parseServerTimestamp(createdAt);
    if (parsed) timeText = formatEasternTime(parsed);
  }
  const parts = [
    'Monitored property call.',
    propertyName ? `${propertyName}.` : '',
    incident ? `Call type: ${incident}.` : '',
    timeText ? `Call received at ${timeText} Eastern Time.` : '',
    location ? `Location: ${location}.` : '',
    reference ? `Call reference ${reference}.` : '',
  ].filter(Boolean);
  announceVoice(parts.join(' '), { dedupeMs: 10000, rate: 0.82, pitch: 0.68 });
}

export function announceDistressSignal({ unit, name }) {
  announceVoice(`Distress signal 13. ${unit ? `Unit ${unit}.` : ''} ${name ? `${name}.` : ''}`, { dedupeMs: 15000, rate: 0.78, pitch: 0.65 });
}

export function announceDistressSignalAsync({ unit, name }) {
  return announceVoiceAsync(`Distress signal 13. ${unit ? `Unit ${unit}.` : ''} ${name ? `${name}.` : ''}`, { dedupeMs: 15000, rate: 0.78, pitch: 0.65 });
}

export function announceRecordSearch(results = []) {
  if (!results.length) {
    announceVoice('Records search complete. No matching records found.', { dedupeMs: 3000 });
    return;
  }
  const linked = results.find(item => item.linked_call_number || item.call_number || item.call_type || item.incident_type || item.call_incident || item.linked_call_type);
  if (linked) {
    const callType = linked.linked_call_type || linked.call_type || linked.incident_type || linked.call_incident || 'related call';
    const callNumber = linked.linked_call_number || linked.call_number || '';
    const location = linked.linked_call_location || linked.location || '';
    announceVoice(`Records search complete. ${results.length} matching records. Related call type: ${callType}${callNumber ? `. Call ${callNumber}` : ''}${location ? `. Location ${location}` : ''}.`, { dedupeMs: 5000, rate: 0.86, pitch: 0.7 });
  } else {
    announceVoice(`Records search complete. ${results.length} matching records returned.`, { dedupeMs: 5000, rate: 0.86, pitch: 0.7 });
  }
}