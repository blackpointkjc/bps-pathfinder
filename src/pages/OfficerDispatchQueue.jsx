import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, MapPinned, MessageSquare, Navigation, Radio, ShieldAlert, Siren, HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

const statusLabel = status => String(status || 'pending').replaceAll('_', ' ').toUpperCase();
const priorityClass = priority => ({ critical:'bg-red-700', high:'bg-orange-600', medium:'bg-amber-600', low:'bg-slate-600' }[String(priority||'').toLowerCase()] || 'bg-slate-600');

export default function OfficerDispatchQueue() {
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [disposition, setDisposition] = useState('');
  const [working, setWorking] = useState(false);

  const { data: payload = {}, isLoading, error, refetch } = useQuery({
    queryKey: ['myDispatchQueue'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getMyDispatchQueue', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const queue = payload.queue || [];
  useEffect(() => {
    if (!queue.length) { setSelectedId(''); return; }
    if (!selectedId || !queue.some(call => call.id === selectedId)) setSelectedId(queue[0].id);
  }, [queue.map(call => call.id).join('|'), selectedId]);

  useEffect(() => {
    const unsubs = [];
    for (const entity of ['CallAssignment','CallNote','DispatchCall','OfficerWelfareCheck']) {
      try {
        const unsub = base44.entities[entity].subscribe(() => refetch());
        if (typeof unsub === 'function') unsubs.push(unsub);
      } catch {}
    }
    return () => unsubs.forEach(fn => fn());
  }, [refetch]);

  const selected = useMemo(() => queue.find(call => call.id === selectedId) || queue[0] || null, [queue, selectedId]);

  const changeStatus = async status => {
    if (!selected || working) return;
    if (status === 'Cleared' && !disposition.trim()) return toast.error('Enter a disposition before clearing this call.');
    setWorking(true);
    try {
      const response = await base44.functions.invoke('updateMyFieldCallStatus', { call_id:selected.id, status, disposition:status === 'Cleared' ? disposition.trim() : '' });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      if (status === 'Cleared') setDisposition('');
      await refetch();
      if (status === 'Cleared') {
        toast.success(data.next_call_number ? `Call cleared. Next call: ${data.next_call_number}.` : 'Call cleared. Your dispatch queue is clear.');
      } else {
        toast.success(`${status} recorded.`);
      }
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to update call status'); }
    finally { setWorking(false); }
  };

  const addNote = async () => {
    if (!selected || !note.trim() || working) return;
    setWorking(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.CallNote.create({ call_id:selected.id, author_id:me.id, author_name:me.unit_number ? `Unit ${me.unit_number}` : (me.full_name || me.email), note:`[FIELD] ${note.trim()}`, note_type:'update' });
      setNote('');
      await refetch();
      toast.success('Note shared with dispatch.');
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to add note'); }
    finally { setWorking(false); }
  };

  const respondWelfare = async action => {
    if (!selected?.welfare_check?.id || working) return;
    setWorking(true);
    try {
      const response = await base44.functions.invoke('manageOfficerWelfare', { action, check_id:selected.welfare_check.id });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(action === 'ok' ? 'Welfare OK sent to dispatch.' : 'Assistance request sent to dispatch and command.');
      await refetch();
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to respond to welfare check'); }
    finally { setWorking(false); }
  };

  const requestSupervisor = async () => {
    if (!selected || working) return;
    setWorking(true);
    try {
      const response = await base44.functions.invoke('requestSupervisorAssist', { call_id:selected.id });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      if (data.pending || data.request_recorded) toast.success(data.reason || 'Supervisor request sent and is awaiting an eligible supervisor.');
      else if (!data.assigned) toast.warning(data.reason || 'No eligible supervisor available right now.');
      else toast.success(`${data.supervisor?.name || 'Supervisor'} assigned${data.supervisor?.distance_miles != null ? ` (${data.supervisor.distance_miles} mi)` : ''}.`);
      await refetch();
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to request supervisor'); }
    finally { setWorking(false); }
  };

  const directions = () => {
    if (!selected) return;
    const target = selected.latitude && selected.longitude ? `${selected.latitude},${selected.longitude}` : selected.location;
    if (!target) return toast.error('This call has no mapped destination.');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`, '_blank', 'noopener,noreferrer');
  };

  const openReport = page => {
    if (!selected) return;
    const params = new URLSearchParams();
    params.set('call_id', selected.id);
    params.set('call_number', selected.agency_cad_number || selected.bps_reference || selected.call_id || selected.id);
    params.set('location', selected.location || '');
    params.set('incident', selected.incident || '');
    window.location.href = `${createPageUrl(page)}?${params.toString()}`;
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading dispatch queue…</div>;
  if (error) return <div className="p-6"><div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">Dispatch queue could not load: {error.message}</div></div>;

  return <div className="min-h-screen bg-[#050a12] p-3 text-white md:p-5">
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="rounded-2xl border border-cyan-500/30 bg-[#081522] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-300"/><h1 className="text-xl font-black tracking-tight md:text-2xl">Officer Dispatch Queue</h1></div><p className="mt-1 text-xs text-slate-400">Priority-ordered assigned calls. Clear one call and the next call automatically becomes your current call.</p></div><Badge className="bg-cyan-800 text-cyan-100">{queue.length} ACTIVE</Badge></div>
      </header>

      {!queue.length ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-10 text-center"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400"/><h2 className="text-lg font-black">QUEUE CLEAR</h2><p className="text-sm text-slate-400">No active calls are assigned to you.</p></div> : <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-2">
          {queue.map((call,index)=><button key={call.id} onClick={()=>setSelectedId(call.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id===call.id?'border-cyan-400 bg-cyan-950/40':'border-slate-700 bg-[#08111d] hover:border-slate-500'}`}>
            <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black text-slate-400">#{index+1} IN QUEUE</div><Badge className={priorityClass(call.priority)}>{String(call.priority||'medium').toUpperCase()}</Badge></div>
            <div className="mt-2 font-black">{call.agency_cad_number || call.bps_reference || call.call_id || call.id}</div><div className="text-sm text-slate-200">{call.incident || 'Call for service'}</div><div className="mt-1 text-xs text-slate-400">{call.location || 'Location pending'}</div><div className="mt-2 text-[10px] font-bold text-cyan-300">YOUR STATUS: {statusLabel(call.assignment?.status)}</div>
          </button>)}
        </aside>

        {selected && <main className="space-y-4">
          <section className="rounded-2xl border border-slate-700 bg-[#08111d] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold text-cyan-300">CAD {selected.agency_cad_number || selected.bps_reference || selected.call_id || selected.id}</div><h2 className="mt-1 text-2xl font-black">{selected.incident || 'Call for Service'}</h2><div className="mt-2 flex items-start gap-2 text-sm text-slate-300"><MapPinned className="mt-0.5 h-4 w-4 text-cyan-400"/>{selected.location || 'Location unavailable'}{selected.cross_street ? ` · Cross: ${selected.cross_street}` : ''}</div>{selected.description && <p className="mt-3 rounded-lg bg-slate-950 p-3 text-sm text-slate-300">{selected.description}</p>}</div><Badge className={priorityClass(selected.priority)}>{String(selected.priority||'medium').toUpperCase()}</Badge></div>
          </section>

          {selected.welfare_check && <section className="rounded-2xl border border-red-500/50 bg-red-950/25 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-black text-red-200"><HeartPulse className="h-5 w-5"/>WELFARE CHECK REQUESTED</div><div className="mt-1 text-xs text-slate-300">Dispatch is requesting your welfare status for this call.</div></div><div className="flex gap-2"><Button onClick={()=>respondWelfare('ok')} disabled={working} className="bg-emerald-700 hover:bg-emerald-600">WELFARE OK</Button><Button onClick={()=>respondWelfare('assist')} disabled={working} className="bg-red-700 hover:bg-red-600">NEED ASSISTANCE</Button></div></div></section>}

          <section className="grid gap-2 sm:grid-cols-4">
            <Button disabled={working || selected.assignment?.status==='accepted'} onClick={()=>changeStatus('Acknowledged')} className="bg-indigo-700 hover:bg-indigo-600">ACKNOWLEDGE</Button>
            <Button disabled={working} onClick={()=>changeStatus('Enroute')} className="bg-blue-700 hover:bg-blue-600"><Navigation className="mr-2 h-4 w-4"/>EN ROUTE</Button>
            <Button disabled={working} onClick={()=>changeStatus('On Scene')} className="bg-amber-700 hover:bg-amber-600">ON SCENE</Button>
            <Button disabled={working} onClick={directions} variant="outline" className="border-cyan-500 text-cyan-300"><MapPinned className="mr-2 h-4 w-4"/>DIRECTIONS</Button>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-[#08111d] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><MessageSquare className="h-4 w-4 text-cyan-300"/>SHARED CALL NOTES</h3><span className="text-[10px] text-slate-500">OFFICER + DISPATCH SEE THE SAME NOTES</span></div><div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-950/60 p-2">{!selected.dispatch_notes?.length?<div className="p-4 text-center text-xs text-slate-500">No notes yet.</div>:selected.dispatch_notes.slice().reverse().map(n=><div key={n.id} className="rounded-lg border border-slate-800 bg-[#0b1623] p-2"><div className="text-[10px] font-black text-cyan-300">{n.author_name || 'CAD USER'}</div><div className="mt-1 whitespace-pre-wrap text-xs text-slate-200">{n.note}</div></div>)}</div><div className="mt-3 flex gap-2"><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add note for dispatch and other assigned units…" rows={2}/><Button onClick={addNote} disabled={working || !note.trim()}><MessageSquare className="h-4 w-4"/></Button></div></section>

          <section className="grid gap-2 sm:grid-cols-3"><Button onClick={()=>openReport('IncidentReports')} variant="outline"><ClipboardList className="mr-2 h-4 w-4"/>INCIDENT REPORT</Button><Button onClick={()=>openReport('DailyActivityReports')} variant="outline"><ClipboardList className="mr-2 h-4 w-4"/>DAR</Button><Button onClick={requestSupervisor} disabled={working} className="bg-purple-700 hover:bg-purple-600"><ShieldAlert className="mr-2 h-4 w-4"/>REQUEST SUPERVISOR</Button></section>

          <section className="rounded-2xl border border-red-500/30 bg-red-950/15 p-4"><div className="flex items-center gap-2 font-black"><Siren className="h-4 w-4 text-red-400"/>CLEAR / DISPOSITION</div><p className="mt-1 text-xs text-slate-400">Disposition is required. Clearing removes this call from your queue and automatically advances you to the next assigned call.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input value={disposition} onChange={e=>setDisposition(e.target.value)} placeholder="Disposition (required), e.g. assisted, unfounded, report taken…"/><Button onClick={()=>changeStatus('Cleared')} disabled={working || !disposition.trim()} className="bg-red-700 hover:bg-red-600"><CheckCircle2 className="mr-2 h-4 w-4"/>CLEAR CALL</Button></div></section>
        </main>}
      </div>}
    </div>
  </div>;
}