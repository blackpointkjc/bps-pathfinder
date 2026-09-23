import { base44, getBase44RequestHealth } from '@/api/base44Client';

const STATUS_KEY = 'bps:pathfinder:last-status-write:v1';
const STATUS_ATTEMPT_KEY = 'bps:pathfinder:status-attempt:v1';
const STATUS_RETRY_MIN_DELAY_MS = 8_000;
const STATUS_RETRY_MAX_DELAY_MS = 46_000;
const statusRuntime = globalThis.__BPS_OFFICER_STATUS_RUNTIME__ || { inflight: null };
if (!globalThis.__BPS_OFFICER_STATUS_RUNTIME__) globalThis.__BPS_OFFICER_STATUS_RUNTIME__ = statusRuntime;

function readLast() {
  try {
    const value = JSON.parse(localStorage.getItem(STATUS_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeLast(status) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify({ status, at: Date.now() })); } catch {}
}

function isRateLimit(error) {
  return /rate limit|too many requests|\b429\b/i.test(String(error?.response?.data?.error || error?.message || error || ''));
}

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

function statusRetryDelay() {
  const limitedUntil = new Date(getBase44RequestHealth()?.rateLimitedUntil || 0).getTime();
  const cooldownRemaining = Number.isFinite(limitedUntil) ? Math.max(0, limitedUntil - Date.now() + 250) : 0;
  return Math.min(STATUS_RETRY_MAX_DELAY_MS, Math.max(STATUS_RETRY_MIN_DELAY_MS, cooldownRemaining));
}

export function getLastOfficerStatus() {
  return readLast()?.status || '';
}

export function cacheOfficerStatus(status) {
  const normalized = String(status || '').trim();
  if (normalized) writeLast(normalized);
}

export async function persistOfficerStatus(status, { force = false } = {}) {
  const normalized = String(status || '').trim();
  if (!normalized) throw new Error('A status is required.');

  const execute = async () => {
    const last = readLast();
    if (!force && last?.status === normalized && Date.now() - Number(last.at || 0) < 60_000) {
      return { success: true, status: normalized, suppressed: true, suppressed_reason: 'same_status_recently_saved' };
    }
    try { localStorage.setItem(STATUS_ATTEMPT_KEY, JSON.stringify({ status: normalized, at: Date.now() })); } catch {}
    let response;
    try {
      response = await base44.functions.invoke('updateOfficerStatus', { status: normalized });
    } catch (error) {
      if (!isRateLimit(error)) throw error;
      // Status updates are idempotent. Wait for the shared Base44 cooldown before
      // retrying; the former fixed eight-second retry landed inside the 45-second
      // cooldown and turned one throttle into two failed updateOfficerStatus calls.
      await wait(statusRetryDelay());
      response = await base44.functions.invoke('updateOfficerStatus', { status: normalized });
    }
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    const savedStatus = payload.status || normalized;
    writeLast(savedStatus);
    try {
      window.dispatchEvent(new CustomEvent('bps-officer-status-changed', {
        detail: {
          status: savedStatus,
          source: 'status-service',
          email: payload.email || '',
          officer_id: payload.officer_id || '',
          last_updated: payload.last_updated || new Date().toISOString(),
        },
      }));
    } catch {}
    return payload;
  };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('bps-officer-status-write', { mode: 'exclusive' }, execute);
  }
  if (statusRuntime.inflight) return statusRuntime.inflight;
  statusRuntime.inflight = execute().finally(() => { statusRuntime.inflight = null; });
  return statusRuntime.inflight;
}

export function clearOfficerStatusWriteCache() {
  try {
    localStorage.removeItem(STATUS_KEY);
    localStorage.removeItem(STATUS_ATTEMPT_KEY);
  } catch {}
}
