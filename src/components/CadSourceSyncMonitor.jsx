import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { requestCadLiveSync } from '@/lib/cadCallFeed';
import { getBase44RequestHealth } from '@/api/base44Client';

// One app-wide guarded source poll, including when an officer is not on Dispatch Center.
// cadCallFeed shares a cross-tab cooldown/lock; the server has its own ingestion lease.
// PropertyAlert realtime remains responsible for speaking alerts exactly once.
export default function CadSourceSyncMonitor({ user }) {
  const location=useLocation();
  useEffect(() => {
    const role = String(user?.role || '').toLowerCase();
    const roles = new Set((user?.additional_roles || []).map(value => String(value).toLowerCase()));
    const type = String(user?.user_type || user?.account_type || '').toLowerCase();
    const internal = user?.email && user?.employment_status !== 'terminated'
      && !['client', 'student', 'pending'].includes(role)
      && !['client', 'student', 'pending'].includes(type)
      && !roles.has('client') && !roles.has('student') && !roles.has('pending');
    if (!internal) return undefined;
    let active = true;
    let running = false;
    let lastSyncAttemptAt = 0;
    let lastResumeAt = 0;
    const sync = async () => {
      // Continue a conservative best-effort sync while minimized. Browsers may
      // suspend an entire hidden tab, so server scheduling still owns 24/7 work.
      if (!active || running || !navigator.onLine) return;
      const page = window.location.pathname + window.location.search;
      const onCommandScreen = /Navigation|CADCenter|DispatchCenter|CommandDashboard|OfficerCAD|SupervisorCenter|SupervisorOverview|SupervisorCommandBoard|SupervisorFieldOversight|admin_center=(cad|supervisor)/i.test(page);
      const minimumInterval = document.visibilityState === 'visible' && onCommandScreen ? 90_000 : 300_000;
      if (Date.now() - lastSyncAttemptAt < minimumInterval) return;
      const health=getBase44RequestHealth();
      const cooldown=Math.max(Date.parse(health.readRetryAt||'')||0,Date.parse(health.rateLimitedUntil||'')||0);
      if(Date.now()<cooldown || Number(health.queuedReads||0)>=5)return;
      lastSyncAttemptAt = Date.now();
      running = true;
      try {
        const result = await requestCadLiveSync();
        if (active && result?.success && !result?.skipped) {
          window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished', { detail: result }));
        }
      } catch (error) {
        console.warn('[CAD] Guarded live-source sync failed:', error?.message || error);
      } finally {
        running = false;
      }
    };
    // Use a slow watchdog with strict per-session and cross-tab throttles.
    // On returning from a suspended tab, recover promptly rather than waiting
    // for the next scheduled interval.
    const first = window.setTimeout(sync, 12_000);
    const timer = window.setInterval(sync, 60_000);
    const resume = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      if (Date.now() - lastResumeAt < 15_000) return;
      lastResumeAt = Date.now();
      lastSyncAttemptAt = 0;
      void sync();
    };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('bps-operational-resume', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('bps-operational-resume', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [user?.email, user?.role, user?.employment_status, location.pathname, location.search]);
  return null;
}
