import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useOfflineMode } from '@/lib/offlineMode';

/* Offline mode engages by itself when the device loses its connection. There is
   nothing to switch on: this chip only reports the state the app is already in. */
export default function OfflineIndicator() {
  const offline = useOfflineMode();
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!offline) return;
    setRestored(false);
  }, [offline]);

  useEffect(() => {
    if (offline) return undefined;
    setRestored(true);
    const timer = setTimeout(() => setRestored(false), 4000);
    return () => clearTimeout(timer);
  }, [offline]);

  if (offline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/60 bg-slate-950/95 px-3 py-1.5 text-[11px] font-bold text-amber-200 shadow-lg"
      >
        <WifiOff className="h-3.5 w-3.5" />
        Offline mode · saved pages and street maps
      </div>
    );
  }

  if (!restored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-2 z-[80] -translate-x-1/2 rounded-full border border-emerald-400/60 bg-slate-950/95 px-3 py-1.5 text-[11px] font-bold text-emerald-200 shadow-lg"
    >
      Back online · syncing
    </div>
  );
}