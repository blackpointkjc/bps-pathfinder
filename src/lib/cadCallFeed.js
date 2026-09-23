import { base44 } from '@/api/base44Client';
import { withRequestTimeout } from '@/lib/requestTimeout';

const STALE_AFTER_MS = 5 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 15 * 60 * 1000;
const RECOVERY_STAMP_KEY = 'bps:cad-ingestion-recovery-at:v2';
const LIVE_SYNC_STAMP_KEY = 'bps:cad-live-sync-at:v1';
const LIVE_SYNC_COOLDOWN_MS = 30_000;
let liveSyncInFlight = null;

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
  const newest = newestCadCallTime(calls);
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

async function performCadLiveSync() {
  const age = Date.now() - lastLiveSyncAt();
  if (age >= 0 && age < LIVE_SYNC_COOLDOWN_MS) {
    return { skipped: true, reason: 'recent_live_sync', retry_after_ms: LIVE_SYNC_COOLDOWN_MS - age };
  }

  noteLiveSyncAttempt();
  const response = await withRequestTimeout(
    base44.functions.invoke('ingestGractivecalls', {}),
    25_000,
    'Live CAD source sync',
  );
  const payload = response?.data || response || {};
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

export async function requestCadLiveSync() {
  if (liveSyncInFlight) return liveSyncInFlight;

  liveSyncInFlight = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('bps-cad-live-source-sync', { mode: 'exclusive' }, performCadLiveSync);
    }
    return performCadLiveSync();
  })().finally(() => {
    liveSyncInFlight = null;
  });

  return liveSyncInFlight;
}

async function runRecovery() {
  const age = Date.now() - lastRecoveryAt();
  if (age >= 0 && age < RECOVERY_COOLDOWN_MS) {
    return { skipped: true, reason: 'recent_attempt', retry_after_ms: RECOVERY_COOLDOWN_MS - age };
  }
  noteRecoveryAttempt();
  // ingestGractivecalls already runs as a backend automation every minute. The
  // absence of a new CAD call for five minutes does not mean ingestion is stale;
  // it can simply mean no agency posted a new call. Browsers therefore never
  // invoke the ingestion function themselves, eliminating another source of 429s.
  return { skipped: true, reason: 'scheduled_ingestion_owns_feed' };
}

/**
 * The scheduled backend automation remains the normal ingestion owner. If it
 * stops updating the feed for >5 minutes, exactly one browser recovery attempt is
 * allowed per five minutes across open Pathfinder tabs. This prevents the old
 * request storm while also preventing CAD from staying blank for hours when a
 * scheduler run is missed.
 */
export async function refreshCadIngestionIfStale(calls = [], { maxAgeMs = STALE_AFTER_MS } = {}) {
  if (!cadCallFeedIsStale(calls, maxAgeMs)) return { skipped: true, reason: 'feed_fresh' };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('bps-cad-ingestion-recovery', { mode: 'exclusive' }, runRecovery);
  }
  return runRecovery();
}
