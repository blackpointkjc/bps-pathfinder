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

// ---------------------------------------------------------------------------
// Lightweight duplicate-read protection
// ---------------------------------------------------------------------------
// Important: never globally pause Pathfinder reads after a 429. A previous
// implementation used one app-wide 60-second queue backoff; one rate-limited
// request could then block authentication, CAD calls, maps, and every other entity
// read. We only coalesce identical reads that happen at the same time and keep a
// very short successful-read cache. Page-level polling/subscription controls are
// responsible for request cadence.
const READ_CACHE_TTL_MS = 1_500;
const AUTH_CACHE_TTL_MS = 5_000;

const readCache = new Map();
const readInflight = new Map();
const entityProxyCache = new Map();
let authCache = null;
let authInflight = null;
let activeReads = 0;
let recentRateLimitAt = 0;

const isRateLimitError = error => /rate limit|too many requests|\b429\b/i.test(String(
  error?.message || error?.response?.data?.message || error?.data?.message || error || ''
));

function noteRateLimit(error) {
  if (!isRateLimitError(error)) return;
  recentRateLimitAt = Date.now();
  try {
    window.dispatchEvent(new CustomEvent('bps:api-rate-limited', {
      detail: { at: recentRateLimitAt },
    }));
  } catch {}
}

function safeKey(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function sharedRead(key, executor, ttlMs = READ_CACHE_TTL_MS) {
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.value);
  if (readInflight.has(key)) return readInflight.get(key);

  activeReads += 1;
  const request = Promise.resolve()
    .then(executor)
    .then(value => {
      readCache.set(key, { at: Date.now(), value });
      return value;
    })
    .catch(error => {
      noteRateLimit(error);
      throw error;
    })
    .finally(() => {
      activeReads = Math.max(0, activeReads - 1);
      readInflight.delete(key);
    });
  readInflight.set(key, request);
  return request;
}

export function clearBase44ReadCache() {
  readCache.clear();
  authCache = null;
}

export function getBase44RequestHealth() {
  return {
    queuedReads: 0,
    activeReads,
    rateLimitedUntil: null,
    recentRateLimitAt: recentRateLimitAt || null,
  };
}

const READ_METHODS = new Set(['list', 'filter', 'get']);
const WRITE_METHODS = new Set(['create', 'update', 'delete', 'bulkCreate', 'bulkUpdate', 'bulkDelete', 'importEntities']);

function wrappedEntity(entityName, entity) {
  if (!entity || (typeof entity !== 'object' && typeof entity !== 'function')) return entity;
  if (entityProxyCache.has(entityName)) return entityProxyCache.get(entityName);

  const proxy = new Proxy(entity, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const method = String(prop);

      if (READ_METHODS.has(method)) {
        return (...args) => sharedRead(
          `entity:${entityName}:${method}:${safeKey(args)}`,
          () => value.apply(target, args),
        );
      }

      if (WRITE_METHODS.has(method)) {
        return async (...args) => {
          const result = await value.apply(target, args);
          // Keep the cache simple and correct. Writes are much less frequent than
          // reads, so clearing the tiny five-second cache is inexpensive.
          clearBase44ReadCache();
          return result;
        };
      }

      return value.bind(target);
    },
  });
  entityProxyCache.set(entityName, proxy);
  return proxy;
}

const entitiesProxy = new Proxy(rawBase44.entities, {
  get(target, prop, receiver) {
    const entity = Reflect.get(target, prop, receiver);
    if (typeof prop === 'symbol') return entity;
    return wrappedEntity(String(prop), entity);
  },
});

const authProxy = new Proxy(rawBase44.auth, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop === 'me' && typeof value === 'function') {
      return () => {
        if (authCache && Date.now() - authCache.at < AUTH_CACHE_TTL_MS) return Promise.resolve(authCache.value);
        if (authInflight) return authInflight;
        authInflight = sharedRead('auth:me', () => value.call(target), AUTH_CACHE_TTL_MS)
          .then(user => {
            authCache = { at: Date.now(), value: user };
            return user;
          })
          .finally(() => { authInflight = null; });
        return authInflight;
      };
    }
    if (typeof value === 'function') {
      const method = String(prop);
      if (['logout', 'loginViaEmailPassword', 'loginWithProvider', 'register', 'redirectToLogin'].includes(method)) {
        return async (...args) => {
          clearBase44ReadCache();
          authInflight = null;
          try {
            return await value.apply(target, args);
          } finally {
            clearBase44ReadCache();
            authInflight = null;
          }
        };
      }
      return value.bind(target);
    }
    return value;
  },
});

const functionsProxy = new Proxy(rawBase44.functions, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop === 'invoke' && typeof value === 'function') {
      return async (...args) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          noteRateLimit(error);
          throw error;
        }
      };
    }
    if (typeof value === 'function') return value.bind(target);
    return value;
  },
});

export const base44 = new Proxy(rawBase44, {
  get(target, prop, receiver) {
    if (prop === 'entities') return entitiesProxy;
    if (prop === 'auth') return authProxy;
    if (prop === 'functions') return functionsProxy;
    return Reflect.get(target, prop, receiver);
  },
});

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
