const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const COMPANY_KEY = 'bps:analytics:company:last-verified:v1';
const PERFORMANCE_PREFIX = 'bps:analytics:performance:last-verified:v1:';

function safeRead(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite(key, data) {
  if (!data || typeof data !== 'object') return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}

function previewKey(request = {}) {
  return String(request?.preview_user_id || 'self').trim() || 'self';
}

export function readCompanyAnalyticsSnapshot() {
  return safeRead(COMPANY_KEY);
}

export function saveCompanyAnalyticsSnapshot(data) {
  if (data?.service_errors && Object.keys(data.service_errors).length) return;
  safeWrite(COMPANY_KEY, data);
}

export function readPerformanceSnapshot(request = {}) {
  return safeRead(`${PERFORMANCE_PREFIX}${previewKey(request)}`);
}

export function savePerformanceSnapshot(request = {}, data) {
  if (data?.service_errors && Object.keys(data.service_errors).length) return;
  safeWrite(`${PERFORMANCE_PREFIX}${previewKey(request)}`, data);
}
