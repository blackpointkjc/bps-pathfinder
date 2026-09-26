import { base44 } from '@/api/base44Client';
import { withRequestTimeout } from '@/lib/requestTimeout';

const STALE_AFTER_MS = 30 * 1000;
const RECOVERY_COOLDOWN_MS = 20 * 1000;
const RECOVERY_STAMP_KEY = 'bps:cad-ingestion-recovery-at:v2';
const LIVE_SYNC_STAMP_KEY = 'bps:cad-live-sync-at:v2';
const LAST_SUCCESSFUL_SOURCE_POLL_KEY = 'bps:cad-last-successful-source-poll-at:v1';
const BUSY_LEASE_RETRY_MS = 18_000;
const LIVE_SYNC_BACKOFF_KEY = 'bps:cad-live-sync-backoff-until:v1';
const LIVE_SYNC_COOLDOWN_MS = 15 * 1000;
const LIVE_SYNC_RATE_LIMIT_BACKOFF_MS = 2 * 60 * 1000;
const PULSEPOINT_AGENCY_IDS = ['76000', 'EMS1402'];
const PULSEPOINT_API_URL = 'https://api.pulsepoint.org/v1/webapp?resource=incidents&agencyid=';
const PULSEPOINT_GIBA_URL = 'https://web.pulsepoint.org/DB/giba.php?agency_id=';
const PULSEPOINT_WAF_SCRIPT_URL = 'https://aac9c7b4c5f6.us-west-2.captcha-sdk.awswaf.com/aac9c7b4c5f6/jsapi.js';
let liveSyncInFlight = null;
let pulsePointSyncInFlight = null;

function timestampMs(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function newestCadCallTime(calls = []) {
  return (calls || []).reduce((latest, call) => {
    const upstream = timestampMs(call?.time_received);
    const created = timestampMs(call?.created_date);
    const reliable = upstream && created && Math.abs(upstream - created) < 24 * 60 * 60 * 1000
      ? upstream
      : (created || upstream);
    return Math.max(latest, reliable || 0);
  }, 0);
}

export function cadCallFeedIsStale(calls = [], maxAgeMs = STALE_AFTER_MS) {
  // An incident's time_received is not the time the public source was last
  // checked. If there have been no new incidents, the successful source poll
  // still proves the feed is current and prevents duplicate recovery ingest jobs.
  const lastPoll = (() => {
    try { return Number(localStorage.getItem(LAST_SUCCESSFUL_SOURCE_POLL_KEY) || 0) || 0; }
    catch { return 0; }
  })();
  const newest = Math.max(newestCadCallTime(calls), lastPoll);
  return !newest || Date.now() - newest > maxAgeMs;
}

function lastRecoveryAt() {
  try { return Number(localStorage.getItem(RECOVERY_STAMP_KEY) || 0) || 0; }
  catch { return 0; }
}

function noteRecoveryAttempt() {
  try { localStorage.setItem(RECOVERY_STAMP_KEY, String(Date.now())); } catch {}
}

function lastLiveSyncAt() {
  try { return Number(localStorage.getItem(LIVE_SYNC_STAMP_KEY) || 0) || 0; }
  catch { return 0; }
}

function noteLiveSyncAttempt() {
  try { localStorage.setItem(LIVE_SYNC_STAMP_KEY, String(Date.now())); } catch {}
}

function liveSyncBackoffUntil() {
  try { return Number(localStorage.getItem(LIVE_SYNC_BACKOFF_KEY) || 0) || 0; }
  catch { return 0; }
}

function noteLiveSyncBackoff(milliseconds = LIVE_SYNC_RATE_LIMIT_BACKOFF_MS) {
  try { localStorage.setItem(LIVE_SYNC_BACKOFF_KEY, String(Date.now() + milliseconds)); } catch {}
}

function clearLiveSyncBackoff() {
  try { localStorage.removeItem(LIVE_SYNC_BACKOFF_KEY); } catch {}
}

function isRateLimitError(error) {
  return /rate limit|too many requests|\b429\b/i.test(String(error?.message || error || ''));
}

async function invokePulsePointIngest(payload, label = 'PulsePoint source sync') {
  const response = await withRequestTimeout(
    base44.functions.invoke('ingestPulsePoint', payload),
    35_000,
    label,
  );
  return response?.data || response || {};
}

async function loadPulsePointWafFetch() {
  if (typeof window === 'undefined') return null;
  if (window.AwsWafIntegration?.fetch) return window.AwsWafIntegration.fetch.bind(window.AwsWafIntegration);
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PULSEPOINT_WAF_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      window.setTimeout(resolve, 1500);
      return;
    }
    const script = document.createElement('script');
    script.src = PULSEPOINT_WAF_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  const started = Date.now();
  while (!window.AwsWafIntegration?.fetch && Date.now() - started < 3000) {
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  return window.AwsWafIntegration?.fetch ? window.AwsWafIntegration.fetch.bind(window.AwsWafIntegration) : null;
}

async function fetchPulsePointWebappIncidents(agencyIds = PULSEPOINT_AGENCY_IDS) {
  const wafFetch = await loadPulsePointWafFetch();
  const fetchImpl = wafFetch || fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Browser fetch is not available for PulsePoint sync');
  const agencyParam = agencyIds.map(id => encodeURIComponent(id)).join(',');
  const response = await fetchImpl(`${PULSEPOINT_API_URL}${agencyParam}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const contentType = response.headers?.get?.('content-type') || '';
  if (!response.ok) throw new Error(`PulsePoint webapp feed failed HTTP ${response.status}`);
  const payload = contentType.includes('application/json') ? await response.json() : JSON.parse(await response.text());
  const active = Array.isArray(payload?.incidents?.active) ? payload.incidents.active : [];
  return { payload, active };
}

async function fetchPulsePointEncodedResponse(agencyIds = PULSEPOINT_AGENCY_IDS) {
  if (typeof fetch !== 'function') throw new Error('Browser fetch is not available for PulsePoint sync');
  const response = await fetch(`${PULSEPOINT_GIBA_URL}${encodeURIComponent(agencyIds.join(','))}`, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`PulsePoint browser feed failed HTTP ${response.status}`);
  if (!contentType.includes('application/json')) {
    const preview = (await response.text()).slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`PulsePoint browser feed returned ${contentType || 'non-JSON'}: ${preview}`);
  }
  return response.json();
}

async function performPulsePointLiveSync(requestId) {
  if (pulsePointSyncInFlight) return pulsePointSyncInFlight;
  pulsePointSyncInFlight = (async () => {
    const basePayload = {
      scheduled: true,
      include_audio: true,
      agency_ids: PULSEPOINT_AGENCY_IDS,
      area_keys: ['richmond_va', 'chesterfield_va'],
      request_id: `pulsepoint-${requestId}`,
    };
    let backendError = null;
    try {
      const result = await invokePulsePointIngest(basePayload);
      if (result?.success) return result;
      backendError = new Error(result?.error || 'PulsePoint backend sync did not return success');
      backendError.response = { data: result };
    } catch (error) {
      backendError = error;
    }

    try {
      const { active } = await fetchPulsePointWebappIncidents(PULSEPOINT_AGENCY_IDS);
      return invokePulsePointIngest({
        ...basePayload,
        incidents: active,
        request_id: `pulsepoint-webapp-${requestId}`,
      }, 'PulsePoint webapp browser-assisted source sync');
    } catch (webappError) {
      try {
        const encoded = await fetchPulsePointEncodedResponse(PULSEPOINT_AGENCY_IDS);
        return invokePulsePointIngest({
          ...basePayload,
          encoded_response: encoded,
          request_id: `pulsepoint-browser-${requestId}`,
        }, 'PulsePoint browser-assisted source sync');
      } catch (browserError) {
        const backendMessage = backendError?.response?.data?.error || backendError?.message || backendError;
        const webappMessage = webappError?.message || webappError;
        const browserMessage = browserError?.message || browserError;
        console.warn('[CAD] PulsePoint sync failed', { backend: backendMessage, webapp: webappMessage, browser: browserMessage });
        return {
          success: false,
          source: 'pulsepoint',
          error: String(webappMessage || browserMessage || backendMessage || 'PulsePoint sync failed'),
          backend_error: String(backendMessage || ''),
          browser_error: String(browserMessage || ''),
        };
      }
    }
  })().finally(() => { pulsePointSyncInFlight = null; });
  return pulsePointSyncInFlight;
}

async function performCadLiveSync() {
  const now = Date.now();
  const backoffUntil = liveSyncBackoffUntil();
  if (backoffUntil > now) {
    return { skipped: true, reason: 'rate_limit_backoff', retry_after_ms: backoffUntil - now };
  }

  const age = now - lastLiveSyncAt();
  if (age >= 0 && age < LIVE_SYNC_COOLDOWN_MS) {
    return { skipped: true, reason: 'recent_live_sync', retry_after_ms: LIVE_SYNC_COOLDOWN_MS - age };
  }

  noteLiveSyncAttempt();
  try {
    // Include a unique request id so the SDK/network layer never serves a stale
    // function result for a live-source poll. The backend intentionally ignores
    // this field; it exists only to make each permitted network sync distinct.
    const requestId = `cad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await withRequestTimeout(
      base44.functions.invoke('ingestGractivecalls', {
        live_sync: true,
        request_id: requestId,
      }),
      40_000,
      'Live CAD source sync',
    );
    const payload = response?.data || response || {};
    void performPulsePointLiveSync(requestId).then(pulsePointPayload => {
      if (pulsePointPayload?.success) {
        window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished', { detail: { source: 'pulsepoint', result: pulsePointPayload } }));
      } else if (pulsePointPayload?.error) {
        console.warn('[CAD] Hidden PulsePoint sync did not complete', pulsePointPayload.error);
      }
    }).catch(error => {
      console.warn('[CAD] Hidden PulsePoint sync did not complete', error?.response?.data?.error || error?.message || error);
    });
    if (payload?.error) throw new Error(payload.error);
    if (payload?.skipped && /already in progress|ingestion_in_progress/i.test(String(payload.reason || ''))) {
      // Another authorized session or scheduled run owns the one global server
      // lease. Retry promptly instead of counting its work as OUR successful
      // poll and waiting a whole minute. The browser-wide cooldown still
      // protects against concurrent local tabs.
      try { localStorage.setItem(LIVE_SYNC_STAMP_KEY, String(Date.now() - LIVE_SYNC_COOLDOWN_MS + BUSY_LEASE_RETRY_MS)); } catch {}
      return { ...payload, retry_after_ms: BUSY_LEASE_RETRY_MS };
    }
    if (payload?.success && !payload?.skipped) {
      try { localStorage.setItem(LAST_SUCCESSFUL_SOURCE_POLL_KEY, String(Date.now())); } catch {}
    }
    clearLiveSyncBackoff();
    return payload;
  } catch (error) {
    if (isRateLimitError(error)) noteLiveSyncBackoff();
    throw error;
  }
}

export async function requestCadLiveSync() {
  if (liveSyncInFlight) return liveSyncInFlight;
  liveSyncInFlight = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('bps-cad-live-source-sync', { mode: 'exclusive' }, performCadLiveSync);
    }
    return performCadLiveSync();
  })().finally(() => { liveSyncInFlight = null; });
  return liveSyncInFlight;
}

async function runRecovery() {
  const age = Date.now() - lastRecoveryAt();
  if (age >= 0 && age < RECOVERY_COOLDOWN_MS) {
    return { skipped: true, reason: 'recent_attempt', retry_after_ms: RECOVERY_COOLDOWN_MS - age };
  }
  noteRecoveryAttempt();
  // Use the same cross-tab live-sync lock, minute cooldown, and 429 backoff
  // as Dispatch Center. Recovery must not create a second competing ingestion.
  return requestCadLiveSync();
}

/**
 * Visible command screens keep the upstream source warm. If persisted CAD rows
 * fall behind, exactly one browser recovery attempt is allowed per short cooldown
 * across open Pathfinder tabs. This prevents request storms while keeping active
 * calls from sitting several minutes behind the public source.
 */
export async function refreshCadIngestionIfStale(calls = [], { maxAgeMs = STALE_AFTER_MS } = {}) {
  if (!cadCallFeedIsStale(calls, maxAgeMs)) return { skipped: true, reason: 'feed_fresh' };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('bps-cad-ingestion-recovery', { mode: 'exclusive' }, runRecovery);
  }
  return runRecovery();
}
