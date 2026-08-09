// In-app operational voice announcements using the browser's speech engine.
// This intentionally uses a distinct, deep tactical cadence rather than cloning
// any named actor or character voice.

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

export function announceVoice(text, options = {}) {
  if (!text || !isVoiceSupported() || !isVoiceEnabled()) return false;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  const now = Date.now();
  const dedupeMs = options.dedupeMs ?? 1800;
  if (clean === lastText && now - lastAt < dedupeMs) return false;
  lastText = clean;
  lastAt = now;

  try {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = options.lang || 'en-US';
    // Deep, deliberate tactical cadence. This is a generic synthesized voice,
    // not a clone of a named actor or character.
    utterance.rate = options.rate ?? 0.88;
    utterance.pitch = options.pitch ?? 0.72;
    utterance.volume = options.volume ?? 1;
    const voice = getPreferredVoice();
    if (voice) utterance.voice = voice;
    if (options.interrupt !== false) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
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

export function announcePropertyCall({ propertyName, incident, location, reference }) {
  const parts = [
    'Monitored property call.',
    propertyName ? `${propertyName}.` : '',
    incident ? `${incident}.` : '',
    location ? `${location}.` : '',
    reference ? `Call reference ${reference}.` : '',
  ].filter(Boolean);
  announceVoice(parts.join(' '), { dedupeMs: 10000, rate: 0.82, pitch: 0.68 });
}

export function announceDistressSignal({ unit, name }) {
  announceVoice(`Distress signal 13. ${unit ? `Unit ${unit}.` : ''} ${name ? `${name}.` : ''}`, { dedupeMs: 15000, rate: 0.78, pitch: 0.65 });
}

export function announceRecordSearch(results = []) {
  if (!results.length) {
    announceVoice('Records search complete. No matching records found.', { dedupeMs: 3000 });
    return;
  }
  const linked = results.find(item => item.linked_call_number || item.call_number || item.call_type || item.incident_type || item.call_incident);
  if (linked) {
    const callType = linked.call_type || linked.incident_type || linked.call_incident || linked.linked_call_type || 'related call';
    const callNumber = linked.linked_call_number || linked.call_number || '';
    announceVoice(`Records search complete. ${results.length} matching records. Related call type: ${callType}${callNumber ? `. Call ${callNumber}` : ''}.`, { dedupeMs: 5000, rate: 0.86, pitch: 0.7 });
  } else {
    announceVoice(`Records search complete. ${results.length} matching records returned.`, { dedupeMs: 5000, rate: 0.86, pitch: 0.7 });
  }
}
