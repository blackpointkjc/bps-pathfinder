import { useEffect } from 'react';
import { requestCadLiveSync } from '@/lib/cadCallFeed';

// One app-wide guarded source poll, including when an officer is not on Dispatch Center.
// cadCallFeed shares a cross-tab cooldown/lock; the server has its own ingestion lease.
// PropertyAlert realtime remains responsible for speaking alerts exactly once.
export default function CadSourceSyncMonitor({ user }) {
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
      // Continue guarded best-effort checks in background browser tabs. A hidden
      // Dispatch Center must not intentionally stop all source updates. Mobile
      // operating systems may still suspend web pages; server scheduling is needed
      // for guaranteed unattended delivery.
      if (!active || running || !navigator.onLine) return;
      running = true;
      try {
        const result = await requestCadLiveSync();
        if (active && result?.success && !result?.skipped) {
          window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished', { detail: result }));
        }
      } catch (error) {
        console.warn('[CAD] Guarded one-minute feed sync failed:', error?.message || error);
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(sync, 2200);
    const timer = window.setInterval(sync, 60_000);
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
  }, [user?.email, user?.role, user?.employment_status]);
  return null;
}
