import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearBase44ReadCache, getBase44RequestHealth } from '@/api/base44Client';

// Observe the existing request/query state; this monitor makes no API reads.
export default function DataConnectionStatus() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let stopped = false;
    const inspect = () => {
      if (stopped) return;
      const health = getBase44RequestHealth();
      const failed = queryClient.getQueryCache().getAll().filter(query => query.isActive() && query.state.status === 'error');
      const until = health.rateLimitedUntil ? Date.parse(health.rateLimitedUntil) : 0;
      const quietUntil = Math.max(health.readRetryAt ? Date.parse(health.readRetryAt) : 0, until);
      // A queued backend read can stall outside React Query. Show a warning
      // for sustained queues but never trigger background retries here.
      const waiting = Number(health.oldestQueuedReadMs || 0) >= 35_000;
      const throttled = until > Date.now() || quietUntil > Date.now();
      setStatus(failed.length >= 2 || waiting
        ? { rateLimited: throttled, failed: failed.length, waiting, queue: health.queuedReads }
        : null);
      // Do not automatically refetch every failing active query in parallel.
      // That turns a single 429 into another rate-limit storm. Individual
      // query owners retry on their own schedule; this banner is read-only.
    };
    const timer = window.setInterval(inspect, 5_000);
    window.addEventListener('online', inspect);
    inspect();
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', inspect); };
  }, [queryClient]);
  if (!status) return null;
  const retry = () => {
    const health = getBase44RequestHealth();
    if (health.rateLimitedUntil || health.readRetryAt) return;
    clearBase44ReadCache();
    void queryClient.refetchQueries({ type: 'active', predicate: query => query.state.status === 'error' }).catch(() => {});
    window.dispatchEvent(new CustomEvent('bps-operational-resume'));
  };
  return <div role="status" aria-live="polite" className="fixed bottom-2 right-2 z-[70] flex max-w-xs flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-slate-950/95 p-2 text-xs text-amber-100 shadow-sm">
    <div><div className="font-bold">{status.waiting ? 'Data is taking longer than expected' : 'Some data is reconnecting'}</div><div className="mt-1 text-[11px]">{status.rateLimited ? 'The server is limiting requests. Pathfinder will retry when it is ready.' : status.waiting ? `${status.queue} request${status.queue === 1 ? '' : 's'} awaiting the data service. You can retry when the queue clears.` : 'Some data could not load. Open the affected screen or retry once the service recovers.'}</div></div>
    <button type="button" onClick={retry} disabled={status.rateLimited} className="min-h-10 rounded-md border border-amber-500/60 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50">Retry data</button>
  </div>;
}
