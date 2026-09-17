import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

const rawBase44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false,
});

// Base44 enforces one request allowance across the application. Pathfinder has
// many always-mounted realtime features, so an unbounded startup/refetch burst can
// consume that allowance just as an officer saves a report or changes status.
// User writes always bypass this queue; only reads are capped and deduplicated.
const MAX_CONCURRENT_READS = 3;
const READ_CACHE_MS = 3_000;
const RATE_LIMIT_COOLDOWN_MS = 20_000;
const RATE_LIMIT_KEY = 'bps:base44-rate-limit-until';
const READ_METHODS = new Set(['list', 'filter', 'get']);
const WRITE_METHODS = new Set(['create', 'update', 'delete', 'bulkCreate', 'importEntities']);
const entityWrappers = new Map();
const readCache = new Map();
const readInflight = new Map();
const writeInflight = new Map();
const readQueue = [];
let activeReads = 0;
let activeWrites = 0;
let recentRateLimitAt = null;
let wakeTimer = null;

const errorText = error => String(error?.response?.data?.error || error?.response?.data?.message || error?.message || error || '');
const isRateLimit = error => /rate limit|too many requests|\b429\b/i.test(errorText(error));
const stableKey = value => {
  try { return JSON.stringify(value, (_key, item) => item instanceof File ? { name: item.name, size: item.size, type: item.type } : item); }
  catch { return String(value); }
};
const sharedRateLimitUntil = () => {
  try { return Number(localStorage.getItem(RATE_LIMIT_KEY) || 0) || 0; } catch { return 0; }
};
const noteRateLimit = error => {
  if (!isRateLimit(error)) return;
  recentRateLimitAt = Date.now();
  const until = recentRateLimitAt + RATE_LIMIT_COOLDOWN_MS;
  try { localStorage.setItem(RATE_LIMIT_KEY, String(until)); } catch {}
};
const schedulePump = delay => {
  window.clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(pumpReads, Math.max(25, delay));
};
function pumpReads() {
  if (activeWrites > 0 || activeReads >= MAX_CONCURRENT_READS || !readQueue.length) return;
  const cooldown = sharedRateLimitUntil() - Date.now();
  if (cooldown > 0) {
    schedulePump(cooldown + 25);
    return;
  }
  while (activeWrites === 0 && activeReads < MAX_CONCURRENT_READS && readQueue.length) {
    const job = readQueue.shift();
    activeReads += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, error => {
        noteRateLimit(error);
        job.reject(error);
      })
      .finally(() => {
        activeReads -= 1;
        pumpReads();
      });
  }
}
function queuedRead(key, task) {
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) return Promise.resolve(cached.value);
  if (readInflight.has(key)) return readInflight.get(key);
  const request = new Promise((resolve, reject) => {
    readQueue.push({
      task: async () => {
        const value = await task();
        readCache.set(key, { at: Date.now(), value });
        return value;
      },
      resolve,
      reject,
    });
    pumpReads();
  }).finally(() => readInflight.delete(key));
  readInflight.set(key, request);
  return request;
}
function protectedWrite(key, task) {
  if (writeInflight.has(key)) return writeInflight.get(key);
  activeWrites += 1;
  readCache.clear();
  const request = Promise.resolve()
    .then(task)
    .catch(error => {
      noteRateLimit(error);
      throw error;
    })
    .finally(() => {
      activeWrites -= 1;
      writeInflight.delete(key);
      pumpReads();
    });
  writeInflight.set(key, request);
  return request;
}
function wrappedEntity(name) {
  if (entityWrappers.has(name)) return entityWrappers.get(name);
  const entity = rawBase44.entities[name];
  const wrapper = new Proxy(entity, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (READ_METHODS.has(property)) {
        return (...args) => queuedRead(`entity:${name}:${String(property)}:${stableKey(args)}`, () => value.apply(target, args));
      }
      if (WRITE_METHODS.has(property)) {
        return (...args) => protectedWrite(`entity:${name}:${String(property)}:${stableKey(args)}`, () => value.apply(target, args));
      }
      return value.bind(target);
    },
  });
  entityWrappers.set(name, wrapper);
  return wrapper;
}
const entities = new Proxy(rawBase44.entities, {
  get(_target, name) {
    if (typeof name !== 'string') return rawBase44.entities[name];
    return wrappedEntity(name);
  },
});
const functions = new Proxy(rawBase44.functions, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (property !== 'invoke' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
    return (name, payload) => {
      const key = `function:${String(name)}:${stableKey(payload || {})}`;
      return protectedWrite(key, () => value.call(target, name, payload));
    };
  },
});
export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'entities') return entities;
    if (property === 'functions') return functions;
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function clearBase44ReadCache() {
  readCache.clear();
}

export function getBase44RequestHealth() {
  const until = sharedRateLimitUntil();
  return {
    queuedReads: readQueue.length,
    activeReads,
    activeWrites,
    rateLimitedUntil: until > Date.now() ? new Date(until).toISOString() : null,
    recentRateLimitAt: recentRateLimitAt ? new Date(recentRateLimitAt).toISOString() : null,
  };
}

// Browser-side AI is routed through the app's own backend function so legacy call
// sites cannot accidentally create a second external integration path.
if (base44.integrations?.Core?.InvokeLLM) {
  base44.integrations.Core.InvokeLLM = async payload => {
    const response = await base44.functions.invoke('internalAssistant', payload || {});
    const data = response?.data || response || {};
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

// Browser-side email is sent through the signed-in user's connected Microsoft
// Outlook mailbox. This preserves existing SendEmail call sites without consuming
// a separate Base44 email integration path.
if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = async payload => {
    const actor = await base44.auth.me();
    if (!actor?.id) throw new Error('A signed-in Pathfinder user is required to send Outlook email.');
    const { sendOutlookMail } = await import('@/lib/outlookGraph');
    const rawTo = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawCc = Array.isArray(payload?.cc) ? payload.cc : String(payload?.cc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawBcc = Array.isArray(payload?.bcc) ? payload.bcc : String(payload?.bcc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!rawTo.length) throw new Error('An email recipient is required.');
    const allRaw = [...rawTo, ...rawCc, ...rawBcc];
    const resolvedResponse = await base44.functions.invoke('resolveNotificationEmails', { emails: allRaw }).catch(() => null);
    const resolved = resolvedResponse?.data?.emails || resolvedResponse?.emails || allRaw;
    let cursor = 0;
    const to = resolved.slice(cursor, cursor += rawTo.length);
    const cc = resolved.slice(cursor, cursor += rawCc.length);
    const bcc = resolved.slice(cursor, cursor += rawBcc.length);
    await sendOutlookMail(actor.id, {
      to,
      cc,
      bcc,
      subject: String(payload?.subject || 'Black Point Notification'),
      body: String(payload?.body || payload?.html || ''),
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      mailboxEmail: String(payload?.mailboxEmail || payload?.from_mailbox || '').trim(),
    });
    return { success: true, delivered: 'microsoft_outlook', to, resolved_work_addresses: true };
  };
}
