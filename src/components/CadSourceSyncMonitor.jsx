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
    const sync = async () => {
      // Poll visible command screens only. The backend scheduler remains responsible
      // for unattended ingestion; browser checks supplement it while in use.
      if (!active || running || !navigator.onLine || document.visibilityState !== 'visible') return;
      const health=getBase44RequestHealth();
      const cooldown=Math.max(Date.parse(health.readRetryAt||'')||0,Date.parse(health.rateLimitedUntil||'')||0);
      if(Date.now()<cooldown || Number(health.queuedReads||0)>=5)return;
      const page = window.location.pathname + window.location.search;
      if (!/Navigation|CADCenter|DispatchCenter|CommandDashboard|OfficerCAD|SupervisorCenter|SupervisorOverview|SupervisorCommandBoard|SupervisorFieldOversight|admin_center=(cad|supervisor)/i.test(page)) return;
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
    // Let the signed-in page load before beginning expensive source ingestion.
    const first = window.setTimeout(sync, 12_000);
    // Upstream ingestion is expensive and already protected by a server-side
    // scheduled workflow. A 90s foreground fallback plus realtime CAD events
    // avoids four source polls per minute on every signed-in command session.
    const timer = window.setInterval(sync, 90_000);
    const resume = () => { if (navigator.onLine) void sync(); };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [user?.email, user?.role, user?.employment_status, location.pathname, location.search]);
  return null;
}
