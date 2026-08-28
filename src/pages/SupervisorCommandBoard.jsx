import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, MapPin, Radio, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

const statusTone = status => ({ pending:'bg-amber-600', accepted:'bg-indigo-600', enroute:'bg-blue-600', on_scene:'bg-emerald-700' }[String(status||'').toLowerCase()] || 'bg-slate-600');
const fmtElapsed = seconds => {
  const value = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(value / 60);
  const s = value % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
};

export default function SupervisorCommandBoard() {
  const [workingId, setWorkingId] = useState('');
  const { data: payload = {}, isLoading, error, refetch } = useQuery({
    queryKey:['supervisorWelfareBoard'],
    queryFn:async()=>{
      const response = await base44.functions.invoke('getSupervisorWelfareBoard', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval:10000,
    refetchOnWindowFocus:true,
    staleTime:0,
  });
  const board = payload.board || [];
  const overdue = useMemo(()=>board.filter(row=>row.overdue),[board]);

  const escalate = async row => {
    if (workingId) return;
    setWorkingId(row.assignment_id);
    try {
      const response = await base44.functions.invoke('escalateCadWelfare', { call_id:row.call_id, unit_id:row.unit_id, reason:`${row.assignment_status === 'pending' ? 'Assignment not acknowledged' : 'Officer welfare timer overdue'} after ${fmtElapsed(row.elapsed_seconds)}` });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(data.duplicate ? 'Welfare escalation already sent for this interval.' : 'Emergency welfare escalation sent to command staff.');
      await refetch();
    } catch (e) { toast.error(e?.message || 'Unable to escalate welfare check'); }
    finally { setWorkingId(''); }
  };

  const requestSupervisor = async row => {
    if (workingId) return;
    setWorkingId(row.assignment_id);
    try {
      const response = await base44.functions.invoke('requestSupervisorAssist', { call_id:row.call_id });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      if (!data.assigned) toast.warning(data.reason || 'No eligible supervisor available.');
      else toast.success(`${data.supervisor?.name || 'Supervisor'} assigned as closest available supervisor.`);
      await refetch();
    } catch (e) { toast.error(e?.message || 'Unable to request supervisor'); }
    finally { setWorkingId(''); }
  };

  const openDispatch = row => {
    window.location.href = `${createPageUrl('CADCenter')}?section=live&tool=dispatch&call_id=${encodeURIComponent(row.call_id)}`;
  };

  return <div className="min-h-full bg-[#07111d] p-4 text-slate-100 md:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="rounded-2xl border border-cyan-900/70 bg-[#0b1725] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-cyan-300"/><h1 className="text-2xl font-black">Supervisor CAD Command</h1></div><p className="mt-1 text-sm text-slate-400">Live officer welfare timers, acknowledgement oversight, emergency escalation, and closest-supervisor response.</p></div><Button variant="outline" onClick={()=>refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-[#0b1725] p-4"><div className="text-xs font-bold uppercase text-slate-500">Active Assignments</div><div className="mt-1 text-3xl font-black">{board.length}</div></div>
        <div className={`rounded-xl border p-4 ${overdue.length?'border-red-600 bg-red-950/30':'border-slate-700 bg-[#0b1725]'}`}><div className="text-xs font-bold uppercase text-slate-500">Welfare Overdue</div><div className={overdue.length?'mt-1 text-3xl font-black text-red-300':'mt-1 text-3xl font-black'}>{overdue.length}</div></div>
        <div className="rounded-xl border border-slate-700 bg-[#0b1725] p-4"><div className="text-xs font-bold uppercase text-slate-500">Pending Acknowledgement</div><div className="mt-1 text-3xl font-black text-amber-300">{board.filter(row=>row.assignment_status==='pending').length}</div></div>
      </div>

      {isLoading ? <div className="rounded-xl border border-slate-700 bg-[#0b1725] p-10 text-center text-slate-400">Loading command board…</div> : error ? <div className="rounded-xl border border-red-700 bg-red-950/30 p-4 text-red-200">Command board could not load: {error.message}</div> : board.length===0 ? <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-10 text-center"><UserCheck className="mx-auto mb-3 h-10 w-10 text-emerald-400"/><div className="font-black">NO ACTIVE WELFARE TIMERS</div><div className="mt-1 text-sm text-slate-400">There are no active officer call assignments requiring command oversight.</div></div> : <div className="space-y-3">
        {board.map(row=><div key={row.assignment_id} className={`rounded-2xl border p-4 ${row.overdue?'border-red-600 bg-red-950/25':'border-slate-700 bg-[#0b1725]'}`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={statusTone(row.assignment_status)}>{String(row.assignment_status||'pending').replaceAll('_',' ').toUpperCase()}</Badge>{row.overdue&&<Badge className="bg-red-700"><AlertTriangle className="mr-1 h-3 w-3"/>WELFARE OVERDUE</Badge>}<span className="text-xs font-black text-cyan-300">CAD {row.cad_number}</span></div><div className="mt-2 text-lg font-black">{row.unit_number?`Unit ${row.unit_number} · `:''}{row.officer_name}</div><div className="mt-1 text-sm text-slate-300">{row.incident}</div><div className="mt-1 flex items-start gap-2 text-xs text-slate-400"><MapPin className="mt-0.5 h-3.5 w-3.5"/>{row.location||'Location not listed'}</div></div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 text-center"><div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><Clock3 className="mx-auto mb-1 h-4 w-4 text-cyan-300"/><div className="text-[10px] uppercase text-slate-500">Timer</div><div className={`font-black ${row.overdue?'text-red-300':'text-white'}`}>{fmtElapsed(row.elapsed_seconds)}</div></div><div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><Radio className="mx-auto mb-1 h-4 w-4 text-cyan-300"/><div className="text-[10px] uppercase text-slate-500">GPS</div><div className="text-xs font-bold">{row.gps_updated_at?'RECEIVED':'NO FIX'}</div></div></div>
            <div className="grid gap-2 sm:grid-cols-3 xl:w-[430px]"><Button variant="outline" onClick={()=>openDispatch(row)}>OPEN CALL</Button><Button onClick={()=>requestSupervisor(row)} disabled={!!workingId} className="bg-purple-700 hover:bg-purple-600">REQUEST SUPERVISOR</Button><Button onClick={()=>escalate(row)} disabled={!!workingId} className="bg-red-700 hover:bg-red-600">EMERGENCY ESCALATE</Button></div>
          </div>
        </div>)}
      </div>}
    </div>
  </div>;
}