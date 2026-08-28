import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, MapPin, RefreshCw, ShieldCheck, Signal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

const lower = value => String(value || '').trim().toLowerCase();
const terminal = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'resolved', 'completed']);
const elapsed = seconds => {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes ? `${minutes}m ${secs}s` : `${secs}s`;
};
const gpsAge = value => {
  if (!value) return 'No GPS fix';
  const age = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  return `${Math.floor(age / 3600)}h ago`;
};
const statusTone = status => ({
  pending: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  accepted: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200',
  enroute: 'border-blue-500/50 bg-blue-500/10 text-blue-200',
  on_scene: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
}[lower(status)] || 'border-slate-600 bg-slate-800 text-slate-200');
const validCoordinate = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const validPosition = item => validCoordinate(item?.latitude) && validCoordinate(item?.longitude) && Math.abs(Number(item.latitude)) <= 90 && Math.abs(Number(item.longitude)) <= 180 && !(Number(item.latitude) === 0 && Number(item.longitude) === 0);

export default function SupervisorFieldOversight() {
  const [workingId, setWorkingId] = useState('');
  const { data: welfarePayload = {}, isLoading: welfareLoading, error: welfareError, refetch: refetchWelfare } = useQuery({
    queryKey: ['supervisorFieldOversight'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSupervisorWelfareBoard', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { data: locationPayload = {}, refetch: refetchLocations } = useQuery({
    queryKey: ['supervisorLiveOfficerLocations'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getOnDutyUnits', { location_only: true });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval: 15000,
    staleTime: 0,
  });
  const { data: activeCalls = [], refetch: refetchCalls } = useQuery({
    queryKey: ['supervisorActiveCalls'],
    queryFn: async () => {
      const calls = await base44.entities.DispatchCall.list('-created_date', 300);
      return (calls || []).filter(call => !terminal.has(lower(call.status)));
    },
    refetchInterval: 15000,
    staleTime: 0,
  });

  const board = welfarePayload.board || [];
  const welfareChecks = welfarePayload.welfare_checks || [];
  const displayByEmail = welfarePayload.display_by_email || {};
  const liveUnits = locationPayload.units || [];
  const officerLabel = unit => displayByEmail[lower(unit?.officer_email)] || board.find(row => lower(row.officer_email) === lower(unit?.officer_email))?.officer_name || 'Officer';
  const mappedUnits = useMemo(() => liveUnits.filter(validPosition), [liveUnits]);
  const attention = useMemo(() => board.filter(row => row.overdue), [board]);
  const pendingWelfare = useMemo(() => welfareChecks.filter(check => lower(check.status) === 'pending'), [welfareChecks]);
  const pendingAck = useMemo(() => board.filter(row => lower(row.assignment_status) === 'pending'), [board]);
  const missingGps = useMemo(() => liveUnits.filter(row => !row.gps_updated_at || !validPosition(row)), [liveUnits]);
  const uniqueOfficers = useMemo(() => new Set(board.map(row => row.unit_id)).size, [board]);

  const refreshAll = async () => Promise.allSettled([refetchWelfare(), refetchLocations(), refetchCalls()]);
  const openCad = callOrRow => {
    const callId = callOrRow?.call_id || callOrRow?.id;
    window.location.href = `${createPageUrl('CADCenter')}?section=live&tool=dispatch${callId ? `&call_id=${encodeURIComponent(callId)}` : ''}`;
  };
  const escalate = async row => {
    if (!row.overdue || workingId) return;
    setWorkingId(row.assignment_id);
    try {
      const reason = lower(row.assignment_status) === 'pending' ? `Assignment acknowledgement overdue after ${elapsed(row.elapsed_seconds)}` : `Officer welfare timer overdue after ${elapsed(row.elapsed_seconds)}`;
      const response = await base44.functions.invoke('escalateCadWelfare', { call_id: row.call_id, unit_id: row.unit_id, reason });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(data.duplicate ? 'This welfare escalation was already sent.' : 'Welfare escalation sent to command staff and added to the CAD timeline.');
      await refetchWelfare();
    } catch (e) { toast.error(e?.message || 'Unable to escalate welfare condition'); }
    finally { setWorkingId(''); }
  };

  return <div className="min-h-screen bg-[#07111d] text-slate-100">
    <div className="border-b border-slate-800 bg-[#0a1421] px-4 py-5 md:px-7"><div className="mx-auto flex max-w-[1700px] flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Supervisor Operations</div><h1 className="mt-1 flex items-center gap-2 text-2xl font-black md:text-3xl"><ShieldCheck className="h-7 w-7 text-cyan-300"/>Supervisor Operations Overview</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">See where officers are, what calls are active, who is assigned, unit status, GPS freshness, acknowledgement timing, and welfare conditions from one supervisor-only page.</p></div><div className="flex gap-2"><Button variant="outline" onClick={refreshAll}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button><Button onClick={()=>openCad({})} className="bg-blue-700 hover:bg-blue-600"><ExternalLink className="mr-2 h-4 w-4"/>Open CAD Center</Button></div></div></div>

    <main className="mx-auto max-w-[1700px] space-y-5 p-4 md:p-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric icon={Users} label="Signed-In Units" value={liveUnits.length}/><Metric icon={MapPin} label="Units on Map" value={mappedUnits.length}/><Metric icon={Clock3} label="Active Calls" value={activeCalls.length}/><Metric icon={Users} label="Officers Assigned" value={uniqueOfficers}/><Metric icon={AlertTriangle} label="Needs Attention" value={attention.length} tone={attention.length?'red':''}/><Metric icon={Signal} label="GPS Missing" value={missingGps.length} tone={missingGps.length?'amber':''}/>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_.9fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1725]"><div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><div><h2 className="font-black">Live Operational Map</h2><p className="text-xs text-slate-500">Officer locations and active CAD calls</p></div><div className="flex gap-3 text-[10px] font-bold"><span className="text-cyan-300">● OFFICER</span><span className="text-red-300">● ACTIVE CALL</span></div></div><div className="h-[480px] min-h-[360px] w-full"><MapContainer center={[37.5407,-77.4360]} zoom={11} className="h-full w-full" zoomControl><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors'/><ActiveCallMarkers calls={activeCalls} onCallClick={openCad}/>{mappedUnits.map(unit=><CircleMarker key={unit.id || unit.officer_email} center={[Number(unit.latitude),Number(unit.longitude)]} radius={9} pathOptions={{fillOpacity:.9,weight:3}}><Popup><div className="min-w-[190px]"><strong>{unit.unit_number?`Unit ${unit.unit_number} · `:''}{officerLabel(unit)}</strong><br/>Status: {unit.status || 'Signed In'}<br/>GPS: {gpsAge(unit.gps_updated_at)}<br/>{unit.current_call_info ? `Call: ${unit.current_call_info}` : 'No current call listed'}</div></Popup></CircleMarker>)}</MapContainer></div></div>

        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1725]"><div className="border-b border-slate-700 px-4 py-3"><h2 className="font-black">Unit Status</h2><p className="text-xs text-slate-500">Current signed-in officers</p></div><div className="max-h-[480px] divide-y divide-slate-800 overflow-y-auto">{liveUnits.length===0?<div className="p-8 text-center text-sm text-slate-500">No signed-in units.</div>:liveUnits.map(unit=><div key={unit.id || unit.officer_email} className="p-3"><div className="flex items-start justify-between gap-2"><div><div className="font-bold">{unit.unit_number?`Unit ${unit.unit_number} · `:''}{officerLabel(unit)}</div><div className="mt-1 text-xs text-slate-400">{unit.current_location || 'Location not listed'}</div></div><Badge variant="outline" className="border-slate-600 text-slate-200">{String(unit.status||'Signed In').toUpperCase()}</Badge></div><div className="mt-2 flex flex-wrap gap-2 text-[10px]"><span className={validPosition(unit)?'text-emerald-300':'text-amber-300'}>{validPosition(unit)?`GPS ${gpsAge(unit.gps_updated_at)}`:'GPS unavailable'}</span>{unit.current_call_info&&<span className="text-cyan-300">{unit.current_call_info}</span>}</div></div>)}</div></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1725]"><div className="border-b border-slate-700 px-4 py-3"><h2 className="font-black">Current Calls</h2><p className="text-xs text-slate-500">Supervisor read-only call overview — open CAD for dispatch actions</p></div><div className="max-h-[520px] divide-y divide-slate-800 overflow-y-auto">{activeCalls.length===0?<div className="p-8 text-center text-sm text-slate-500">No active calls.</div>:activeCalls.map(call=>{const assigned=board.filter(row=>String(row.call_id)===String(call.id));return <button key={call.id} type="button" onClick={()=>openCad(call)} className="block w-full p-4 text-left hover:bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-black text-cyan-300">CAD {call.agency_cad_number||call.bps_reference||call.call_id||call.id}</div><div className="mt-1 font-black">{call.incident||'Call for Service'}</div></div><Badge variant="outline" className="border-slate-600 text-slate-200">{String(call.status||'ACTIVE').toUpperCase()}</Badge></div><div className="mt-2 flex items-start gap-2 text-xs text-slate-400"><MapPin className="mt-0.5 h-3.5 w-3.5"/>{call.location||'Location not listed'}</div><div className="mt-2 text-xs text-slate-300">Assigned: {assigned.length?assigned.map(row=>row.unit_number?`Unit ${row.unit_number}`:row.officer_name).join(', '):'No active assignment shown'}</div></button>})}</div></div>

        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1725]"><div className="border-b border-slate-700 px-4 py-3"><h2 className="font-black">Supervisor Attention</h2><p className="text-xs text-slate-500">Acknowledgements and active officer welfare checks</p></div>{welfareLoading?<div className="p-8 text-center text-sm text-slate-500">Loading welfare status…</div>:welfareError?<div className="p-4 text-sm text-red-300">{welfareError.message}</div>:<div className="divide-y divide-slate-800">{pendingWelfare.map(check=><div key={check.id} className="bg-red-950/15 p-4"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-red-700">WELFARE PENDING</Badge><span className="text-xs font-black text-cyan-300">CAD {check.cad_number}</span></div><div className="mt-2 font-black">{check.officer_display_name || 'Officer'}</div><div className="mt-2 grid grid-cols-2 gap-2"><Info label="Waiting" value={elapsed(check.elapsed_seconds)} alert/><Info label="Status" value="AWAITING RESPONSE" alert/></div></div>)}{attention.map(row=><div key={row.assignment_id} className="bg-red-950/15 p-4"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-red-700">ATTENTION</Badge><span className="text-xs font-black text-cyan-300">CAD {row.cad_number}</span></div><div className="mt-2 font-black">{row.unit_number?`Unit ${row.unit_number} · `:''}{row.officer_name}</div><div className="mt-1 text-xs text-slate-400">{row.incident} · {row.location}</div><div className="mt-2 grid grid-cols-2 gap-2"><Info label="Timer" value={elapsed(row.elapsed_seconds)} alert/><Info label="GPS" value={gpsAge(row.gps_updated_at)} alert={!row.gps_updated_at}/></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={()=>openCad(row)} className="flex-1">View CAD</Button><Button size="sm" onClick={()=>escalate(row)} disabled={!!workingId} className="flex-1 bg-red-700 hover:bg-red-600">Escalate Welfare</Button></div></div>)}{pendingWelfare.length===0&&attention.length===0&&<div className="p-8 text-center"><CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-400"/><div className="font-bold text-emerald-300">No active welfare concerns</div><div className="mt-1 text-xs text-slate-500">{pendingAck.length} assignment{pendingAck.length===1?'':'s'} currently awaiting acknowledgement.</div></div>}</div>}</div>
      </section>
    </main>
  </div>;
}

function Metric({icon:Icon,label,value,tone=''}){const classes=tone==='red'?'border-red-700/70 bg-red-950/25 text-red-300':tone==='amber'?'border-amber-700/60 bg-amber-950/20 text-amber-300':'border-slate-700 bg-[#0b1725] text-white';return <div className={`rounded-xl border p-4 ${classes}`}><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4"/>{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>}
function Info({label,value,alert=false}){return <div className={`rounded-lg border p-3 ${alert?'border-red-700/60 bg-red-950/20':'border-slate-700 bg-slate-950/40'}`}><div className="text-[9px] font-bold uppercase text-slate-500">{label}</div><div className={`mt-1 text-xs font-black ${alert?'text-red-300':'text-slate-200'}`}>{value}</div></div>}
