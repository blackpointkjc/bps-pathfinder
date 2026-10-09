import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearBase44ReadCache, getBase44RequestHealth } from '@/api/base44Client';

// Observe the existing request/query state; this monitor makes no API reads.
export default function DataConnectionStatus() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let lastRetryAt = 0;
    let stopped = false;
    const inspect = () => {
      if (stopped) return;
      const health = getBase44RequestHealth();
      const failed = queryClient.getQueryCache().getAll().filter(query => query.isActive() && query.state.status === 'error');
      const until = health.rateLimitedUntil ? Date.parse(health.rateLimitedUntil) : 0;
      const quietUntil = Math.max(health.readRetryAt ? Date.parse(health.readRetryAt) : 0, until ? until - 45_000 : 0);
      // A previously observed 429 is not itself proof that the active page is broken.
      // Warn only when at least two visible queries are actually failing.
      setStatus(failed.length >= 2 ? { rateLimited: until > Date.now(), failed: failed.length } : null);
      // Recover only failed active reads, once per 30 seconds. Successful queries,
      // mutations, and in-progress forms are left alone.
      if (failed.length && Date.now() >= quietUntil && Date.now() - lastRetryAt >= 30_000 && navigator.onLine) {
        lastRetryAt = Date.now();
        void queryClient.refetchQueries({ type: 'active', predicate: query => query.state.status === 'error' }).catch(() => {});
      }
    };
    const timer = window.setInterval(inspect, 5_000);
    window.addEventListener('online', inspect);
    inspect();
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', inspect); };
  }, [queryClient]);
  if (!status) return null;
  const retry = () => {
    clearBase44ReadCache();
    void queryClient.refetchQueries({ type: 'active', predicate: query => query.state.status === 'error' }).catch(() => {});
    window.dispatchEvent(new CustomEvent('bps-operational-resume'));
  };
  return <div role="status" aria-live="polite" className="fixed bottom-2 right-2 z-[70] flex max-w-xs flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-slate-950/95 p-2 text-xs text-amber-100 shadow-sm">
    <div><div className="font-bold">Some data is reconnecting</div><div className="mt-1 text-[11px]">{status.rateLimited ? 'The API is rate-limited. Data will retry after the recovery pause.' : 'Some data could not load. Failed screens are retrying automatically.'}</div></div>
    <button type="button" onClick={retry} className="rounded-md border border-amber-500/60 px-3 py-2 font-bold">Retry data</button>
  </div>;
}
