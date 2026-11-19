import { useEffect, useRef } from 'react';
import { base44, getBase44RequestHealth } from '@/api/base44Client';
import { runClientFunctionalAudit } from '@/utils/appDiagnostics';

const ONE_HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DEFER_MS = 3 * 60 * 1000;
const SCAN_ATTEMPT_KEY='bps:hourly-scan-attempt-v1';
const SCAN_BACKOFF_MS=30*60*1000;
const lastAttempt=()=>{try{return Number(localStorage.getItem(SCAN_ATTEMPT_KEY)||0)||0;}catch{return 0;}};
const saveAttempt=()=>{try{localStorage.setItem(SCAN_ATTEMPT_KEY,String(Date.now()));}catch{}};

function combineAudits(serverAudit, clientAudit) {
  const findingMap = new Map();
  for (const item of [...(clientAudit.findings || []), ...(serverAudit.findings || [])]) {
    const key = item.key || `${item.area}|${item.title}`;
    if (!findingMap.has(key)) findingMap.set(key, item);
  }
  const findings = [...findingMap.values()];
  return {
    ...serverAudit,
    findings,
    client_summary: clientAudit.summary,
    incomplete_areas: clientAudit.incomplete_areas || [],
    summary: {
      ...(serverAudit.summary || {}),
      areas_checked: (serverAudit.summary?.areas_checked || 0) + 5,
      issues_found: findings.length,
      outages: findings.filter(item => item.severity === 'outage').length,
      degraded: findings.filter(item => item.severity === 'degraded').length,
      maintenance: findings.filter(item => item.severity === 'maintenance').length,
    },
    duration_ms: Math.max(serverAudit.duration_ms || 0, clientAudit.duration_ms || 0),
    scanned_at: new Date().toISOString(),
  };
}

export default function AdminHourlySystemScan({ user }) {
  const runningRef = useRef(false);
  const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';

  useEffect(() => {
    if (!isAdmin || !user?.id) return undefined;
    let active = true;

    const runIfDue = async () => {
      if (!active || runningRef.current || document.hidden || Date.now()-lastAttempt()<SCAN_BACKOFF_MS) return;
      const requestHealth = getBase44RequestHealth();
      const recentLimitAt = requestHealth.recentRateLimitAt ? new Date(requestHealth.recentRateLimitAt).getTime() : 0;
      const recentlyThrottled = Number.isFinite(recentLimitAt) && recentLimitAt > 0 && Date.now() - recentLimitAt < 10 * 60 * 1000;
      if (requestHealth.rateLimitedUntil || recentlyThrottled || requestHealth.activeWrites > 0 || requestHealth.activeReads > 0 || requestHealth.queuedReads > 0) return;
      runningRef.current = true;
      try {
        const execute = async () => {
          // Recheck after acquiring the cross-tab lock. Previously every open admin
          // tab checked first, queued for the lock, and then each ran a full audit.
          const latest = await base44.entities.SystemScanRun.list('-scanned_at', 1).catch(() => []);
          const lastScanAt = new Date(latest?.[0]?.scanned_at || 0).getTime();
          if (Number.isFinite(lastScanAt) && Date.now() - lastScanAt < ONE_HOUR_MS) return;

          // Record one cross-tab attempt before running a long 19-dataset audit.
          // Failed/throttled checks must not immediately retry from another tab.
          saveAttempt();
          // Run server and browser audits sequentially to preserve CAD capacity.
          const serverResponse = await base44.functions.invoke('runSystemAudit', {});
          const serverAudit = serverResponse?.data || serverResponse || {};
          if (serverAudit.error || serverAudit.scan_incomplete) {
            // An incomplete scan is not an all-clear and should not publish an
            // empty issue list. Try again during a quieter future window.
            console.warn('Hourly audit deferred after incomplete server scan:',serverAudit.error||serverAudit.status);
            return;
          }
          const clientAudit = await runClientFunctionalAudit({ includeFunctionalProbes: false });
          const audit = combineAudits(serverAudit, clientAudit);
          const publishResponse = await base44.functions.invoke('publishSystemScan', { audit });
          const published = publishResponse?.data || publishResponse || {};
          if (published.error) throw new Error(published.error);
          window.dispatchEvent(new CustomEvent('bps-system-scan-complete', { detail: audit }));
        };

        if (navigator?.locks?.request) {
          await navigator.locks.request('bps-hourly-full-app-scan', execute);
        } else {
          await execute();
        }
      } catch (error) {
        console.error('Hourly full application scan failed:', error?.response?.data?.error || error?.message || error);
      } finally {
        runningRef.current = false;
      }
    };

    // Do not launch a full application audit during the login/command startup
    // burst. CAD, live location, directory, and the user's active workspace must
    // get the request budget first. The scan is still hourly, just deferred until
    // the app has been usable for a short period.
    const startupTimer = window.setTimeout(runIfDue, STARTUP_DEFER_MS);
    const interval = window.setInterval(runIfDue, CHECK_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) runIfDue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAdmin, user?.id]);

  return null;
}
