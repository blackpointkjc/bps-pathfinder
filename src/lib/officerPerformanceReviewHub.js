import { base44 } from '@/api/base44Client';

const TTL_MS = 90_000;
const cache = new Map();
const inflight = new Map();

const keyFor = request => String(request?.preview_user_id || 'self');

export function invalidateOfficerPerformanceReviewCache(request = null) {
  if (!request) {
    cache.clear();
    return;
  }
  cache.delete(keyFor(request));
}

export async function getOfficerPerformanceReviewSnapshot(request = {}, { force = false } = {}) {
  const key = keyFor(request);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.payload;
  if (inflight.has(key)) return inflight.get(key);

  const pending = base44.functions.invoke('manageOfficerPerformanceReviews', {
    action: 'list',
    ...(request || {}),
  }).then(response => {
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    const normalized = { ...payload, reviews: Array.isArray(payload.reviews) ? payload.reviews : [] };
    cache.set(key, { at: Date.now(), payload: normalized });
    return normalized;
  }).finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

if (typeof window !== 'undefined' && !window.__bpsPerformanceReviewHubInstalled) {
  const clear = event => {
    const detail = event?.detail || {};
    if (
      detail.entity === 'PerformanceReview'
      || detail.name === 'PerformanceReview'
      || detail.name === 'manageOfficerPerformanceReviews'
      || detail.name === 'completeSupervisorPerformanceReview'
    ) invalidateOfficerPerformanceReviewCache();
  };
  window.addEventListener('bps-performance-refresh', clear);
  window.addEventListener('bps-data-changed', clear);
  window.addEventListener('pathfinder:performance-review-updated', () => invalidateOfficerPerformanceReviewCache());
  window.__bpsPerformanceReviewHubInstalled = true;
}
