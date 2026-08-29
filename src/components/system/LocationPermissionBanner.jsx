import { useEffect, useState } from 'react';
import { AlertTriangle, LocateFixed, Loader2, MapPinOff, X } from 'lucide-react';
import { isInternalMember } from '@/lib/directoryUtils';
import { requestBestLiveLocation } from '@/lib/liveLocationService';

function messageFor(state, detail = {}) {
  if (state === 'permission_denied') return 'Location is blocked for Pathfinder. Allow Location and Precise Location in this browser’s site settings, then select Retry Location.';
  if (state === 'timeout') return 'Pathfinder could not obtain a current device location. Confirm device Location Services are on, then retry.';
  if (state === 'low_accuracy') return `Pathfinder has a low-accuracy location${Number.isFinite(Number(detail.accuracy)) ? ` (±${Math.round(Number(detail.accuracy))} m)` : ''}. Keep Wi-Fi and Precise Location enabled while the device improves the fix.`;
  if (state === 'stale') return 'The last device location is stale. Keep Pathfinder open and retry the live location.';
  if (state === 'unavailable') return 'This device is not providing a location to Pathfinder. Confirm browser and device location settings.';
  return '';
}

export default function LocationPermissionBanner({ user }) {
  const [quality, setQuality] = useState({ state: 'checking' });
  const [retrying, setRetrying] = useState(false);
  const [dismissedState, setDismissedState] = useState('');

  useEffect(() => {
    if (!user?.id || !isInternalMember(user)) return undefined;
    let active = true;
    const onQuality = event => {
      if (!active) return;
      const detail = event?.detail || {};
      setQuality(detail);
      if (detail.state === 'live') setDismissedState('');
    };
    window.addEventListener('bps-location-quality', onQuality);

    if (navigator?.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        if (!active) return;
        if (status.state === 'denied') setQuality({ state: 'permission_denied' });
        status.onchange = () => {
          if (!active) return;
          if (status.state === 'denied') setQuality({ state: 'permission_denied' });
          else {
            setDismissedState('');
            window.dispatchEvent(new Event('bps-request-location'));
          }
        };
      }).catch(() => null);
    }
    return () => {
      active = false;
      window.removeEventListener('bps-location-quality', onQuality);
    };
  }, [user?.id]);

  if (!user?.id || !isInternalMember(user)) return null;
  if (quality.state === 'checking' || quality.state === 'live' || quality.state === dismissedState) return null;

  const blocked = quality.state === 'permission_denied';
  const retry = async () => {
    setRetrying(true);
    setDismissedState('');
    try {
      const fix = await requestBestLiveLocation({ timeoutMs: 20000, targetAccuracyMeters: 75 });
      window.dispatchEvent(new CustomEvent('bps-location-quality', {
        detail: { state: Number(fix?.accuracy) <= 100 ? 'live' : 'low_accuracy', accuracy: fix?.accuracy },
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('bps-location-quality', {
        detail: {
          state: error?.code === 1 ? 'permission_denied' : error?.code === 3 ? 'timeout' : 'unavailable',
          message: error?.message,
        },
      }));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`fixed left-1/2 top-20 z-[100050] w-[min(94vw,760px)] -translate-x-1/2 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${blocked ? 'border-red-500/70 bg-red-950/95 text-red-50' : 'border-amber-500/70 bg-[#2b2107]/95 text-amber-50'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${blocked ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
          {blocked ? <MapPinOff className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black uppercase tracking-wide">{blocked ? 'Location Permission Required' : 'Live Location Needs Attention'}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-200">{messageFor(quality.state, quality)}</p>
          <p className="mt-1 text-[10px] text-slate-400">Clock-in verification, officer distress, tactical maps, automatic dispatch, geofences, and movement history all use this same device location.</p>
          <button type="button" onClick={retry} disabled={retrying} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-xs font-black text-white hover:bg-white/20 disabled:opacity-60">
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            {retrying ? 'CHECKING LOCATION…' : 'RETRY LOCATION'}
          </button>
        </div>
        <button type="button" onClick={() => setDismissedState(quality.state)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Dismiss location warning">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
