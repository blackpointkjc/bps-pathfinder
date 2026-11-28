import {getBase44RequestHealth} from '@/api/base44Client';
import { useEffect } from 'react';
import {cadSourceNeedsPoll,getCadSourceSnapshot} from '@/lib/cadSourceHealth';
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
      && !user.disabled&&!user.termination_date&&user.portal_approved!==false&&!['client', 'student', 'pending','visitor'].includes(role)
      && !['client', 'student', 'pending'].includes(type)
      && !roles.has('client') && !roles.has('student') && !roles.has('pending')&&!roles.has('visitor');
    if (!internal) return undefined;
    let active = true;
    let running = false;
    let lastSyncAttemptAt = 0;
    let lastResumeAt = 0;
    const sync = async () => {
      // Continue a conservative best-effort sync while minimized. Browsers may
      // suspend an entire hidden tab, so server scheduling still owns 24/7 work.
      if (!active || running || !navigator.onLine) return;
      const minimumInterval = 60_000;
      const health=getBase44RequestHealth();
      if(Date.parse(health.criticalRetryAt||'')>Date.now())return;
      const source=getCadSourceSnapshot();
      // On startup let the scheduled feed and initial CAD read establish their
      // heartbeat before trying a rescue ingestion. No competing startup scan.
      if(source&&/^success/.test(source.poll_status||'')&&Date.now()-Date.parse(source.poll_at||'')<95000)return;
      if(!cadSourceNeedsPoll(source))return;
      if (Date.now() - lastSyncAttemptAt < minimumInterval) return;
      // The CAD source has an independent backoff and a server lease.
      // An unrelated background 429 must NEVER postpone checking GRAC;
      // its cooldown is intentionally enforced inside requestCadLiveSync.
      lastSyncAttemptAt = Date.now();
      running = true;
      try {
        const result = await requestCadLiveSync();
        // Real-time entity subscriptions already paint every new/updated call.
        // A no-change source heartbeat must not trigger another full CAD read.
        const changed=['created','updated','removed','property_alerts_created']
          .some(field=>Number(result?.[field]||0)>0);
        if (active && result?.success && !result?.skipped && changed) {
          window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished', { detail: result }));
        }
      } catch (error) {
        console.warn('[CAD] Guarded live-source sync failed:', error?.message || error);
      } finally {
        running = false;
      }
    };
    // A bounded watchdog refreshes active CAD sources promptly while the
    // server lease and cross-tab throttles prevent duplicate ingestion.
    // On returning from a suspended tab, recover promptly rather than waiting
    // for the next scheduled interval.
    const first = window.setTimeout(sync, 20000);
    const timer = window.setInterval(sync, 30_000);
    const resume = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      if (Date.now() - lastResumeAt < 5_000) return;
      lastResumeAt = Date.now();
      // Returning focus does not reset the throttle or start a second ingestion.
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
  }, [user?.email, user?.role, user?.employment_status]);
  return null;
}
