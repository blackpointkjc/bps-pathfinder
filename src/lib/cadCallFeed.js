const STALE_AFTER_MS = 5 * 60 * 1000;

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
 * The scheduled Base44 ingestion job is the sole writer for the external CAD
 * feed. Browsers used to invoke ingestGractivecalls themselves whenever they
 * thought the feed was stale, which meant several officers could start the same
 * expensive ingestion at once and immediately consume the global request budget.
 *
 * Keep this compatibility helper for existing callers, but never launch a second
 * ingestion from the browser. Realtime DispatchCall updates deliver scheduled
 * ingestion results to every open workstation.
 */
export async function refreshCadIngestionIfStale(calls = [], { maxAgeMs = STALE_AFTER_MS } = {}) {
  if (!cadCallFeedIsStale(calls, maxAgeMs)) return { skipped: true, reason: 'feed_fresh' };
  return { skipped: true, reason: 'scheduled_ingestion_pending' };
}
