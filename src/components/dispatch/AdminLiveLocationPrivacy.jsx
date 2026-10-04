import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { clearOfficerLocationSnapshotCache } from '@/lib/officerLocationHub';

export default function AdminLiveLocationPrivacy({ currentUser }) {
  const [setting, setSetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rank = String(currentUser?.rank || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  const eligible = currentUser?.role === 'admin' && rank === 'colonel';
  useEffect(() => {
    let cancelled = false;
    setSetting(null);
    if (!eligible) return;
    base44.functions.invoke('manageLiveLocationPrivacy', { action: 'get' })
      .then(({ data }) => { if (!cancelled) setSetting(data); })
      .catch(() => { if (!cancelled) setError('Unable to load live location visibility.'); });
    return () => { cancelled = true; };
  }, [currentUser?.id, eligible]);

  if (!eligible) return null;
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await base44.functions.invoke('manageLiveLocationPrivacy', { action: 'set', hidden: !setting.hidden });
      if (!data?.success) throw new Error(data?.error || 'Unable to save visibility.');
      setSetting(data);
      clearOfficerLocationSnapshotCache();
      window.dispatchEvent(new CustomEvent('bps-live-location-visibility-changed'));
    } catch (err) { setError(err.message || 'Unable to save visibility.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex-none border-b border-slate-800 bg-slate-900 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">My live location: {setting ? (setting.hidden ? 'Hidden from everyone' : 'Sharing') : 'Loading…'}</span>
          <p className="mt-0.5 text-[11px] text-slate-400">Colonel command control · Movement history and GPS pings continue recording.</p>
        </div>
        <button type="button" onClick={toggle} disabled={busy || !setting?.eligible}
          aria-pressed={setting?.hidden === true}
          className="flex items-center gap-2 rounded-md border border-gold/50 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50">
          {setting?.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {busy ? 'Saving…' : setting?.hidden ? 'Share my live location' : 'Hide my live location'}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
