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
      const quietUntil = until ? until - 45_000 : 0;
      setStatus(until || failed.length >= 2 ? { rateLimited: until > Date.now(), failed: failed.length } : null);
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
  return <div role="status" className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-slate-950 p-4 text-sm text-amber-100 shadow-xl">
    <div><div className="font-bold">Data connection interrupted</div><div className="mt-1 text-xs">{status.rateLimited ? 'The API is rate-limited. Data will retry after the recovery pause.' : 'Some data could not load. Failed screens are retrying automatically.'}</div></div>
    <button type="button" onClick={retry} className="rounded-md border border-amber-500/60 px-3 py-2 font-bold">Retry data</button>
  </div>;
}
