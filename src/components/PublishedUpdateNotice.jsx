import { useEffect, useState } from 'react';

export default function PublishedUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !import.meta.env.VITE_PATHFINDER_BUILD_ID) return;
    let stopped = false;
    let pending = false;
    let controller;
    const check = async () => {
      if (stopped || pending || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/pathfinder-version.json?v=' + Date.now(), {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
        const release = await response.json();
        if (!stopped) setAvailable(release?.app === 'pathfinder' && typeof release.buildId === 'string' && release.buildId.length > 0 && release.buildId !== import.meta.env.VITE_PATHFINDER_BUILD_ID);
      } catch { /* Network failures are not releases. */ }
      finally { clearTimeout(timeout); pending = false; }
    };
    const first = setTimeout(check, 15000);
    const interval = setInterval(check, 60000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true; controller?.abort();
      clearTimeout(first); clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  if (!available) return null;
  const refresh = () => {
    setRefreshing(true);
    const url = new URL(window.location.href);
    url.searchParams.set('_pathfinder_refresh', String(Date.now()));
    window.location.replace(url.toString());
  };
  return <aside role="status" aria-live="polite" className="fixed inset-x-3 top-3 z-[100200] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400 bg-slate-950 px-4 py-3 text-white shadow-2xl" style={{ top: 'max(12px, env(safe-area-inset-top))' }}>
    <div><strong className="block text-sm">Please refresh</strong><p className="text-xs text-slate-300">A new Pathfinder update has been published. Save your work, then refresh.</p></div>
    <button type="button" disabled={refreshing} onClick={refresh} className="min-h-10 rounded-lg bg-cyan-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-60">{refreshing ? 'Refreshing…' : 'Refresh now'}</button>
  </aside>;
}
