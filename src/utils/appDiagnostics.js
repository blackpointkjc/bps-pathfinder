import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'pathfinder_runtime_issues_v1';
const MAX_ISSUES = 100;
const pageModules = import.meta.glob('/src/pages/*.{jsx,js,tsx,ts}');

const safeMessage = value => {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value || 'Unknown error'); }
};

export function getRuntimeIssues() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRuntimeIssue(issue = {}) {
  try {
    const message = safeMessage(issue.message || issue.error || 'Unknown runtime error').slice(0, 1000);
    if (!message || /ResizeObserver loop/i.test(message)) return;
    const now = new Date().toISOString();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: issue.type || 'runtime_error',
      message,
      page: issue.page || window.location.pathname || 'unknown',
      source: issue.source || '',
      line: Number(issue.line || 0) || null,
      column: Number(issue.column || 0) || null,
      stack: String(issue.stack || issue.error?.stack || '').slice(0, 3000),
      occurred_at: now,
    };
    const current = getRuntimeIssues();
    const duplicateCutoff = Date.now() - (5 * 60 * 1000);
    const isDuplicate = current.some(item =>
      item.message === entry.message
      && item.page === entry.page
      && new Date(item.occurred_at || 0).getTime() >= duplicateCutoff
    );
    if (isDuplicate) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...current].slice(0, MAX_ISSUES)));
  } catch {
    // Diagnostics must never cause another application failure.
  }
}

export function installGlobalRuntimeIssueCapture() {
  if (typeof window === 'undefined' || window.__pathfinderIssueCaptureInstalled) return () => {};
  window.__pathfinderIssueCaptureInstalled = true;

  const onError = event => recordRuntimeIssue({
    type: 'javascript_error',
    message: event.message || event.error,
    error: event.error,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
  });
  const onUnhandledRejection = event => recordRuntimeIssue({
    type: 'unhandled_promise',
    message: event.reason,
    error: event.reason,
  });

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.__pathfinderIssueCaptureInstalled = false;
  };
}

const finding = (key, area, severity, title, description, count) => ({
  key, area, severity, title, description, ...(count ? { count } : {}),
});

export async function runClientFunctionalAudit() {
  const startedAt = Date.now();
  const findings = [];
  const moduleFailures = [];
  let loadedModules = 0;

  await Promise.all(Object.entries(pageModules).map(async ([path, loader]) => {
    try {
      const loaded = await loader();
      if (!loaded?.default) throw new Error('Page module has no default component export');
      loadedModules += 1;
    } catch (error) {
      moduleFailures.push({ path, message: safeMessage(error) });
    }
  }));

  if (moduleFailures.length) {
    moduleFailures.forEach((failure, index) => findings.push(finding(
      `code:page-module:${index}`,
      'Page Code',
      'outage',
      `Page module failed to load: ${failure.path.split('/').pop()}`,
      failure.message,
    )));
  }

  const requiredSdk = [
    ['Authentication', base44?.auth?.me],
    ['Entity reads', base44?.entities?.User?.list],
    ['Backend functions', base44?.functions?.invoke],
  ];
  requiredSdk.forEach(([label, method]) => {
    if (typeof method !== 'function') findings.push(finding(
      `sdk:${String(label).toLowerCase().replace(/\s+/g, '-')}`,
      'Application SDK',
      'outage',
      `${label} API is unavailable`,
      'A required Base44 client function is missing, so connected app features may fail.',
    ));
  });

  try {
    const key = '__pathfinder_health_test__';
    localStorage.setItem(key, 'ok');
    if (localStorage.getItem(key) !== 'ok') throw new Error('Storage value could not be read back');
    localStorage.removeItem(key);
  } catch (error) {
    findings.push(finding('browser:storage', 'Browser Functions', 'degraded', 'Browser storage is unavailable', safeMessage(error)));
  }

  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
    findings.push(finding(
      'browser:speech',
      'Alerts & Announcements',
      'degraded',
      'Spoken alert support is unavailable',
      'This browser cannot announce monitored-property calls aloud.',
    ));
  }
  if (!('Notification' in window)) {
    findings.push(finding(
      'browser:notification',
      'Alerts & Announcements',
      'maintenance',
      'Desktop notifications are unsupported',
      'The browser cannot display operating-system notifications; in-app alerts remain available.',
    ));
  }
  if (!navigator.geolocation) {
    findings.push(finding(
      'browser:geolocation',
      'Location Functions',
      'degraded',
      'Geolocation is unavailable',
      'Live unit location, navigation, geofencing, and QR location verification cannot operate.',
    ));
  }
  if (!navigator.onLine) {
    findings.push(finding(
      'browser:offline',
      'Network',
      'degraded',
      'Browser is currently offline',
      'Live CAD updates and server functions cannot run until connectivity returns.',
    ));
  }

  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const recentRuntime = getRuntimeIssues().filter(item => new Date(item.occurred_at || 0).getTime() >= cutoff);
  const groupedRuntime = new Map();
  recentRuntime.forEach(item => {
    const key = `${item.page}|${item.message}`;
    if (!groupedRuntime.has(key)) groupedRuntime.set(key, { ...item, count: 0 });
    groupedRuntime.get(key).count += 1;
  });
  [...groupedRuntime.values()].forEach((item, index) => findings.push(finding(
    `runtime:${index}`,
    'Runtime Errors',
    'outage',
    `Runtime failure on ${item.page}`,
    `${item.message}${item.source ? ` — ${item.source}${item.line ? `:${item.line}` : ''}` : ''}`,
    item.count,
  )));

  return {
    findings,
    summary: {
      page_modules_checked: Object.keys(pageModules).length,
      page_modules_loaded: loadedModules,
      module_failures: moduleFailures.length,
      runtime_errors_24h: recentRuntime.length,
      client_issues: findings.length,
    },
    scanned_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  };
}
