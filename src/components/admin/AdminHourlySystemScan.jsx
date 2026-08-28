import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { runClientFunctionalAudit } from '@/utils/appDiagnostics';

const ONE_HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

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
      if (!active || runningRef.current || document.hidden) return;
      runningRef.current = true;
      try {
        const latest = await base44.entities.SystemScanRun.list('-scanned_at', 1).catch(() => []);
        const lastScanAt = new Date(latest?.[0]?.scanned_at || 0).getTime();
        if (Number.isFinite(lastScanAt) && Date.now() - lastScanAt < ONE_HOUR_MS) return;

        const execute = async () => {
          // Run the server and browser audits sequentially so the hourly scan does
          // not compete with itself for the same Base44 request allowance.
          const serverResponse = await base44.functions.invoke('runSystemAudit', {});
          const serverAudit = serverResponse?.data || serverResponse || {};
          const clientAudit = await runClientFunctionalAudit();
          if (serverAudit.error) throw new Error(serverAudit.error);
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

    runIfDue();
    const interval = window.setInterval(runIfDue, CHECK_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) runIfDue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAdmin, user?.id]);

  return null;
}
