import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { clearOfficerLocationSnapshotCache, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import { announceOwnLocationVisibility, readLastOwnLocationVisibility } from '@/lib/useOwnLocationVisibility';
import { withRequestTimeout } from '@/lib/requestTimeout';

const HIERS_USER_ID = '6a72bbee2842d6338cbae513';
const serverErrorText = error => {
  const data = error?.response?.data;
  if (error?.response?.status === 429 || /rate limit|too many requests/i.test(data?.error || error?.message || '')) return 'Rate limit reached. Try again in one minute.';
  return data?.error || error?.message || 'Unable to save visibility.';
};
const syncCurrentStatus = data => {
  if (data?.status) window.dispatchEvent(new CustomEvent('bps-officer-status-changed', {
    detail: { status: data.status, officer_id: data.officer_id, email: data.email, source: 'live-visibility', last_updated: data.last_updated },
  }));
};

export default function AdminLiveLocationPrivacy({ currentUser }) {
  const [setting, setSetting] = useState(() => readLastOwnLocationVisibility(currentUser?.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const settingRef = useRef(setting);
  const loadVersion = useRef(0);
  const lastLoad = useRef(0);
  const loadPending = useRef(false);
  const retryTimer = useRef(null);
  const rank = String(currentUser?.rank || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  const eligible = currentUser?.id === HIERS_USER_ID && currentUser?.role === 'admin' && rank === 'colonel';
  const applyConfirmed = useCallback((data, restore = false) => {
    if (typeof data?.hidden !== 'boolean') return;
    const confirmed = data.cleanup_pending === undefined && settingRef.current?.cleanup_pending && settingRef.current.hidden === data.hidden
      ? { ...data, cleanup_pending: true } : data;
    settingRef.current = confirmed;
    setSetting(confirmed);
    syncCurrentStatus(data);
    announceOwnLocationVisibility(currentUser.id, data.hidden, currentUser.email, restore && data.hidden === false);
  }, [currentUser?.id, currentUser?.email]);
  const refresh = useCallback(async (force = false) => {
    if (!eligible || saving.current || (loadPending.current && !force)) return;
    if (!force && Date.now() - lastLoad.current < 15000) return;
    const version = ++loadVersion.current;
    lastLoad.current = Date.now();
    loadPending.current = true;
    if (force) clearBase44ReadCacheMatching('function:manageLiveLocationPrivacy:');
    try {
      const { data } = await withRequestTimeout(base44.functions.invoke('manageLiveLocationPrivacy', { action: 'get' }), 12000, 'Visibility check');
      if (!data?.success) throw new Error(data?.error || 'Unable to load visibility.');
      if (version === loadVersion.current && !saving.current) applyConfirmed(data);
    } catch (err) {
      if (version === loadVersion.current) setError(serverErrorText(err));
    } finally {
      if (version === loadVersion.current) loadPending.current = false;
    }
  }, [eligible, applyConfirmed]);
  useEffect(() => {
    const previous = readLastOwnLocationVisibility(currentUser?.id);
    settingRef.current = previous;
    setSetting(previous);
    setError('');
    lastLoad.current = 0;
    loadPending.current = false;
    if (!eligible) return;
    refresh();
    const onFocus = () => refresh();
    const unsubscribe = subscribeOfficerLocationChanges(event => {
      const row = event?.data || event?.record;
      if (saving.current || String(row?.officer_email || '').toLowerCase() !== String(currentUser.email || '').toLowerCase()) return;
      // Ordinary GPS heartbeats do not change visibility and need no status read.
      // A differing flag is verified against the saved record before applying it.
      if (typeof row?.live_location_hidden === 'boolean' && row.live_location_hidden !== settingRef.current?.hidden) refresh(true);
    });
    window.addEventListener('focus', onFocus);
    return () => { ++loadVersion.current; clearTimeout(retryTimer.current); unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, [eligible, currentUser?.id, currentUser?.email, refresh]);

  const setHidden = async (hidden, retry = false) => {
    if (saving.current || (settingRef.current?.hidden === hidden && !settingRef.current?.cleanup_pending)) return;
    clearTimeout(retryTimer.current);
    saving.current = true;
    const version = ++loadVersion.current;
    loadPending.current = false;
    setBusy(true);
    setError('');
    let reconcile = false;
    try {
      const { data } = await withRequestTimeout(base44.functions.invoke('manageLiveLocationPrivacy', { action: 'set', hidden }), 20000, 'Visibility save');
      if (!data?.success || data.hidden !== hidden) throw new Error(data?.error || 'Unable to save visibility.');
      if (version !== loadVersion.current) return;
      applyConfirmed(data, !hidden);
      clearOfficerLocationSnapshotCache();
    } catch (err) {
      if (version !== loadVersion.current) return;
      const data = err?.response?.data;
      if (data?.visibility_saved === true && typeof data.hidden === 'boolean') {
        applyConfirmed(data, !hidden);
        clearOfficerLocationSnapshotCache();
        setError('Visibility saved. Additional location cleanup is delayed.');
        // One delayed, idempotent repair; a new user choice cancels this retry.
        if (!retry) retryTimer.current = setTimeout(() => {
          if (settingRef.current?.hidden === hidden && settingRef.current?.cleanup_pending) setHidden(hidden, true);
        }, Math.max(60000, Number(data.retry_after_ms) || 0));
      } else {
        setError(serverErrorText(err));
        reconcile = true;
      }
    } finally {
      saving.current = false;
      setBusy(false);
      // Never hold the buttons while this read waits in the shared API queue.
      if (reconcile) void refresh(true);
    }
  };
  if (!eligible) return null;
  return (
    <div className="relative z-10 flex-none border-b border-slate-800 bg-slate-900 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">Status: {setting ? (setting.hidden ? 'Hidden' : 'Visible') : error ? 'Unavailable' : 'Loading…'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setHidden(false)} disabled={busy || (setting?.hidden === false && !setting?.cleanup_pending)} aria-pressed={setting?.hidden === false}
            className="flex items-center gap-2 rounded-md border border-green-500/60 px-3 py-2 text-xs font-semibold text-green-300 disabled:opacity-50">
            <Eye className="h-4 w-4" />Turn sharing ON
          </button>
          <button type="button" onClick={() => setHidden(true)} disabled={busy || (setting?.hidden === true && !setting?.cleanup_pending)} aria-pressed={setting?.hidden === true}
            className="flex items-center gap-2 rounded-md border border-gold/50 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50">
            <EyeOff className="h-4 w-4" />Hide my live location
          </button>
          <button type="button" aria-label="Refresh location sharing setting" onClick={() => refresh(true)} disabled={busy} className="p-2 text-slate-300 disabled:opacity-50"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>
      {busy && <p role="status" className="mt-1 text-xs text-slate-300">Saving visibility…</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

