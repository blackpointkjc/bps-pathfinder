import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import {
  Activity, Building2, ChevronRight, Clock3, ExternalLink, Map,
  MapPin, Radio, RefreshCw, Search, Shield, Signal, Siren,
} from 'lucide-react';

const CLOSED = new Set(['Closed', 'Cleared', 'Cancelled']);
const AGENCIES = ['ALL', 'RPD', 'RFD', 'HPD', 'HFD', 'CCPD', 'CCFD'];
const STATUSES = ['ALL', 'New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'];

const agencyNames = {
  RPD: 'Richmond Police',
  RFD: 'Richmond Fire',
  HPD: 'Henrico Police',
  HFD: 'Henrico Fire',
  CCPD: 'Chesterfield Police',
  CCFD: 'Chesterfield Fire/EMS',
};

const agencyStyles = {
  RPD: 'border-blue-400/50 bg-blue-400/10 text-blue-300',
  RFD: 'border-red-400/50 bg-red-400/10 text-red-300',
  HPD: 'border-violet-400/50 bg-violet-400/10 text-violet-300',
  HFD: 'border-rose-400/50 bg-rose-400/10 text-rose-300',
  CCPD: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300',
  CCFD: 'border-orange-400/50 bg-orange-400/10 text-orange-300',
};

const statusStyles = {
  New: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  Pending: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
  Dispatched: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  Enroute: 'border-orange-400/40 bg-orange-400/10 text-orange-300',
  'On Scene': 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
};

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
  });
}

function ageOf(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'UNKNOWN';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'NOW';
  if (minutes < 60) return `${minutes}M`;
  return `${Math.floor(minutes / 60)}H ${minutes % 60}M`;
}

function PriorityBar({ priority }) {
  const className = priority === 'critical'
    ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.7)]'
    : priority === 'high'
      ? 'bg-orange-500'
      : priority === 'medium'
        ? 'bg-amber-400'
        : 'bg-sky-500';
  return <span className={`absolute inset-y-0 left-0 w-1 ${className}`} />;
}

function Metric({ label, value, icon: Icon, emphasis = '' }) {
  return (
    <div className="min-w-0 border border-[#203451] bg-[#0c1627]/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[0.18em] text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${emphasis || 'text-slate-500'}`} />
      </div>
      <div className={`mt-1 font-mono text-3xl font-black leading-none ${emphasis || 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function ActiveCalls() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [agency, setAgency] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');
  const [, setClockTick] = useState(0);

  const loadCalls = async () => {
    try {
      const rows = await base44.entities.DispatchCall.list('-time_received', 500);
      const active = (rows || []).filter((call) =>
        String(call.call_id || '').startsWith('grac-') && !CLOSED.has(call.status),
      );
      setCalls(active);
      setSelectedId((current) => current && active.some((call) => call.id === current)
        ? current
        : active[0]?.id || null);
      setError('');
    } catch (loadError) {
      console.error('Unable to load GRAC calls:', loadError);
      setError('LIVE CALL DATABASE UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  };

  const sync = async (showToast = false) => {
    if (syncingRef.current || document.hidden) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const response = await base44.functions.invoke('ingestGractivecalls', {});
      const result = response?.data || {};
      if (result.success === false) throw new Error(result.error || 'GRAC sync failed');
      await loadCalls();
      setLastSync(new Date(result.synced_at || Date.now()));
      if (showToast) {
        toast.success(`GRAC synchronized: ${result.active ?? 0} active, ${result.removed ?? 0} stale removed`);
      }
    } catch (syncError) {
      console.error('GRAC sync failed:', syncError);
      setError(syncError?.message || 'GRAC FEED UNAVAILABLE');
      if (showToast) toast.error(syncError?.message || 'GRAC synchronization failed');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    sync(false);
    const syncInterval = setInterval(() => sync(false), 10_000);
    const localInterval = setInterval(loadCalls, 5_000);
    const clockInterval = setInterval(() => setClockTick((value) => value + 1), 10_000);
    const onVisibility = () => {
      if (!document.hidden) sync(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(syncInterval);
      clearInterval(localInterval);
      clearInterval(clockInterval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const filteredCalls = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return calls.filter((call) => {
      if (agency !== 'ALL' && call.agency !== agency) return false;
      if (status !== 'ALL' && call.status !== status) return false;
      if (!needle) return true;
      return [call.incident, call.location, call.agency, call.zone, call.status]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [calls, query, agency, status]);

  const selectedCall = calls.find((call) => call.id === selectedId) || filteredCalls[0] || null;
  const critical = calls.filter((call) => call.priority === 'critical').length;
  const police = calls.filter((call) => ['RPD', 'HPD', 'CCPD'].includes(call.agency)).length;
  const fireEms = calls.length - police;
  const arrived = calls.filter((call) => ['On Scene', 'On Scene'].includes(call.status)).length;

  return (
    <div className="min-h-full bg-[#060b14] text-slate-100">
      <div className="border-b border-[#203451] bg-[#09111f] shadow-[0_8px_30px_rgba(0,0,0,.3)]">
        <div className="flex min-h-16 flex-wrap items-center gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-blue-400/40 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,.15)]">
              <Shield className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black tracking-[0.18em] text-white">REGIONAL ACTIVE CALLS</h1>
                <span className="flex items-center gap-1 border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold tracking-widest text-emerald-300">
                  <Signal className="h-2.5 w-2.5" /> LIVE
                </span>
              </div>
              <p className="mt-1 text-[10px] tracking-[0.15em] text-slate-500">GREATER RICHMOND PUBLIC SAFETY FEED · GRAC</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className={`hidden items-center gap-2 border px-3 py-2 text-[10px] font-bold tracking-widest sm:flex ${error ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-[#203451] bg-[#0c1627] text-slate-400'}`}>
              <span className={`h-2 w-2 rounded-full ${error ? 'bg-red-400' : 'animate-pulse bg-emerald-400'}`} />
              {error || `LAST SYNC ${lastSync ? formatTime(lastSync) : 'PENDING'} ET`}
            </div>
            <button
              onClick={() => sync(true)}
              disabled={syncing}
              className="flex h-9 items-center gap-2 border border-blue-400/40 bg-blue-500/10 px-3 text-[10px] font-black tracking-wider text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              SYNC GRAC
            </button>
            <button
              onClick={() => navigate(createPageUrl('Navigation'))}
              className="flex h-9 items-center gap-2 border border-[#294467] bg-[#0c1627] px-3 text-[10px] font-black tracking-wider text-slate-300 transition hover:border-blue-400/50 hover:text-white"
            >
              <Map className="h-3.5 w-3.5" /> MAP
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[#203451] lg:grid-cols-5">
        <Metric label="ACTIVE INCIDENTS" value={calls.length} icon={Radio} emphasis="text-blue-300" />
        <Metric label="CRITICAL" value={critical} icon={Siren} emphasis={critical ? 'text-red-400' : 'text-slate-500'} />
        <Metric label="POLICE" value={police} icon={Shield} emphasis="text-cyan-300" />
        <Metric label="FIRE / EMS" value={fireEms} icon={Activity} emphasis="text-orange-300" />
        <Metric label="ARRIVED" value={arrived} icon={MapPin} emphasis="text-emerald-300" />
      </div>

      <div className="grid min-h-[calc(100vh-238px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 border-r border-[#203451]">
          <div className="border-b border-[#203451] bg-[#09111f]/95 p-3 lg:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="SEARCH INCIDENT, LOCATION, AGENCY, OR STATUS"
                  className="h-10 w-full border border-[#294467] bg-[#060b14] pl-10 pr-3 font-mono text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/70"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {STATUSES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setStatus(item)}
                    className={`h-8 border px-2.5 text-[9px] font-black tracking-wider transition ${status === item ? 'border-blue-400/60 bg-blue-500/20 text-blue-200' : 'border-[#203451] bg-[#0c1627] text-slate-500 hover:text-white'}`}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
              {AGENCIES.map((item) => {
                const count = item === 'ALL' ? calls.length : calls.filter((call) => call.agency === item).length;
                return (
                  <button
                    key={item}
                    onClick={() => setAgency(item)}
                    className={`flex h-8 flex-none items-center gap-2 border px-2.5 text-[9px] font-black tracking-wider transition ${agency === item ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200' : 'border-[#203451] bg-[#0c1627] text-slate-500 hover:text-white'}`}
                  >
                    {item}<span className="font-mono text-[10px] text-slate-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden grid-cols-[72px_60px_minmax(190px,1.3fr)_minmax(180px,1fr)_92px_92px] border-b border-[#203451] bg-[#0c1627] px-4 py-2 text-[9px] font-black tracking-[0.16em] text-slate-600 md:grid">
            <span>TIME ET</span><span>AGE</span><span>INCIDENT</span><span>LOCATION</span><span>AGENCY</span><span>STATUS</span>
          </div>

          <div className="max-h-[calc(100vh-390px)] min-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex h-64 items-center justify-center gap-3 text-xs font-bold tracking-widest text-blue-300">
                <RefreshCw className="h-4 w-4 animate-spin" /> ACQUIRING LIVE FEED
              </div>
            ) : filteredCalls.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-slate-600">
                <Radio className="mb-3 h-8 w-8" />
                <span className="text-xs font-bold tracking-widest">NO MATCHING ACTIVE CALLS</span>
              </div>
            ) : filteredCalls.map((call) => (
              <button
                key={call.id}
                onClick={() => setSelectedId(call.id)}
                className={`relative grid w-full grid-cols-1 gap-2 border-b border-[#172942] px-4 py-3 text-left transition md:grid-cols-[72px_60px_minmax(190px,1.3fr)_minmax(180px,1fr)_92px_92px] md:items-center md:gap-0 ${selectedCall?.id === call.id ? 'bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(96,165,250,.25)]' : 'bg-[#070d17] hover:bg-[#0c1627]'}`}
              >
                <PriorityBar priority={call.priority} />
                <span className="font-mono text-sm font-bold text-white">{formatTime(call.time_received)}</span>
                <span className="font-mono text-[10px] font-bold text-slate-500">{ageOf(call.time_received)}</span>
                <span className="min-w-0 pr-3">
                  <span className="block truncate text-xs font-black tracking-wide text-slate-100">{call.incident}</span>
                  <span className="mt-1 block text-[9px] font-bold tracking-widest text-slate-600 md:hidden">{agencyNames[call.agency] || call.agency}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 pr-3 text-[11px] text-slate-400">
                  <MapPin className="h-3 w-3 flex-none text-slate-600" /><span className="truncate">{call.location}</span>
                </span>
                <span className={`w-fit border px-2 py-1 text-[9px] font-black ${agencyStyles[call.agency] || 'border-slate-500/40 text-slate-300'}`}>{call.agency}</span>
                <span className={`w-fit border px-2 py-1 text-[9px] font-black ${statusStyles[call.status] || 'border-slate-500/40 bg-slate-500/10 text-slate-300'}`}>{String(call.status || 'NEW').toUpperCase()}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="bg-[#09111f] p-4">
          {selectedCall ? (
            <div className="sticky top-4 space-y-4">
              <div className="border border-[#294467] bg-[#0c1627] shadow-[0_15px_40px_rgba(0,0,0,.25)]">
                <div className="flex items-center justify-between border-b border-[#203451] px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-blue-300">
                    <Radio className="h-3.5 w-3.5" /> INCIDENT DETAIL
                  </div>
                  <span className="font-mono text-[9px] text-slate-600">{selectedCall.call_id?.slice(-10).toUpperCase()}</span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-flex border px-2 py-1 text-[9px] font-black ${agencyStyles[selectedCall.agency] || ''}`}>{selectedCall.agency}</span>
                      <h2 className="mt-3 text-lg font-black leading-snug text-white">{selectedCall.incident}</h2>
                    </div>
                    <span className={`border px-2 py-1 text-[9px] font-black ${statusStyles[selectedCall.status] || ''}`}>{String(selectedCall.status).toUpperCase()}</span>
                  </div>

                  <div className="mt-5 space-y-3 border-t border-[#203451] pt-4">
                    <div className="flex gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 flex-none text-blue-300" />
                      <div><p className="text-[9px] font-bold tracking-widest text-slate-600">LOCATION</p><p className="mt-1 text-sm font-semibold text-slate-200">{selectedCall.location}</p></div>
                    </div>
                    <div className="flex gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 flex-none text-blue-300" />
                      <div><p className="text-[9px] font-bold tracking-widest text-slate-600">RECEIVED</p><p className="mt-1 font-mono text-sm text-slate-200">{formatTime(selectedCall.time_received)} ET · {ageOf(selectedCall.time_received)} AGO</p></div>
                    </div>
                    <div className="flex gap-3">
                      <Building2 className="mt-0.5 h-4 w-4 flex-none text-blue-300" />
                      <div><p className="text-[9px] font-bold tracking-widest text-slate-600">AGENCY / JURISDICTION</p><p className="mt-1 text-sm text-slate-200">{agencyNames[selectedCall.agency] || selectedCall.agency} · {selectedCall.zone || 'Greater Richmond'}</p></div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigate(`${createPageUrl('Navigation')}?callId=${selectedCall.id}&lat=${selectedCall.latitude || ''}&lng=${selectedCall.longitude || ''}`)}
                      className="flex h-10 items-center justify-center gap-2 border border-blue-400/40 bg-blue-500/10 text-[10px] font-black tracking-wider text-blue-200 transition hover:bg-blue-500/20"
                    >
                      <Map className="h-3.5 w-3.5" /> OPEN MAP
                    </button>
                    <a
                      href="https://gractivecalls.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 items-center justify-center gap-2 border border-[#294467] bg-[#070d17] text-[10px] font-black tracking-wider text-slate-300 transition hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> SOURCE
                    </a>
                  </div>
                </div>
              </div>

              <div className="border border-[#203451] bg-[#070d17] p-4">
                <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-slate-500"><Signal className="h-3.5 w-3.5" /> DATA POLICY</div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">This live queue mirrors GRAC. Calls removed from the public feed are removed from the active queue automatically; historical records remain separate from active incidents.</p>
              </div>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center border border-dashed border-[#294467] text-slate-600"><ChevronRight className="mb-3 h-7 w-7" /><span className="text-xs font-bold tracking-widest">SELECT AN INCIDENT</span></div>
          )}
        </aside>
      </div>
    </div>
  );
}
