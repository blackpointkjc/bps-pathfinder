import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { syncWork } from '@/lib/offlineWork';
import { toast } from '@/components/ui/use-toast';
import { queryClientInstance } from '@/lib/query-client';

// Keeps returning offline work to the app on its own: the moment the device is
// back online, when the tab becomes visible, and on a steady background beat.
// No button is ever required; anything that fails stays queued for the next run.
export default function OfflineAutoSync({ user }) {
  const owner = user?.id;

  useEffect(() => {
    if (!owner) return undefined;
    let running = false;

    const run = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const result = await syncWork(base44, owner);
        if (result?.synced) {
          queryClientInstance.invalidateQueries({
            predicate: query => /offlinesync|offline|report|shift/i.test(JSON.stringify(query.queryKey || [])),
          });
          window.dispatchEvent(new CustomEvent('bps-data-changed', {
            detail: { kind: 'function', name: 'syncOfflineWork', at: Date.now() },
          }));
          toast({
            title: 'Offline work synced',
            description: `${result.synced} item(s) saved while offline were returned to the app.`,
          });
        }
      } catch {
        // Connection is not ready yet; the next automatic run retries.
      } finally {
        running = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    const queue = () => window.setTimeout(run, 1200);
    const boot = window.setTimeout(run, 2000);
    const timer = window.setInterval(run, 45000);

    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    window.addEventListener('bps-offline-work-changed', queue);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
      window.removeEventListener('online', run);
      window.removeEventListener('focus', run);
      window.removeEventListener('bps-offline-work-changed', queue);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [owner]);

  return null;
}