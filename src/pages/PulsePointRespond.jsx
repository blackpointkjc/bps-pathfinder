import React, { useEffect, useState } from 'react';
import { Activity, ExternalLink, RefreshCw, Radio, Volume2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const PULSEPOINT_URL = 'https://web.pulsepoint.org/';

const INCIDENT_GROUPS = [
  'Medical Emergency', 'Traffic Collision', 'Fire', 'Alarm', 'Rescue', 'Hazmat',
  'Gas Leak', 'Public Service', 'Investigation', 'Wires Down', 'Water Rescue',
];

export default function PulsePointRespond() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const syncPulsePoint = async (manual = true) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await base44.functions.invoke('ingestPulsePoint', {
        area_keys: ['richmond_va', 'chesterfield_va'],
        include_audio: true,
        manual,
      });
      const result = response?.data || response || {};
      if (result?.success === false) throw new Error(result.error || 'PulsePoint sync failed');
      setLastResult(result);
      window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished', { detail: { source: 'pulsepoint', result } }));
      toast.success(`PulsePoint synced: ${result.active || 0} active, ${result.created || 0} new, ${result.audio_events || 0} audio events`);
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Unable to sync PulsePoint');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') syncPulsePoint(false);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, syncing]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050b13] text-slate-100">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-red-900/40 bg-gradient-to-r from-red-950/50 via-[#0b1725] to-[#08111d] px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/15 text-red-200">
          <Radio className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-red-200">PulsePoint Respond</div>
          <h1 className="truncate text-xl font-black tracking-wide text-white">Richmond + Chesterfield Incident Feed</h1>
          <p className="mt-1 text-xs text-slate-400">Imports all active PulsePoint incident types into BPS CAD and creates BPS audio events for new calls.</p>
        </div>
        <button
          type="button"
          onClick={() => setAutoRefresh(value => !value)}
          className={`rounded-lg border px-3 py-2 text-[10px] font-black ${autoRefresh ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
        >
          AUTO 5 MIN {autoRefresh ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          onClick={() => syncPulsePoint(true)}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'SYNCING' : 'SYNC TO BPS CAD'}
        </button>
        <a
          href={PULSEPOINT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
        >
          <ExternalLink className="h-4 w-4" /> Open Original
        </a>
      </header>

      <section className="grid flex-none grid-cols-2 gap-2 border-b border-slate-800 bg-[#07111f] p-3 lg:grid-cols-4">
        <div className="rounded-lg border border-red-900/50 bg-red-950/25 p-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-200"><Activity className="h-3 w-3" /> Active</div>
          <div className="mt-1 text-2xl font-black text-white">{lastResult?.active ?? '--'}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">New Calls</div>
          <div className="mt-1 text-2xl font-black text-white">{lastResult?.created ?? '--'}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Updated / Closed</div>
          <div className="mt-1 text-2xl font-black text-white">{lastResult ? `${lastResult.updated || 0}/${lastResult.closed || 0}` : '--'}</div>
        </div>
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-200"><Volume2 className="h-3 w-3" /> BPS Audio</div>
          <div className="mt-1 text-2xl font-black text-white">{lastResult?.audio_events ?? '--'}</div>
        </div>
      </section>

      <div className="flex flex-none flex-wrap gap-2 border-b border-slate-800 bg-[#08111d] px-3 py-2">
        <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Incident Types</span>
        {INCIDENT_GROUPS.map(type => <span key={type} className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-100">{type}</span>)}
      </div>

      <div className="min-h-0 flex-1 bg-black">
        <iframe
          title="PulsePoint Respond Web"
          src={PULSEPOINT_URL}
          className="h-full w-full border-0 bg-white"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
