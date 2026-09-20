const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const COMPANY_PREFIX = 'bps:analytics:company:last-verified:v5:';
const PERFORMANCE_PREFIX = 'bps:analytics:performance:last-verified:v5:';

function monthKey() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    return `${year}-${month}`;
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

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

function companyRangeKey(request = {}) {
  const start = String(request?.start_date || request?.startDate || '').trim();
  const end = String(request?.end_date || request?.endDate || '').trim();
  return start && end ? `${start}:${end}` : monthKey();
}

export function readCompanyAnalyticsSnapshot(request = {}) {
  return safeRead(`${COMPANY_PREFIX}${companyRangeKey(request)}`);
}

export function saveCompanyAnalyticsSnapshot(request = {}, data) {
  if (data?.service_errors && Object.keys(data.service_errors).length) return;
  safeWrite(`${COMPANY_PREFIX}${companyRangeKey(request)}`, data);
}

export function readPerformanceSnapshot(request = {}) {
  return safeRead(`${PERFORMANCE_PREFIX}${monthKey()}:${previewKey(request)}`);
}

export function savePerformanceSnapshot(request = {}, data) {
  if (data?.service_errors && Object.keys(data.service_errors).length) return;
  safeWrite(`${PERFORMANCE_PREFIX}${monthKey()}:${previewKey(request)}`, data);
}
