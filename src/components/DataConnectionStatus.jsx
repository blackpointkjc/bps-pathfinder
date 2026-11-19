import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getBase44RequestHealth } from '@/api/base44Client';

// Observe the existing request/query state; this monitor makes no API reads.
export default function DataConnectionStatus() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let stopped = false;
    const inspect = () => {
      if (stopped) return;
      const health = getBase44RequestHealth();
      const now=Date.now();
      const until=health.rateLimitedUntil?Date.parse(health.rateLimitedUntil):0;
      const retry=health.readRetryAt?Date.parse(health.readRetryAt):0;
      const recentThrottle=health.recentRateLimitAt?Date.parse(health.recentRateLimitAt):0;
      const throttled=Math.max(until,retry)>now;
      const queueAge=Number(health.oldestQueuedReadMs||0);
      // Transient 429s are already handled by the request scheduler. A global
      // banner for ordinary recovered query errors is misleading, especially
      // when CAD and the rest of the app are still processing fresh data.
      // Show only an unresolved queue blockage or multiple *current* failures
      // while the provider is actively rejecting requests.
      const failed=queryClient.getQueryCache().getAll().filter(query =>
        query.isActive() && query.state.status==='error'
        && now-Number(query.state.errorUpdatedAt||0)<30_000
        && (!query.state.dataUpdatedAt || query.state.dataUpdatedAt<query.state.errorUpdatedAt));
      const waiting=health.queuedReads>0 && queueAge>=60_000;
      const liveThrottle=throttled && recentThrottle>0 && now-recentThrottle<45_000;
      const persistent=waiting || (liveThrottle && failed.length>=3);
      setStatus(persistent ? {rateLimited:throttled,failed:failed.length,waiting,queue:health.queuedReads} : null);
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
  return <div role="status" aria-live="polite" className="fixed bottom-2 right-2 z-[70] flex max-w-xs flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-slate-950/95 p-2 text-xs text-amber-100 shadow-sm">
    <div><div className="font-bold">{status.waiting ? 'Data is taking longer than expected' : 'Some data is reconnecting'}</div><div className="mt-1 text-[11px]">{status.rateLimited ? 'The server is limiting requests. Pathfinder will retry when it is ready.' : status.waiting ? `${status.queue} request${status.queue === 1 ? '' : 's'} awaiting the data service. You can retry when the queue clears.` : 'Some data could not load. Open the affected screen or retry once the service recovers.'}</div></div>
    <span className="rounded-md border border-amber-600/40 px-2 py-1 text-[10px] font-semibold text-amber-200">Automatic recovery</span>
  </div>;
}
