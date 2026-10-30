import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isClockedInAtProperty, getActiveTimeEntry } from '../src/lib/clockedPropertyAlarm.js';

const now = Date.now();
const property = { id: 'site-a', site_name: 'Oak Court', address: '10 Main St', active: true, property_monitoring_enabled: true };
const punch = { clock_in: new Date(now - 60000).toISOString(), location: 'Oak Court - 10 Main St' };
assert.equal(isClockedInAtProperty([punch], property, now), true);
for (const row of [
  { ...punch, clock_out: new Date(now).toISOString() },
  { ...punch, archived: true },
  { ...punch, location: 'Other Post - 10 Main St' },
  { ...punch, location: 'Oak Court - 99 Main St' },
  { ...punch, clock_in: new Date(now + 60000).toISOString() },
  { ...punch, location_id: 'site-b' },
]) assert.equal(isClockedInAtProperty([row], property, now), false);
assert.equal(isClockedInAtProperty([], property, now), false);
assert.equal(isClockedInAtProperty([{ ...punch, location_id: 'site-a' }], property, now), true);
assert.equal(isClockedInAtProperty([punch, { ...punch, clock_in: new Date(now - 1000).toISOString(), location: 'Other Post' }], property, now), false);

// Exercise the actual app prelude with read-only fake SDK responses.
const banner = await readFile('src/components/GlobalMessageBanner.jsx', 'utf8');
const preludeSource = banner.slice(banner.indexOf('    const propertyHornPrelude ='), banner.indexOf('    const showPropertyCall ='));
let entries = [punch], horns = 0, lookups = 0;
const fakeClient = {
  entities: {
    PropertyAlert: { filter: async () => [{ callId: 'call-a', propertyId: 'site-a' }] },
    Location: { get: async id => { assert.equal(id, 'site-a'); return property; } },
  },
  functions: { invoke: async (name, body) => {
    assert.equal(name, 'getMyTimeEntries');
    assert.deepEqual(body, { active_only: true });
    lookups++;
    return { data: { entries } };
  } },
};
const makePrelude = new Function('active', 'base44', 'isClockedInAtProperty', 'playPropertyHorn', 'normalized', 'getActiveTimeEntry',
  preludeSource + '; return propertyHornPrelude;');
const prelude = makePrelude(true, fakeClient, isClockedInAtProperty, async () => { horns++; }, value => String(value || '').trim().toLowerCase(), getActiveTimeEntry);
await prelude({ propertyId: 'site-a' })(() => true);
await prelude({ callId: 'call-a' })(() => true);
assert.equal(horns, 2); // Both raw PropertyAlert and durable CallStatusLog resolve the same post.
entries = [{ ...punch, clock_out: new Date().toISOString() }];
assert.equal(await prelude({ propertyId: 'site-a' })(() => true), false);
assert.equal(horns, 2);
assert.equal(await prelude({ propertyId: 'site-a' })(() => false), false);
assert.equal(lookups, 3);

// On-duty at another post still hears the property call, with no horn.
entries = [{ ...punch, location: 'Another Post - 99 Main St' }];
assert.equal(await prelude({ propertyId: 'site-a' })(() => true), true);
assert.equal(horns, 2);
entries = [];
assert.equal(await prelude({ propertyId: 'site-a' })(() => true), false);

// Actual voice queue: dedupe occurs before the prelude and speech awaits it.
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
const events = [];
let failNext = false;
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.window = {
  SpeechSynthesisUtterance,
  addEventListener() {}, dispatchEvent() {},
  setTimeout: (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
  clearTimeout,
  speechSynthesis: {
    getVoices: () => [{ name: 'Microsoft Aria', lang: 'en-US' }],
    resume() {}, cancel() {},
    speak(utterance) {
      events.push('speech:' + utterance.text);
      queueMicrotask(() => {
        if (failNext) { failNext = false; utterance.onerror({ error: 'not-allowed' }); }
        else { utterance.onstart(); utterance.onend(); }
      });
    },
  },
};
const voiceSource = (await readFile('src/utils/voiceAnnouncer.js', 'utf8'))
  .replace("import { formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';", 'const formatEasternTime = () => ""; const parseServerTimestamp = value => new Date(value);');
const voice = await import('data:text/javascript;base64,' + Buffer.from(voiceSource).toString('base64'));
const flush = () => new Promise(resolve => setImmediate(resolve));
let finishHorn;
let hornCount = 0;
const beforeSpeech = async () => { hornCount++; events.push('horn'); await new Promise(resolve => { finishHorn = resolve; }); events.push('horn-end'); };
assert.equal(voice.announceVoice('Property call.', { eventId: 'call:a:initial', beforeSpeech }), true);
await flush();
assert.deepEqual(events, ['horn']);
assert.equal(voice.announceVoice('Duplicate delivery.', { eventId: 'call:a:initial', beforeSpeech }), false);
finishHorn();
await flush();
assert.deepEqual(events, ['horn', 'horn-end', 'speech:Property call.']);
assert.equal(hornCount, 1);
failNext = true;
voice.announceVoice('Retry call.', { eventId: 'call:b:initial', beforeSpeech: async (_isCurrent, hornCompleted) => { if (!hornCompleted) hornCount++; } });
await flush();
voice.retryVoiceAnnouncement();
await flush();
assert.equal(hornCount, 2); // Speech retry does not replay horn.
assert.equal(events.filter(item => item === 'speech:Retry call.').length, 2);

// Clock-out between a blocked attempt and retry must suppress retry speech too.
entries = [punch];
failNext = true;
voice.announceVoice('Clock out during retry.', { eventId: 'call:clockout:initial', beforeSpeech: prelude({ propertyId: 'site-a' }) });
await flush();
entries = [{ ...punch, clock_out: new Date().toISOString() }];
voice.retryVoiceAnnouncement();
await flush();
assert.equal(events.filter(item => item === 'speech:Clock out during retry.').length, 1);

// A hard duty mismatch suppresses speech too, and does not stall later speech.
voice.announceVoice('Wrong property call.', { eventId: 'call:wrong:initial', beforeSpeech: async () => false });
voice.announceVoice('Next valid message.', { eventId: 'next:valid' });
await flush();
assert.equal(events.includes('speech:Wrong property call.'), false);
assert.equal(events.includes('speech:Next valid message.'), true);

// Cancelling during the horn prevents the following announcement.
voice.announceVoice('Cancelled call.', { eventId: 'call:c:initial', beforeSpeech });
await flush();
voice.stopVoice();
finishHorn();
await flush();
assert.equal(events.includes('speech:Cancelled call.'), false);

// Actual horn oscillator scheduling, completion, and cancellation.
const { playPropertyHorn } = await import('../src/utils/alertUtils.js');
let stopped = 0, disconnected = 0;
class FakeContext {
  state = 'running'; currentTime = 0; destination = {};
  createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() { stopped++; }, disconnect() { disconnected++; } }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() { disconnected++; } }; }
}
window.AudioContext = FakeContext;
window.setInterval = setInterval;
window.clearInterval = clearInterval;
await playPropertyHorn();
assert.equal(disconnected, 4);
let current = true;
const cancelledHorn = playPropertyHorn(() => current);
setTimeout(() => { current = false; }, 40);
await cancelledHorn;
assert.equal(disconnected, 8);
assert.equal(stopped, 8);
console.log('PASS: duty/property matching, raw and durable event paths, horn-before-speech, duplicate suppression, speech retry, cancellation, oscillator completion.');
