import {offlineIdentity,rememberOfflineIdentity,forgetOfflineIdentity} from '@/lib/offlineSession';
import {offlineGet,offlinePut} from '@/lib/offlineWork';
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { withRequestTimeout } from '@/lib/requestTimeout';

const { appId, serverUrl, token, functionsVersion } = appParams;

const rawBase44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false,
});

// Base44 enforces one request allowance across the application. Pathfinder has
// many always-mounted realtime features, so an unbounded startup/refetch burst can
// consume that allowance just as an officer saves a report or changes status.
// User writes always bypass this queue; only reads are capped and deduplicated.
const MAX_CONCURRENT_READS = 2;
// Concurrency alone does not limit fast completions; space starts to avoid bursts.
// Reduce artificial startup serialization; existing 429 backoff and two-read
// concurrency cap still protect the API when the service is throttled.
const READ_START_GAP_MS = 125;
let nextReadStartAt = 0;
const READ_CACHE_MS = 12_000;
const readCacheTtl = meta => {
  if (meta?.kind === 'auth') return 5 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'cad-voice-broadcast') return 1000;
  if (meta?.kind === 'entity' && ['MicrosoftTeamsIdentity','OutlookMailboxLink'].includes(meta?.name)) return 30 * 60_000;
  if (meta?.kind === 'entity' && meta?.name === 'User') return 5 * 60_000;
  if (meta?.kind === 'entity' && ['Location','Division'].includes(meta?.name)) return 30 * 60_000;
  if (meta?.kind === 'entity' && meta?.name === 'PropertyAlert') return 10_000;
  if (meta?.kind === 'entity' && meta?.name === 'DispatchCall') return 3_000;
  if (meta?.kind === 'entity' && meta?.name === 'TimeEntry') return 20_000;
  if (meta?.kind === 'entity' && ['Vehicle','PlannedShift','JobDutyRule','QRCheckpoint'].includes(meta?.name)) return 5 * 60_000;
  if (meta?.kind === 'entity' && meta?.name === 'BOLOAlert') return 2 * 60_000;
  if (meta?.kind === 'entity' && meta?.name === 'Schedule') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getOnDutyUnits') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getActiveDispatchCalls') return 5_000;
  if (meta?.kind === 'function' && meta?.name === 'getSupervisorWelfareBoard') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getWorkforceSnapshot') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getRoleWorkQueue') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getFleetScheduleData') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getLocationAuditReport') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getIncidentReportHistory') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'manageDutySupervisorSchedule' && meta?.action === 'list') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'manageAutoDispatchConfig' && meta?.action === 'list') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'managePlannedShifts' && meta?.action === 'list') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyAnalyticsSegment') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyPerformanceData') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getMyPerformanceData') return 30_000;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyAnalyticsData') return 2 * 60_000;
  if (meta?.kind === 'function' && ['getAppDirectory','getOfficerDirectory','getSupervisorScopedTasks'].includes(meta?.name)) return 5 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getWelcomeBriefingData') return 90_000;
  if (meta?.kind === 'function' && meta?.name === 'getCallHistoryFeed') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getDispatchCallLinkFeed') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'manageBolo' && meta?.action === 'list') return 2 * 60_000;
  if (meta?.kind === 'function' && meta?.name === 'manageHRTimeEntries' && meta?.action === 'list') return 60_000;
  if (meta?.kind === 'function' && ['manageOfficerPerformanceReviews','managePerformanceReviews'].includes(meta?.name) && meta?.action === 'list') return 10 * 60_000;
  return READ_CACHE_MS;
};
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const CRITICAL_RATE_LIMIT_RECOVERY_MS = 25_000;
const READ_QUEUE_TIMEOUT_MS = 120_000;
const RATE_LIMIT_KEY = 'bps:base44-rate-limit-until';
const TRACE_STORAGE_KEY = 'bps:base44-request-trace-v2';
const TRACE_MAX = 300;
const READ_METHODS = new Set(['list', 'filter', 'get']);
const WRITE_METHODS = new Set(['create', 'update', 'delete', 'bulkCreate', 'importEntities']);
const PERFORMANCE_ENTITY_NAMES = new Set([
  'TimeEntry', 'Schedule', 'DailyActivityReport', 'ShiftReport', 'IncidentReport', 'CallOut',
  'QRScanEvent', 'QRPatrolReport', 'CallAssignment', 'TrainingAssignment', 'TrainingCompletion', 'TrainingModule',
  'ShiftBid', 'PerformanceReview', 'ClientFeedback', 'Commendation', 'Complaint',
  'JobDutyRule', 'PropertyAlert', 'DispatchCall', 'CallHistory', 'CallPerformanceDecision',
]);
const entityWrappers = new Map();
const readCache = new Map();
const readCacheRevisions = new Map();
const readCacheVersion = key => [...readCacheRevisions].reduce((sum, [prefix, revision]) => key.startsWith(prefix) ? sum + revision : sum, 0);
const invalidateReadPrefix = prefix => readCacheRevisions.set(prefix, (readCacheRevisions.get(prefix) || 0) + 1);
const readInflight = new Map();
const writeInflight = new Map();
const readQueue = [];
let activeReads = 0;
let activeBackgroundReads = 0;
let activeAnalyticsReads = 0;
const isAnalyticsRead = meta => meta?.kind === 'function' && ['getCompanyAnalyticsSegment','getCompanyPerformanceData','getCompanyAnalyticsData'].includes(meta?.name);
let activeWrites = 0;
let recentRateLimitAt = null;
let readRecoveryUntil = 0;
let wakeTimer = null;

const errorText = error => String(error?.response?.data?.error || error?.response?.data?.message || error?.message || error || '');
const tracePage = () => {
  try { return window.location.pathname + window.location.search; } catch { return ''; }
};
let traceRows = null;
let traceFlushTimer = null;
const loadTrace = () => {
  if (traceRows) return traceRows;
  try {
    const parsed = JSON.parse(localStorage.getItem(TRACE_STORAGE_KEY) || '[]');
    traceRows = Array.isArray(parsed) ? parsed.slice(0, TRACE_MAX) : [];
  } catch { traceRows = []; }
  return traceRows;
};
const flushTrace = () => {
  if (traceFlushTimer) window.clearTimeout(traceFlushTimer);
  traceFlushTimer = null;
  if (!traceRows) return;
  try { localStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(traceRows)); } catch {}
};
const saveTrace = rows => {
  traceRows = rows.slice(0, TRACE_MAX);
  if (!traceFlushTimer) traceFlushTimer = window.setTimeout(flushTrace, 2000);
};
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushTrace);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushTrace(); });
}
const recordRequestTrace = entry => {
  try {
    const row = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      page: tracePage(),
      queuedReads: readQueue.length,
      activeReads,
      activeWrites,
      ...entry,
    };
    saveTrace([row, ...loadTrace()]);
    window.dispatchEvent(new CustomEvent('bps-base44-request-trace', { detail: row }));
  } catch {
    // Diagnostics must never create another application failure.
  }
};
const readPriority = meta => {
  if (meta?.kind === 'auth') return 100;
  if (meta?.kind === 'function' && ['getCallOutShifts','getNavigationLocations','geocodeNavigationDestination'].includes(meta?.name)) return 90;
  if (meta?.kind === 'function' && meta?.name === 'cad-voice-broadcast') return 96;
  if (meta?.kind === 'function' && meta?.name === 'manageLiveLocationPrivacy') return 95;
  if (meta?.kind === 'function' && ['getMyTimeEntries', 'manageHRTimeEntries', 'getMyScheduleData', 'getPTORequests', 'manageDutySupervisorSchedule'].includes(meta?.name)) return 90;
  if (meta?.kind === 'function' && ['getActiveDispatchCalls','getOnDutyUnits'].includes(meta?.name)) return 95;
  if (meta?.kind === 'function' && ['getWorkforceSnapshot','getSupervisorWelfareBoard'].includes(meta?.name)) return 88;
  if (meta?.kind === 'function' && ['getAppDirectory','getOfficerDirectory','getSupervisorScopedTasks'].includes(meta?.name)) return 85;
  if (meta?.kind === 'entity' && ['DispatchCall','ActiveOfficer','TimeEntry'].includes(meta?.name)) return 90;
  if (meta?.kind === 'entity' && ['BOLOAlert','Vehicle','Schedule','PlannedShift','JobDutyRule','QRCheckpoint'].includes(meta?.name)) return 82;
  if (meta?.kind === 'entity' && ['User','Location','Division'].includes(meta?.name)) return 75;
  if (meta?.kind === 'function' && ['getCallHistoryFeed','getDispatchCallLinkFeed','getIncidentReportHistory','getLocationAuditReport','manageBolo','manageHRTimeEntries','manageDutySupervisorSchedule','manageAutoDispatchConfig'].includes(meta?.name)) return 80;
  if (meta?.kind === 'function' && meta?.name === 'getAccountingData') return 80;
  if (meta?.kind === 'function' && ['getRoleWorkQueue','getFleetScheduleData','managePlannedShifts'].includes(meta?.name)) return 72;
  if (meta?.kind === 'function' && ['manageOfficerPerformanceReviews','managePerformanceReviews'].includes(meta?.name)) return 70;
  if (meta?.kind === 'function' && meta?.name === 'getMyPerformanceData') return 84;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyAnalyticsSegment') return 55;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyPerformanceData') return 50;
  if (meta?.kind === 'function' && ['getCompanyAnalyticsData','runSystemAudit'].includes(meta?.name)) return 20;
  // Give foreground page reads precedence over background scans.
  return 72;
};
const readTimeoutMs = meta => {
  if (meta?.kind === "function" && ["getAddressCallHistory", "getCallOutShifts", "getNavigationLocations", "getOfflineStreetArea"].includes(meta?.name)) return 30_000;
  if (meta?.kind === 'function' && meta?.name === 'getDispatchCallLinkFeed') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'getCompanyPerformanceData') return 60_000;
  if (meta?.kind === 'function' && meta?.name === 'manageLiveLocationPrivacy') return 30_000;
  // These authenticated snapshots intentionally serialize many source reads.
  // Do not abandon them at the 20-second limit used for individual entity calls.
  if (meta?.kind === 'function' && ['getWelcomeBriefingData', 'getRoleWorkQueue', 'manageHRTimeEntries', 'getMyScheduleData', 'getPTORequests', 'manageDutySupervisorSchedule'].includes(meta?.name)) return 30_000;
  if (meta?.kind === 'function' && ['getCompanyAnalyticsData','getCompanyAnalyticsSegment','getMyPerformanceData','getCompanyPerformanceData','getAccountingData','getTrainingUsers','getAdminOperationsBriefing'].includes(meta?.name)) return 30_000;
  return 12_000;
};
const requestLabel = meta => {
  if (!meta) return 'unknown';
  if (meta.kind === 'entity') return `Entity ${meta.name}.${meta.method}`;
  if (meta.kind === 'function') return `Function ${meta.name}${meta.action ? ` [${meta.action}]` : ''}`;
  if (meta.kind === 'auth') return `Auth ${meta.method}`;
  return meta.label || 'unknown';
};
const isRateLimit = error => Number(error?.response?.status || error?.status) === 429 || /rate limit|too many requests|\b429\b/i.test(errorText(error));
const stableKey = value => {
  try { return JSON.stringify(value, (_key, item) => typeof File !== 'undefined' && item instanceof File ? { name: item.name, size: item.size, type: item.type } : item); }
  catch { return String(value); }
};
const sharedRateLimitUntil = () => {
  try {
    const until = Number(localStorage.getItem(RATE_LIMIT_KEY) || 0);
    // Ignore malformed/future state left behind by an older browser session.
    return Number.isFinite(until) && until <= Date.now() + 24 * 60 * 60_000 ? until : 0;
  } catch { return 0; }
};
const noteRateLimit = error => {
  if (!isRateLimit(error)) return;
  recentRateLimitAt = Date.now();
  const headers = error?.response?.headers;
  const retryAfter = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  const seconds = Number(retryAfter);
  const retryAt = retryAfter != null && String(retryAfter).trim() !== ''
    ? (Number.isFinite(seconds) ? recentRateLimitAt + Math.max(0, seconds) * 1000 : Date.parse(retryAfter))
    : 0;
  const recoveryMs = Number.isFinite(retryAt) && retryAt > recentRateLimitAt
    ? retryAt - recentRateLimitAt
    : CRITICAL_RATE_LIMIT_RECOVERY_MS;
  readRecoveryUntil = Math.max(readRecoveryUntil, recentRateLimitAt + recoveryMs);
  // Concurrent failures belong to one recovery window, not a new minute each.
  if (sharedRateLimitUntil() > recentRateLimitAt) return;
  const until = Math.max(recentRateLimitAt + RATE_LIMIT_COOLDOWN_MS, retryAt || 0);
  try { localStorage.setItem(RATE_LIMIT_KEY, String(until)); } catch {}
};
const schedulePump = delay => {
  window.clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(pumpReads, Math.max(25, delay));
};
function pumpReads() {
  if (activeReads >= MAX_CONCURRENT_READS || !readQueue.length) return;
  // Authentication always goes first; aging prevents starvation of other screens.
  const score = job => job.priority + Math.floor((Date.now() - job.queuedAt) / 1000) * 2;
  readQueue.sort((a, b) => Number(b.meta?.kind === 'auth') - Number(a.meta?.kind === 'auth') || score(b) - score(a) || a.queuedAt - b.queuedAt);
  const cooldown = sharedRateLimitUntil() - Date.now();
  // All page reads recover after the same quiet window. Keeping ordinary reads
  // frozen for a full minute made every non-CAD screen appear empty. Background
  // telemetry still honors the longer cooldown in the function wrapper below.
  const cooldownStartedAt = sharedRateLimitUntil() - RATE_LIMIT_COOLDOWN_MS;
  const criticalRecovery = Math.max(0, readRecoveryUntil - Date.now(), cooldown > 0 ? CRITICAL_RATE_LIMIT_RECOVERY_MS - (Date.now() - cooldownStartedAt) : 0);
  const waitFor = job => Math.max(0, (job.readyAt || 0) - Date.now(),
    job.meta?.kind === 'auth' ? 0 : criticalRecovery,
    job.priority < 70 ? cooldown : 0);
  // A background cooldown never holds the head of the queue ahead of live CAD.
  readQueue.sort((a,b) => Number(waitFor(a) > 0) - Number(waitFor(b) > 0)
    || Number(b.meta?.kind === 'auth') - Number(a.meta?.kind === 'auth')
    || score(b) - score(a) || a.queuedAt - b.queuedAt);
  // Only defer requests while the backend requests a cooldown. Never synthesize
  // 429 errors for queued reads: the UI interprets them as *new* API throttles,
  // repeatedly failing every briefing/task query and retriggering recovery.
  // Authentication and already-cached data still resolve immediately.
  const recoveryPending = Math.max(0, readRecoveryUntil - Date.now(), cooldown);
  if (!readQueue.length) return;
  const waitForHead = waitFor(readQueue[0]);
  if (waitForHead > 0) {
    schedulePump(waitForHead + 25);
    return;
  }

  while (activeReads < MAX_CONCURRENT_READS && readQueue.length) {
    // Do not leave an idle slot while foreground pages wait for data.
    // Use both bounded slots when no critical read is waiting. Priority ordering
    // still starts auth and live operations first; rate-limit backoff is unchanged.
    // Never let two long company snapshots occupy both live-CAD read slots.
    if (activeAnalyticsReads) {
      const eligible = readQueue.findIndex(job => !isAnalyticsRead(job.meta) && waitFor(job) === 0);
      if (eligible < 0) break;
      if (eligible > 0) readQueue.unshift(readQueue.splice(eligible, 1)[0]);
    }
    const nextWait = waitFor(readQueue[0]);
    if (nextWait > 0) {
      schedulePump(nextWait + 25);
      break;
    }
    const spacingWait = nextReadStartAt - Date.now();
    if (spacingWait > 0) {
      schedulePump(spacingWait);
      break;
    }
    nextReadStartAt = Date.now() + READ_START_GAP_MS;
    const job = readQueue.shift();
    window.clearTimeout(job.queueTimer);
    job.markStarted();
    activeReads += 1;
    if (isAnalyticsRead(job.meta)) activeAnalyticsReads += 1;
    if (job.priority < 90) activeBackgroundReads += 1;
    const startedAt = Date.now();
    const cacheGeneration = readCacheVersion(job.key);
    Promise.resolve()
      .then(() => withRequestTimeout(Promise.resolve().then(job.task), readTimeoutMs(job.meta), 'Data request'))
      .then(value => {
        // Cache only reads that met their deadline and began after the last invalidation.
        // A late network completion must not repopulate a cache after a save/refresh.
        if (cacheGeneration === readCacheVersion(job.key)) {
          if (readCache.size >= 250 && !readCache.has(job.key)) readCache.delete(readCache.keys().next().value);
          readCache.set(job.key, { at: Date.now(), value });
        }
        recordRequestTrace({
          label: requestLabel(job.meta),
          kind: job.meta?.kind || 'read',
          mode: 'read',
          outcome: 'success',
          queue_ms: Math.max(0, startedAt - job.queuedAt),
          duration_ms: Date.now() - startedAt,
        });
        if (job.meta?.kind==='auth' && job.meta?.method==='me') rememberOfflineIdentity(value);
        const offlineOwner=offlineIdentity();
        const saveSnapshot=job.meta?.kind==='function'&&['getNavigationLocations','getMyScheduleData','getActiveDispatchCalls'].includes(job.meta?.name);
        if(offlineOwner&&saveSnapshot&&cacheGeneration===readCacheVersion(job.key)) {
          void offlinePut({key:offlineOwner.id+':snapshot:'+job.key,owner:offlineOwner.id,kind:'snapshot',updatedAt:Date.now(),data:{data:value?.data||value}}).catch(()=>{});
        }
        job.resolve(value);
      }, error => {
        const throttled = isRateLimit(error);
        noteRateLimit(error);
        recordRequestTrace({
          label: requestLabel(job.meta),
          kind: job.meta?.kind || 'read',
          mode: 'read',
          outcome: throttled ? 'rate_limit' : 'error',
          status: error?.response?.status || error?.status || null,
          queue_ms: Math.max(0, startedAt - job.queuedAt),
          duration_ms: Date.now() - startedAt,
          error: errorText(error).slice(0, 700),
        });
        const status = Number(error?.response?.status || error?.status || 0);
        const retryable = throttled || [502,503,504].includes(status) || /network error|failed to fetch/i.test(errorText(error));
        job.attempt = (job.attempt || 0) + 1;
        if (retryable && !throttled && job.attempt <= 1 && Date.now() - job.queuedAt < READ_QUEUE_TIMEOUT_MS - 30000) {
          job.readyAt = Date.now() + (throttled ? 1000 : 2000 * 2 ** job.attempt) + Math.random() * 3000;
          job.armQueueTimeout(READ_QUEUE_TIMEOUT_MS - (Date.now() - job.queuedAt));
          readQueue.push(job);
        } else job.reject(error);
      })
      .finally(() => {
        activeReads -= 1;
        if (isAnalyticsRead(job.meta)) activeAnalyticsReads -= 1;
        if (job.priority < 90) activeBackgroundReads -= 1;
        pumpReads();
      });
  }
}
function queuedRead(key, task, meta = {}) {
  if (navigator.onLine === false) {
    const owner=offlineIdentity();
    if(meta.kind==='auth'&&meta.method==='me'&&owner)return Promise.resolve(owner);
    if(!owner)return Promise.reject(new Error('Connect to sign in before using offline work.'));
    return offlineGet(owner.id+':snapshot:'+key).then(saved=>{
      if(!saved)throw new Error('This data has not been saved for offline use.');
      return saved.data;
    });
  }
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.at < readCacheTtl(meta)) {
    return Promise.resolve(cached.value);
  }
  if (readInflight.has(key)) {
    return readInflight.get(key);
  }
  let markStarted;
  const requestStarted = new Promise(resolve => { markStarted = resolve; });
  const request = new Promise((resolve, reject) => {
    const job = {
      markStarted,
      key,
      task,
      resolve,
      reject,
      meta,
      queuedAt: Date.now(),
    };
    const armQueueTimeout = delayMs => {
      window.clearTimeout(job.queueTimer);
      job.queueTimer = window.setTimeout(() => {
        const index = readQueue.indexOf(job);
        if (index < 0) return;
        // Keep the total wait bounded even if other requests renew a cooldown.
        readQueue.splice(index, 1);
        const throttleMs = Math.max(0, readRecoveryUntil - Date.now(), sharedRateLimitUntil() - Date.now());
        const error = new Error(throttleMs > 0
          ? `Base44 API is temporarily throttled. Retry after ${Math.ceil(throttleMs / 1000)} seconds.`
          : 'This data request could not start in time because the application is busy. Please retry.');
        if (throttleMs > 0) { error.status = 429; error.retry_after_ms = throttleMs; }
        recordRequestTrace({
          label: requestLabel(meta),
          kind: meta.kind || 'read',
          mode: 'read',
          outcome: 'queue_timeout',
          queue_ms: Date.now() - job.queuedAt,
          error: error.message,
        });
        reject(error);
      }, Math.max(5_000, delayMs));
    };
    job.armQueueTimeout = armQueueTimeout;
    job.priority = readPriority(meta);
    // Foreground requests remain bounded; throttle windows are detected and
    // surfaced explicitly by the pump, not mistaken for a queue deadlock.
    armQueueTimeout(READ_QUEUE_TIMEOUT_MS);
    const insertAt = readQueue.findIndex(queued => Number(queued.priority || 0) < job.priority);
    if (insertAt < 0) readQueue.push(job);
    else readQueue.splice(insertAt, 0, job);
    pumpReads();
  }).finally(() => readInflight.delete(key));
  // Page-level network timeouts start when the queue dispatches this request.
  Object.defineProperty(request, 'base44RequestStarted', { value: requestStarted });
  readInflight.set(key, request);
  return request;
}
function invalidateReadCacheForWrite(meta = {}) {
  const prefixes = new Set();
  const addEntity = name => prefixes.add(`entity:${name}:`);
  const addFunction = name => prefixes.add(`function:${name}:`);

  if (meta?.kind === 'entity' && meta?.name) {
    addEntity(meta.name);
    if (PERFORMANCE_ENTITY_NAMES.has(meta.name)) {
      addFunction('getCompanyAnalyticsData');
      addFunction('getCompanyAnalyticsSegment');
      addFunction('getMyPerformanceData'); addFunction('getCompanyPerformanceData');
    }
    if (meta.name === 'User') prefixes.add('auth:me:');
    if (['User','Location','Division','OfficerRoster'].includes(meta.name)) {
      addFunction('getAppDirectory');
      addFunction('getOfficerDirectory');
    }
    if (meta.name === 'TimeEntry') { addFunction('getMyTimeEntries'); addFunction('manageHRTimeEntries'); }
    if (meta.name === 'Location') addFunction('getNavigationLocations');
    if (['Schedule','PlannedShift','User','CallOut'].includes(meta.name)) { addFunction('getCallOutShifts'); addFunction('getMyScheduleData'); }
    if (meta.name === 'DispatchCall') addFunction('getActiveDispatchCalls');
    if (meta.name === 'ActiveOfficer') addFunction('getOnDutyUnits');
  }

  if (meta?.kind === 'auth' && meta?.method === 'updateMe') {
    prefixes.add('auth:me:');
    addEntity('User');
    addFunction('getAppDirectory');
    addFunction('getTrainingUsers');
  }

  if (meta?.kind === 'function') {
    const name = String(meta.name || '');
    if (name === 'recordSupervisorCallOut') { addFunction('getMyScheduleData'); addEntity('CallOut'); addEntity('Schedule'); }
    if (['logLocation','manageLiveLocationPrivacy','updateOfficerStatus','enforceOfficerDutyStatus','forceOfficerStatus','forceUserSignOut','updateMyFieldCallStatus'].includes(name)) {
      // Routine GPS/heartbeats are applied by the realtime location hub. Only
      // session/status transitions need a fresh canonical roster/directory read.
      if (name !== 'logLocation' || meta.locationTransition) {
        addEntity('ActiveOfficer'); addEntity('Unit'); addEntity('User'); addFunction('getOnDutyUnits');
      }
      if (name !== 'logLocation') prefixes.add('auth:me:');
    }
    if (['ingestGractivecalls','createDispatchCall','updateCadCallStatus','updateCadCallPriority','manageCadUnitAssignment'].includes(name)) {
      addEntity('DispatchCall'); addEntity('PropertyAlert'); addFunction('getActiveDispatchCalls');
    }
    if (name === 'getFleetScheduleData' || name === 'manageDutySupervisorSchedule') {
      addEntity(name === 'getFleetScheduleData' ? 'VehicleAssignment' : 'DutySupervisorAssignment');
      addFunction('getMyScheduleData');
      addFunction('getWelcomeBriefingData');
    }
    if (name === 'manageLocations') { addEntity('Location'); addFunction('getAppDirectory'); addFunction('getNavigationLocations'); }
    if (name === 'manageHRDivisions') { addEntity('Division'); addFunction('getAppDirectory'); }
    if (['updateUser','createPortalAccount','manageClientAssignments','manageOfficerCertifications','syncCertToOfficer'].includes(name)) {
      addEntity('User'); addFunction('getAppDirectory'); addFunction('getOfficerDirectory'); prefixes.add('auth:me:');
    }
    if (/schedule|plannedshift|callout|updateuser/i.test(name)) addFunction('getCallOutShifts');
    if (/performance|timeentr|schedule|report|complaint|commendation|feedback|training|callout|duty/i.test(name)) {
      addFunction('getCompanyAnalyticsData'); addFunction('getCompanyAnalyticsSegment'); addFunction('getMyPerformanceData'); addFunction('getCompanyPerformanceData');
    }
    // A management endpoint's cached list/get response must never survive its own write.
    addFunction(name);
  }

  if (!prefixes.size) return;
  for (const prefix of prefixes) invalidateReadPrefix(prefix);
  for (const cacheKey of [...readCache.keys()]) {
    if ([...prefixes].some(prefix => cacheKey.startsWith(prefix))) readCache.delete(cacheKey);
  }
}

function protectedWrite(key, task, meta = {}) {
  if(navigator.onLine===false)return Promise.reject(new Error('Offline: this action was not sent. Save a recovery draft or field note in Offline work.'));
  if (writeInflight.has(key)) {
    recordRequestTrace({ label: requestLabel(meta), kind: meta.kind || 'write', mode: 'write', outcome: 'deduped_inflight', duration_ms: 0 });
    return writeInflight.get(key);
  }
  activeWrites += 1;
  const startedAt = Date.now();
  const request = Promise.resolve()
    .then(task)
    .then(value => {
      invalidateReadCacheForWrite(meta);
      recordRequestTrace({
        label: requestLabel(meta),
        kind: meta.kind || 'write',
        mode: 'write',
        outcome: 'success',
        duration_ms: Date.now() - startedAt,
      });
      if (meta?.kind === 'entity' && PERFORMANCE_ENTITY_NAMES.has(meta?.name)) {
        try { window.dispatchEvent(new CustomEvent('bps-performance-refresh', { detail: { entity: meta.name, method: meta.method } })); } catch {}
      }
      // Every successful write announces its domain to the app. This is the
      // cross-page synchronization bridge used by management/reporting screens:
      // save in one tool, connected active views refresh immediately instead of
      // waiting for their staleTime window or a full browser reload.
      try {
        const detail = { ...meta, at: Date.now() };
        window.dispatchEvent(new CustomEvent('bps-data-changed', { detail }));
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('bps-pathfinder-data-sync');
          channel.postMessage(detail);
          channel.close();
        }
      } catch {}
      return value;
    })
    .catch(error => {
      const throttled = isRateLimit(error);
      noteRateLimit(error);
      recordRequestTrace({
        label: requestLabel(meta),
        kind: meta.kind || 'write',
        mode: 'write',
        outcome: throttled ? 'rate_limit' : 'error',
        status: error?.response?.status || error?.status || null,
        duration_ms: Date.now() - startedAt,
        error: errorText(error).slice(0, 700),
      });
      throw error;
    })
    .finally(() => {
      activeWrites -= 1;
      writeInflight.delete(key);
      pumpReads();
    });
  writeInflight.set(key, request);
  return request;
}
function invalidateReadCacheForRealtimeEntity(name) {
  const prefixes = new Set([`entity:${name}:`]);
  if (name === 'DispatchCall') {
    prefixes.add('function:getActiveDispatchCalls:');
    prefixes.add('function:getCallHistoryFeed:');
    prefixes.add('function:getDispatchCallLinkFeed:');
  }
  if (name === 'PropertyAlert') {
    prefixes.add('function:getCallHistoryFeed:');
    prefixes.add('function:getWelcomeBriefingData:');
  }
  if (name === 'TimeEntry') {
    prefixes.add('function:getMyTimeEntries:');
    prefixes.add('function:manageHRTimeEntries:');
  }
  if (name === 'Location') prefixes.add('function:getNavigationLocations:');
  if (['Schedule','PlannedShift','User','CallOut'].includes(name)) prefixes.add('function:getCallOutShifts:');
  if (name === 'CallHistory') prefixes.add('function:getCallHistoryFeed:');
  if (name === 'GeofenceAlert') prefixes.add('function:manageGeofenceAlerts:');
  if (['LocationHistory', 'GeofenceAlert', 'TimeEntry'].includes(name)) prefixes.add('function:getLocationAuditReport:');
  if (name === 'ActiveOfficer' || name === 'Unit') prefixes.add('function:getOnDutyUnits:');

  for (const prefix of prefixes) invalidateReadPrefix(prefix);
  for (const cacheKey of [...readCache.keys()]) {
    if ([...prefixes].some(prefix => String(cacheKey).startsWith(prefix))) readCache.delete(cacheKey);
  }
}

function wrappedEntity(name) {
  if (entityWrappers.has(name)) return entityWrappers.get(name);
  const entity = rawBase44.entities[name];
  const wrapper = new Proxy(entity, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (property === 'subscribe') {
        return (callback, ...args) => value.call(target, event => {
          invalidateReadCacheForRealtimeEntity(name);
          return typeof callback === 'function' ? callback(event) : undefined;
        }, ...args);
      }
      if (READ_METHODS.has(property)) {
        return (...args) => queuedRead(`entity:${name}:${String(property)}:${stableKey(args)}`, () => value.apply(target, args), { kind: 'entity', name, method: String(property) });
      }
      if (WRITE_METHODS.has(property)) {
        return (...args) => protectedWrite(`entity:${name}:${String(property)}:${stableKey(args)}`, () => value.apply(target, args), { kind: 'entity', name, method: String(property) });
      }
      return value.bind(target);
    },
  });
  entityWrappers.set(name, wrapper);
  return wrapper;
}
const entities = new Proxy(rawBase44.entities, {
  get(_target, name) {
    if (typeof name !== 'string') return rawBase44.entities[name];
    return wrappedEntity(name);
  },
});
const isReadOnlyFunction = (name, payload = {}) => {
  const functionName = String(name || '');
  const action = String(payload?.action || '').toLowerCase();
  const readActions = new Set(['list', 'get', 'search', 'status', 'messages', 'folders', 'preview', 'check', 'history', 'summary']);

  // An explicit action is authoritative. Management-style functions often expose
  // both reads and writes behind one endpoint (for example action=list/preview
  // versus action=update/delete). The old classifier treated every manage* list
  // as a write, which bypassed read throttling, cleared caches, and made opening a
  // page look like a mutation. That caused request bursts and stale/loading loops.
  if (action) return readActions.has(action);

  if (/^(get|list|search|fetch|load|check)/i.test(functionName)) return true;
  if (['runSystemAudit','geocodeNavigationDestination'].includes(functionName)) return true;
  return false;
};
const functions = new Proxy(rawBase44.functions, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (property !== 'invoke' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
    return (name, payload) => {
      const functionName = String(name);
      const key = `function:${functionName}:${stableKey(payload || {})}`;
      const task = () => value.call(target, name, payload);
      const meta = { kind: 'function', name: functionName, action: String(payload?.action || '').toLowerCase() || '',
        locationTransition: payload?.end_session === true || payload?.reset_gps === true || payload?.status_changed === true };

      // logLocation is background telemetry, not a user-initiated save. Once the
      // backend has throttled this browser, suppress additional GPS/heartbeat
      // writes for the shared cooldown instead of producing a chain of 429s.
      if (functionName === 'logLocation'
          && payload?.end_session !== true
          && payload?.force_publish !== true
          && Math.max(readRecoveryUntil, sharedRateLimitUntil() > Date.now()
            ? sharedRateLimitUntil() - RATE_LIMIT_COOLDOWN_MS + CRITICAL_RATE_LIMIT_RECOVERY_MS : 0) > Date.now()) {
        const retryAfter = Math.max(readRecoveryUntil, sharedRateLimitUntil() - RATE_LIMIT_COOLDOWN_MS + CRITICAL_RATE_LIMIT_RECOVERY_MS);
        recordRequestTrace({
          label: requestLabel(meta),
          kind: 'function',
          mode: 'write',
          outcome: 'cooldown_suppressed',
          duration_ms: 0,
        });
        return Promise.resolve({
          data: {
            success: true,
            suppressed: true,
            suppressed_reason: 'api_rate_limit_cooldown',
            retry_after: retryAfter,
          },
        });
      }

      return isReadOnlyFunction(name, payload) ? queuedRead(key, task, meta) : protectedWrite(key, task, meta);
    };
  },
});
const auth = new Proxy(rawBase44.auth, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== 'function') return value;
    if (property === 'logout') return (...args) => { forgetOfflineIdentity(); return value.apply(target,args); };
    if (property === 'me') return (...args) => queuedRead(`auth:me:${stableKey(args)}`, () => value.apply(target, args), { kind: 'auth', method: 'me' });
    if (property === 'updateMe') return (...args) => protectedWrite(`auth:updateMe:${stableKey(args)}`, () => value.apply(target, args), { kind: 'auth', method: 'updateMe' });
    return value.bind(target);
  },
});
export const base44 = new Proxy(rawBase44, {
  get(target, property, receiver) {
    if (property === 'entities') return entities;
    if (property === 'functions') return functions;
    if (property === 'auth') return auth;
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function clearBase44ReadCache() {
  invalidateReadPrefix('');
  readCache.clear();
}

export function clearBase44ReadCacheMatching(prefix) {
  const target = String(prefix || '');
  if (!target) return clearBase44ReadCache();
  invalidateReadPrefix(target);
  for (const key of [...readCache.keys()]) {
    if (String(key).startsWith(target)) readCache.delete(key);
  }
}

export function getBase44RequestHealth() {
  const until = sharedRateLimitUntil();
  return {
    queuedReads: readQueue.length,
    activeReads,
    activeWrites,
    rateLimitedUntil: until > Date.now() ? new Date(until).toISOString() : null,
    recentRateLimitAt: recentRateLimitAt ? new Date(recentRateLimitAt).toISOString() : null,
    readRetryAt: readRecoveryUntil > Date.now() ? new Date(readRecoveryUntil).toISOString() : null,
  };
}

export function getBase44RequestTrace() {
  return [...loadTrace()];
}

export function clearBase44RequestTrace() {
  saveTrace([]);
  flushTrace();
  try { window.dispatchEvent(new CustomEvent('bps-base44-request-trace-cleared')); } catch {}
}

export function getBase44RateLimitSummary(windowMs = 15 * 60_000) {
  const cutoff = windowMs ? Date.now() - windowMs : 0;
  const rows = loadTrace().filter(row => !cutoff || new Date(row.at || 0).getTime() >= cutoff);
  const byLabel = new Map();
  for (const row of rows) {
    const key = row.label || 'unknown';
    const current = byLabel.get(key) || { label: key, total: 0, rateLimits: 0, errors: 0, successes: 0, cacheHits: 0, lastAt: null };
    current.total += 1;
    if (row.outcome === 'rate_limit') current.rateLimits += 1;
    if (row.outcome === 'error' || row.outcome === 'queue_timeout') current.errors += 1;
    if (row.outcome === 'success') current.successes += 1;
    if (row.outcome === 'cache_hit' || row.outcome === 'deduped_inflight') current.cacheHits += 1;
    if (!current.lastAt || String(row.at) > String(current.lastAt)) current.lastAt = row.at;
    byLabel.set(key, current);
  }
  return [...byLabel.values()].sort((a, b) => (b.rateLimits - a.rateLimits) || (b.total - a.total));
}

// Browser-side AI is routed through the app's own backend function so legacy call
// sites cannot accidentally create a second external integration path.
if (base44.integrations?.Core?.InvokeLLM) {
  base44.integrations.Core.InvokeLLM = async payload => {
    const response = await base44.functions.invoke('internalAssistant', payload || {});
    const data = response?.data || response || {};
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

// Browser-side email is sent through the signed-in user's connected Microsoft
// Outlook mailbox. This preserves existing SendEmail call sites without consuming
// a separate Base44 email integration path.
if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = async payload => {
    const actor = await base44.auth.me();
    if (!actor?.id) throw new Error('A signed-in Pathfinder user is required to send Outlook email.');
    const { sendOutlookMail } = await import('@/lib/outlookGraph');
    const rawTo = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawCc = Array.isArray(payload?.cc) ? payload.cc : String(payload?.cc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    const rawBcc = Array.isArray(payload?.bcc) ? payload.bcc : String(payload?.bcc || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!rawTo.length) throw new Error('An email recipient is required.');
    const allRaw = [...rawTo, ...rawCc, ...rawBcc];
    const resolvedResponse = await base44.functions.invoke('resolveNotificationEmails', { emails: allRaw }).catch(() => null);
    const resolved = resolvedResponse?.data?.emails || resolvedResponse?.emails || allRaw;
    let cursor = 0;
    const to = resolved.slice(cursor, cursor += rawTo.length);
    const cc = resolved.slice(cursor, cursor += rawCc.length);
    const bcc = resolved.slice(cursor, cursor += rawBcc.length);
    await sendOutlookMail(actor.id, {
      to,
      cc,
      bcc,
      subject: String(payload?.subject || 'Black Point Notification'),
      body: String(payload?.body || payload?.html || ''),
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      mailboxEmail: String(payload?.mailboxEmail || payload?.from_mailbox || '').trim(),
    });
    return { success: true, delivered: 'microsoft_outlook', to, resolved_work_addresses: true };
  };
}
