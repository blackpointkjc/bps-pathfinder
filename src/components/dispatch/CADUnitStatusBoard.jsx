import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { normalizeRank } from '@/utils/rankDisplay';

const STATUS_ORDER = ['All','Available','On Patrol','Enroute','On Scene','Busy','Distress','Out of Service'];
const STATUS_META = {
  Available: { short: 'AVAIL', dot: 'bg-green-400', badge: 'bg-green-900/40 text-green-300 border-green-700/50' },
  'On Patrol': { short: 'PTR', dot: 'bg-indigo-400', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50' },
  Enroute: { short: 'ENRT', dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' },
  'On Scene': { short: 'SCNE', dot: 'bg-blue-400', badge: 'bg-blue-900/40 text-blue-300 border-blue-700/50' },
  Busy: { short: 'BUSY', dot: 'bg-orange-400', badge: 'bg-orange-900/40 text-orange-300 border-orange-700/50' },
  Distress: { short: 'DSTR', dot: 'bg-red-500', badge: 'bg-red-900/60 text-red-200 border-red-600/60' },
  'Out of Service': { short: 'OOS', dot: 'bg-slate-500', badge: 'bg-slate-800 text-slate-300 border-slate-600' },
};

const displayName = (unit) => {
  const rank = normalizeRank(unit?.rank);
  const last = String(unit?.last_name || '').trim();
  if (rank && last) return `${rank} ${last}`.toUpperCase();
  if (last) return last.toUpperCase();
  if (unit?.unit_number) return `UNIT-${unit.unit_number}`;
  return String(unit?.full_name || unit?.email || 'UNIT').toUpperCase();
};

function isDispatchOrAdmin(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'dispatch') return true;
  // dispatch_role / is_supervisor are the actual fields Dispatch Center and
  // Command Dashboard use to grant CAD/dispatch access (see hasDispatchAccess
  // in DispatchCenter.jsx and isDispatchOrAdmin in CommandDashboard.jsx). This
  // check previously omitted them, so a dispatcher granted access only via
  // dispatch_role could open Dispatch Center but never saw the distress
  // controls here.
  if (user.dispatch_role === true || user.is_supervisor === true) return true;
  return (user.additional_roles || []).some(r => ['full_access', 'dispatch', 'supervisor', 'cad_access'].includes(String(r).toLowerCase()));
}

export default function CADUnitStatusBoard({ units = [], compact = false, currentUser = null }) {
  const [filter, setFilter] = useState('All');
  const [pendingId, setPendingId] = useState(null);
  const [canonicalUnits, setCanonicalUnits] = useState([]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const response = await base44.functions.invoke('getOnDutyUnits', {});
        const payload = response?.data || response || {};
        if (!active || payload.error) return;
        setCanonicalUnits(Array.isArray(payload.users) ? payload.users : []);
      } catch {
        // Keep rendering the parent feed if the canonical refresh is temporarily unavailable.
      }
    };
    sync();
    const timer = setInterval(sync, 10000);
    const onFocus = () => sync();
    const onStatusChanged = () => sync();
    window.addEventListener('focus', onFocus);
    window.addEventListener('bps-officer-status-changed', onStatusChanged);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('bps-officer-status-changed', onStatusChanged);
    };
  }, []);

  const sourceUnits = canonicalUnits.length ? canonicalUnits : units;
  const statusUnits = useMemo(() => (sourceUnits || []).filter(u => u?.status), [sourceUnits]);
  const counts = useMemo(() => Object.fromEntries(STATUS_ORDER.slice(1).map(status => [status, statusUnits.filter(u => u.status === status).length])), [statusUnits]);
  const filtered = filter === 'All' ? statusUnits : statusUnits.filter(u => u.status === filter);
  const canManageDistress = isDispatchOrAdmin(currentUser);

  const triggerDistress = async (unit) => {
    const officerId = unit.user_id || unit.id;
    if (!officerId) return;
    setPendingId(officerId);
    try {
      const res = await base44.functions.invoke('manageOfficerDistress', { action: 'activate', officer_id: officerId });
      const payload = res?.data || res || {};
      if (payload.error) throw new Error(payload.error);
      toast.error(`🚨 DISTRESS ACTIVATED — UNIT ${unit.unit_number || unit.label || ''}`.trim(), { duration: 8000 });
      window.dispatchEvent(new CustomEvent('officer-distress-activated', { detail: { officer_id: officerId } }));
    } catch (e) {
      toast.error(e?.message || 'Unable to trigger distress');
    } finally {
      setPendingId(null);
    }
  };

  const clearDistress = async (unit) => {
    const officerId = unit.user_id || unit.id;
    if (!officerId) return;
    setPendingId(officerId);
    try {
      const res = await base44.functions.invoke('manageOfficerDistress', { action: 'clear', officer_id: officerId });
      const payload = res?.data || res || {};
      if (payload.error) throw new Error(payload.error);
      toast.success('Distress cleared — unit returned to Available');
      window.dispatchEvent(new CustomEvent('officer-distress-cleared', { detail: { officer_id: officerId } }));
    } catch (e) {
      toast.error(e?.message || 'Unable to clear distress');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#08111b]">
      <div className="flex items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-blue-400" />
        <span className="text-[10px] font-black tracking-[0.18em] text-blue-300">UNIT STATUS BOARD</span>
        <span className="ml-auto rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[9px] font-bold text-slate-300">{statusUnits.length}</span>
      </div>

      <div className="grid grid-cols-7 border-b border-[#1e2d4a] bg-[#080d18]">
        {STATUS_ORDER.slice(1).map(status => {
          const meta = STATUS_META[status];
          return (
            <button key={status} onClick={() => setFilter(filter === status ? 'All' : status)}
              className={`border-r border-[#1e2d4a] px-1 py-2 last:border-r-0 ${filter === status ? 'bg-slate-800/80' : 'hover:bg-slate-900/70'}`}>
              <div className={`text-base font-black ${
                status === 'Available' ? 'text-green-400' :
                status === 'Enroute' ? 'text-yellow-400' :
                status === 'On Scene' ? 'text-blue-400' :
                status === 'Busy' ? 'text-orange-400' :
                status === 'Distress' ? 'text-red-400' : 'text-slate-400'
              }`}>{counts[status] || 0}</div>
              <div className="text-[7px] font-bold tracking-widest text-slate-600">{meta.short}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5 border-b border-[#1e2d4a] bg-[#0b1320] px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2">
        <span className="text-[8px] font-black tracking-widest text-slate-500">FILTER STATUS:</span>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="w-full min-w-0 rounded border border-blue-700/50 bg-[#07101c] px-2 py-1.5 text-[10px] font-bold text-blue-200 outline-none sm:w-auto sm:min-w-32 sm:py-1 sm:text-[9px]">
          {STATUS_ORDER.map(status => <option key={status} value={status}>{status.toUpperCase()}</option>)}
        </select>
        <span className="text-[8px] text-slate-600 sm:ml-auto">SHOWING {filtered.length} OF {statusUnits.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-[9px] font-mono tracking-widest text-slate-600">NO UNITS IN THIS STATUS</div>
        ) : filtered.map(unit => {
          const meta = STATUS_META[unit.status] || STATUS_META['Out of Service'];
          const officerId = unit.user_id || unit.id;
          const isDistress = unit.status === 'Distress';
          const busy = pendingId === officerId;
          return (
            <div key={unit.id || unit.email} className={`flex items-center gap-2 border-b border-[#172536] px-3 ${compact ? 'py-1.5' : 'py-2'} ${isDistress ? 'bg-red-950/30' : 'hover:bg-[#111827]'}`}>
              <span className={`h-2 w-2 flex-none rounded-full ${meta.dot} ${isDistress ? 'animate-pulse' : ''}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-black text-white" title={displayName(unit)}>{displayName(unit)}</div>
                {(unit.unit_number || unit.current_call_info) && <div className="truncate text-[8px] text-slate-500">{unit.unit_number ? `UNIT-${unit.unit_number}` : ''}{unit.unit_number && unit.current_call_info ? ' · ' : ''}{unit.current_call_info || ''}</div>}
              </div>
              <span className={`flex-none rounded border px-1.5 py-0.5 text-[8px] font-bold ${meta.badge}`}>{meta.short}</span>
              {canManageDistress && (
                isDistress ? (
                  <button
                    type="button"
                    onClick={() => clearDistress(unit)}
                    disabled={busy}
                    title="Clear officer distress"
                    className="flex-none rounded border border-green-600/60 bg-green-900/40 px-1.5 py-0.5 text-[8px] font-bold text-green-300 hover:bg-green-800/60 disabled:opacity-50"
                  >
                    {busy ? '…' : 'CLR'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerDistress(unit)}
                    disabled={busy}
                    title="Trigger officer distress for this unit"
                    className="flex-none flex items-center gap-0.5 rounded border border-red-700/60 bg-red-950/50 px-1.5 py-0.5 text-[8px] font-bold text-red-300 hover:bg-red-900/60 disabled:opacity-50"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />{busy ? '…' : 'DSTR'}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}