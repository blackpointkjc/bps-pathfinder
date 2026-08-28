import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, MapPin, RefreshCw, ShieldCheck, Signal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

const lower = value => String(value || '').trim().toLowerCase();
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

export default function SupervisorFieldOversight() {
  const [workingId, setWorkingId] = useState('');
  const { data: payload = {}, isLoading, error, refetch } = useQuery({
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

  const board = payload.board || [];
  const attention = useMemo(() => board.filter(row => row.overdue), [board]);
  const pendingAck = useMemo(() => board.filter(row => lower(row.assignment_status) === 'pending'), [board]);
  const missingGps = useMemo(() => board.filter(row => !row.gps_updated_at || (Date.now() - new Date(row.gps_updated_at).getTime()) > 5 * 60 * 1000), [board]);
  const uniqueOfficers = useMemo(() => new Set(board.map(row => row.unit_id)).size, [board]);

  const openCad = row => {
    window.location.href = `${createPageUrl('CADCenter')}?section=live&tool=dispatch&call_id=${encodeURIComponent(row.call_id)}`;
  };

  const escalate = async row => {
    if (!row.overdue || workingId) return;
    setWorkingId(row.assignment_id);
    try {
      const reason = lower(row.assignment_status) === 'pending'
        ? `Assignment acknowledgement overdue after ${elapsed(row.elapsed_seconds)}`
        : `Officer welfare timer overdue after ${elapsed(row.elapsed_seconds)}`;
      const response = await base44.functions.invoke('escalateCadWelfare', { call_id: row.call_id, unit_id: row.unit_id, reason });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(data.duplicate ? 'This welfare escalation was already sent.' : 'Welfare escalation sent to command staff and added to the CAD timeline.');
      await refetch();
    } catch (e) {
      toast.error(e?.message || 'Unable to escalate welfare condition');
    } finally {
      setWorkingId('');
    }
  };

  return (
    <div className="min-h-screen bg-[#07111d] text-slate-100">
      <div className="border-b border-slate-800 bg-[#0a1421] px-4 py-5 md:px-7">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Supervisor Operations</div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black md:text-3xl"><ShieldCheck className="h-7 w-7 text-cyan-300" />Officer Welfare & Field Oversight</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Supervisor-only visibility into active officer assignments, acknowledgement timing, welfare conditions, and location freshness. Dispatch work stays in CAD Center.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            <Button onClick={() => { window.location.href = createPageUrl('CADCenter'); }} className="bg-blue-700 hover:bg-blue-600"><ExternalLink className="mr-2 h-4 w-4" />Open CAD Center</Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-7">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Users} label="Officers on Active Calls" value={uniqueOfficers} />
          <Metric icon={Clock3} label="Active Assignments" value={board.length} />
          <Metric icon={Clock3} label="Pending Acknowledgement" value={pendingAck.length} tone={pendingAck.length ? 'amber' : ''} />
          <Metric icon={AlertTriangle} label="Needs Supervisor Attention" value={attention.length} tone={attention.length ? 'red' : ''} />
          <Metric icon={Signal} label="GPS Missing / Stale" value={missingGps.length} tone={missingGps.length ? 'amber' : ''} />
        </section>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-700 bg-[#0b1725] p-12 text-center text-slate-400">Loading field oversight…</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-700 bg-red-950/30 p-5 text-red-200">Field oversight could not load: {error.message}</div>
        ) : board.length === 0 ? (
          <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400" /><div className="text-lg font-black">NO ACTIVE OFFICER ASSIGNMENTS</div><p className="mt-1 text-sm text-slate-400">There are no active call assignments requiring supervisor oversight right now.</p></div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1725]">
            <div className="border-b border-slate-700 px-4 py-3"><h2 className="font-black">Active Officer Oversight</h2><p className="mt-1 text-xs text-slate-500">This is a supervisor monitoring view. Use CAD Center for dispatching, call status changes, unit assignment, maps, BOLOs, and dispatcher workflow.</p></div>
            <div className="divide-y divide-slate-800">
              {board.map(row => (
                <article key={row.assignment_id} className={`p-4 ${row.overdue ? 'bg-red-950/20' : ''}`}>
                  <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_330px] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={statusTone(row.assignment_status)}>{String(row.assignment_status || 'pending').replaceAll('_', ' ').toUpperCase()}</Badge>
                        {row.overdue && <Badge className="bg-red-700 text-white"><AlertTriangle className="mr-1 h-3 w-3" />SUPERVISOR ATTENTION</Badge>}
                        <span className="text-xs font-black text-cyan-300">CAD {row.cad_number}</span>
                      </div>
                      <div className="mt-2 text-lg font-black">{row.unit_number ? `Unit ${row.unit_number} · ` : ''}{row.officer_name}</div>
                      <div className="mt-1 text-sm text-slate-300">{row.incident}</div>
                      <div className="mt-1 flex items-start gap-2 text-xs text-slate-400"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{row.location || 'Location not listed'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-2">
                      <Info label="Assignment Timer" value={elapsed(row.elapsed_seconds)} alert={row.overdue} />
                      <Info label="GPS Update" value={gpsAge(row.gps_updated_at)} alert={!row.gps_updated_at} />
                      <Info label="Officer Status" value={row.officer_status || 'Unknown'} />
                      <Info label="Location Accuracy" value={row.gps_accuracy ? `${Math.round(Number(row.gps_accuracy))} m` : 'Not reported'} />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                      <Button variant="outline" onClick={() => openCad(row)}><ExternalLink className="mr-2 h-4 w-4" />View Call in CAD</Button>
                      {row.overdue ? <Button onClick={() => escalate(row)} disabled={!!workingId} className="bg-red-700 hover:bg-red-600"><AlertTriangle className="mr-2 h-4 w-4" />Escalate Welfare</Button> : <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-center text-xs font-bold text-emerald-300">No supervisory intervention required</div>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = '' }) {
  const classes = tone === 'red' ? 'border-red-700/70 bg-red-950/25 text-red-300' : tone === 'amber' ? 'border-amber-700/60 bg-amber-950/20 text-amber-300' : 'border-slate-700 bg-[#0b1725] text-white';
  return <div className={`rounded-xl border p-4 ${classes}`}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon className="h-4 w-4" />{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>;
}
function Info({ label, value, alert = false }) {
  return <div className={`rounded-lg border p-3 ${alert ? 'border-red-700/60 bg-red-950/20' : 'border-slate-700 bg-slate-950/40'}`}><div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-xs font-black ${alert ? 'text-red-300' : 'text-slate-200'}`}>{value}</div></div>;
}
