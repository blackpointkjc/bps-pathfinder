import { useEffect, useState } from 'react';

const REFRESH_DEFER_MS = 20_000;
const UPDATE_CHECK_MS = 45_000;
const refreshUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('_pathfinder_refresh', String(Date.now()));
  window.location.replace(url.toString());
};

// An automatic document reload must not discard an officer's active navigation,
// an unfinished incident report or typed form data. Resume automatically as
// soon as the user returns to a safe screen.
function reloadSafe() {
  if (document.visibilityState !== 'visible' || navigator.onLine === false) return false;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  const path = String(window.location.pathname || '').toLowerCase();
  if (/navigation|incidentreport|dailyactivityreport|shiftreport|professionalstandards|investigation|trainingexam|assessment|examination|corporatebrowser/.test(path)) return false;
  const focused = document.activeElement;
  if (focused?.matches?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return false;
  // Pages with an open unsaved draft can explicitly mark the active editor.
  if (document.querySelector('[data-unsaved-changes="true"], [data-pathfinder-update-block="true"]')) return false;
  return true;
}

export default function PublishedUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deferred, setDeferred] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !import.meta.env.VITE_PATHFINDER_BUILD_ID) return;
    let stopped = false, pending = false, controller, updateSince = 0, reloadStarted = false;
    const check = async () => {
      if (stopped || pending || navigator.onLine === false) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/pathfinder-version.json?v=' + Date.now(), {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) return;
        const release = await response.json();
        if (stopped) return;
        const changed = release?.app === 'pathfinder' && typeof release.buildId === 'string'
          && release.buildId.length > 0 && release.buildId !== import.meta.env.VITE_PATHFINDER_BUILD_ID;
        if (changed) { if (!updateSince) updateSince = Date.now(); setAvailable(true); }
        else { updateSince = 0; setAvailable(false); setDeferred(false); }
      } catch { /* Offline and failed checks are not evidence of a new release. */ }
      finally { clearTimeout(timeout); pending = false; }
    };
    const apply = () => {
      if (stopped || !updateSince || reloadStarted || Date.now()-updateSince < REFRESH_DEFER_MS) return;
      if (!reloadSafe()) { setDeferred(true); return; }
      reloadStarted = true;
      setRefreshing(true);
      refreshUrl();
    };
    const first = setTimeout(check, 12000);
    const polling = setInterval(check, UPDATE_CHECK_MS);
    const applying = setInterval(apply, 3000);
    const onResume = () => { void check(); apply(); };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      stopped = true; controller?.abort();
      clearTimeout(first); clearInterval(polling); clearInterval(applying);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, []);
  if (!available) return null;
  return <aside role="status" aria-live="polite" className="fixed inset-x-3 bottom-4 z-[100200] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-700/70 bg-[#0c1720] px-4 py-3 text-white shadow-2xl">
    <div><strong className="block text-sm">{refreshing ? 'Updating Pathfinder…' : 'New Pathfinder update detected'}</strong><p className="text-xs text-slate-300">{deferred ? 'Update will load automatically when you finish your current work or leave navigation.' : 'The latest changes will load automatically when it is safe.'}</p></div>
  </aside>;
}
