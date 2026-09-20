import { base44 } from '@/api/base44Client';

const TTL_MS = 10 * 60_000;
const STORAGE_PREFIX = 'bps:performance-reviews:last-good:v2:';
const cache = new Map();
const inflight = new Map();

const keyFor = request => String(request?.preview_user_id || 'self');
const storageKeyFor = request => `${STORAGE_PREFIX}${keyFor(request)}`;

function readPersisted(request) {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKeyFor(request)) || 'null');
    if (!parsed?.payload || !parsed?.at || Date.now() - Number(parsed.at) > 24 * 60 * 60_000) return null;
    return parsed;
  } catch { return null; }
}

function persist(request, payload) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(storageKeyFor(request), JSON.stringify({ at: Date.now(), payload })); } catch {}
}

export function invalidateOfficerPerformanceReviewCache(request = null) {
  if (!request) {
    cache.clear();
    if (typeof window !== 'undefined') {
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
          const key = window.localStorage.key(i);
          if (key?.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
        }
      } catch {}
    }
    return;
  }
  cache.delete(keyFor(request));
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(storageKeyFor(request)); } catch {}
  }
}

export async function getOfficerPerformanceReviewSnapshot(request = {}, { force = false } = {}) {
  const key = keyFor(request);
  let cached = cache.get(key);
  if (!cached) {
    const persisted = readPersisted(request);
    if (persisted) {
      cached = persisted;
      cache.set(key, persisted);
    }
  }
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.payload;
  if (inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const previewUserId = String(request?.preview_user_id || '').trim();
    let rows = [];
    if (previewUserId) {
      rows = await base44.entities.PerformanceReview.filter({ officer_id: previewUserId }, '-review_date', 250);
    } else {
      const me = await base44.auth.me();
      if (!me?.email) return { success: true, reviews: [] };
      rows = await base44.entities.PerformanceReview.filter({ officer_email: me.email }, '-review_date', 250);
    }
    const normalized = { success: true, reviews: Array.isArray(rows) ? rows : [] };
    const item = { at: Date.now(), payload: normalized };
    cache.set(key, item);
    persist(request, normalized);
    return normalized;
  })().finally(() => inflight.delete(key));

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
