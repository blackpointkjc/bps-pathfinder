import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { clearOfficerLocationSnapshotCache, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';

import { announceOwnLocationVisibility } from '@/lib/useOwnLocationVisibility';
const HIERS_USER_ID = '6a72bbee2842d6338cbae513';
const serverErrorText = error => {
  const data = error?.response?.data;
  return data?.error ? `${data.error}${data.stage ? ` (${data.stage})` : ''}` : error?.message || 'Unable to save visibility.';
};
const syncCurrentStatus = data => {
  if (data?.status) window.dispatchEvent(new CustomEvent('bps-officer-status-changed', {
    detail: { status: data.status, officer_id: data.officer_id, email: data.email, source: 'live-visibility', last_updated: data.last_updated },
  }));
};

export default function AdminLiveLocationPrivacy({ currentUser }) {
  const [setting, setSetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const loadVersion = useRef(0);
  const rank = String(currentUser?.rank || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  const eligible = currentUser?.id === HIERS_USER_ID && currentUser?.role === 'admin' && rank === 'colonel';
  const refresh = useCallback(async () => {
    if (!eligible || saving.current) return;
    const version = ++loadVersion.current;
    clearBase44ReadCacheMatching('function:manageLiveLocationPrivacy:');
    try {
      const { data } = await base44.functions.invoke('manageLiveLocationPrivacy', { action: 'get' });
      if (!data?.success) throw new Error(data?.error || 'Unable to load visibility.');
      if (version === loadVersion.current && !saving.current) { setSetting(data); syncCurrentStatus(data); announceOwnLocationVisibility(currentUser.id, data.hidden, currentUser.email); setError(''); }
    } catch (err) {
      if (version === loadVersion.current) setError(serverErrorText(err));
    }
  }, [eligible, currentUser?.id, currentUser?.email]);
  useEffect(() => {
    setSetting(null);
    if (!eligible) return;
    refresh();
    const onFocus = () => refresh();
    const unsubscribe = subscribeOfficerLocationChanges(event => {
      const row = event?.data || event?.record;
      if (saving.current || String(row?.officer_email || '').toLowerCase() !== String(currentUser.email || '').toLowerCase()) return;
      if (typeof row?.live_location_hidden === 'boolean') {
        // The saved privacy record owns visibility. A delayed GPS row must not
        // reverse a completed click or expose the device marker.
        refresh();
      }
    });
    window.addEventListener('focus', onFocus);
    return () => { ++loadVersion.current; unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, [eligible, currentUser?.email, refresh]);

  if (!eligible) return null;
  const setHidden = async hidden => {
    if (saving.current) return;
    saving.current = true;
    ++loadVersion.current;
    setBusy(true);
    setError('');
    try {
      const { data } = await base44.functions.invoke('manageLiveLocationPrivacy', { action: 'set', hidden });
      if (!data?.success || data.hidden !== hidden) throw new Error(data?.error || 'Unable to save visibility.');
      setSetting(data);
      syncCurrentStatus(data);
      clearOfficerLocationSnapshotCache();
      announceOwnLocationVisibility(currentUser.id, hidden, currentUser.email, !hidden);
    } catch (err) {
      setError(serverErrorText(err));
      // A downstream cleanup may fail after the setting was saved. Reconcile the
      // visible setting and status instead of leaving the switch showing old state.
      clearBase44ReadCacheMatching('function:manageLiveLocationPrivacy:');
      try {
        const { data } = await base44.functions.invoke('manageLiveLocationPrivacy', { action: 'get' });
        if (data?.success) {
          setSetting(data); syncCurrentStatus(data);
          clearOfficerLocationSnapshotCache();
          announceOwnLocationVisibility(currentUser.id, data.hidden, currentUser.email, !hidden && data.hidden === false);
        }
      } catch {}
    }
    finally { saving.current = false; setBusy(false); }
  };
  return (
    <div className="relative z-10 flex-none border-b border-slate-800 bg-slate-900 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">Status: {setting ? (setting.hidden ? 'Hidden' : 'Visible') : 'Loading…'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setHidden(false)} disabled={busy} aria-pressed={setting?.hidden === false}
            className="flex items-center gap-2 rounded-md border border-green-500/60 px-3 py-2 text-xs font-semibold text-green-300 disabled:opacity-50">
            <Eye className="h-4 w-4" />Turn sharing ON
          </button>
          <button type="button" onClick={() => setHidden(true)} disabled={busy} aria-pressed={setting?.hidden === true}
            className="flex items-center gap-2 rounded-md border border-gold/50 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50">
            <EyeOff className="h-4 w-4" />Hide my live location
          </button>
          <button type="button" aria-label="Refresh location sharing setting" onClick={refresh} disabled={busy} className="p-2 text-slate-300 disabled:opacity-50"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>
      {busy && <p role="status" className="mt-1 text-xs text-slate-300">Saving visibility…</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
