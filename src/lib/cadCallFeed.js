import { base44 } from '@/api/base44Client';

const STALE_AFTER_MS = 3 * 60 * 1000;
const MIN_KICK_GAP_MS = 60 * 1000;
let lastKickAt = 0;
let inFlight = null;

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

/**
 * Self-heal the persisted CAD feed only when it is stale. Scheduled ingestion
 * remains primary; this is a bounded recovery path for an authenticated internal
 * Pathfinder session if the scheduler has missed a run.
 */
export async function refreshCadIngestionIfStale(calls = [], { maxAgeMs = STALE_AFTER_MS } = {}) {
  if (!cadCallFeedIsStale(calls, maxAgeMs)) return { skipped: true, reason: 'feed_fresh' };
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now - lastKickAt < MIN_KICK_GAP_MS) return { skipped: true, reason: 'recent_attempt' };

  lastKickAt = now;
  inFlight = (async () => {
    try {
      const response = await base44.functions.invoke('ingestGractivecalls', {});
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      return payload;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
