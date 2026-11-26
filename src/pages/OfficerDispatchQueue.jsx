import '@/components/dispatch/cad-workstations.css';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { useEffect, useMemo, useRef, useState } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, MapPinned, MessageSquare, Navigation, ShieldAlert, Siren, HeartPulse, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

const statusLabel = status => String(status || 'pending').replaceAll('_', ' ').toUpperCase();
const priorityClass = priority => ({ critical:'bg-red-700', high:'bg-orange-600', medium:'bg-amber-600', low:'bg-slate-600' }[String(priority||'').toLowerCase()] || 'bg-slate-600');

export default function OfficerDispatchQueue() {
  const [queueSearch,setQueueSearch]=useState('');
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [disposition, setDisposition] = useState('');
  const [working, setWorking] = useState(false);
  const actionLock = useRef(false);
  const queryClient = useQueryClient();


  const { data: payload = {}, isLoading, isFetching:queueFetching, dataUpdatedAt:queueUpdatedAt, error, refetch } = useQuery({
    queryKey: ['myDispatchQueue'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getMyDispatchQueue', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 15000,
  });

  useEffect(()=>{
    const refresh=()=>{void queryClient.invalidateQueries({queryKey:['myDispatchQueue']});};
    window.addEventListener('officer-distress-cleared',refresh);
    let unsubscribe;try{unsubscribe=base44.entities.CallAssignment.subscribe(refresh);}catch{}
    return()=>{window.removeEventListener('officer-distress-cleared',refresh);unsubscribe?.();};
  },[queryClient]);
  const queue = payload.queue || [];
  const visibleQueue=queue.filter(call=>[call.agency_cad_number,call.bps_reference,call.call_id,call.incident,call.location].join(' ').toLowerCase().includes(queueSearch.toLowerCase()));
  useEffect(() => {
    if (!queue.length) { setSelectedId(''); return; }
    if (!selectedId || !queue.some(call => call.id === selectedId)) setSelectedId(queue[0].id);
  }, [queue.map(call => call.id).join('|'), selectedId]);

  // Shared notes are a dedicated query. They refresh on note events without
  // touching local officer status or refetching the whole dispatch queue.
  const {data:sharedNotes=[],isFetching:notesFetching,error:notesError,dataUpdatedAt:notesUpdatedAt,refetch:refetchNotes}=useQuery({
    queryKey:['sharedCadTimeline',selectedId],
    enabled:!!selectedId,
    queryFn:async()=>{
      const response=await base44.functions.invoke('sharedCadTimeline',{action:'read',call_id:selectedId});
      const data=response?.data||response||{};
      if(!data.success)throw new Error(data.error||'Shared notes are unavailable');
      return Array.isArray(data.notes)?data.notes:[];
    },
    staleTime:15000,refetchInterval:45000,refetchIntervalInBackground:false,
    refetchOnWindowFocus:true,
  });
  useEffect(()=>{
    if(!selectedId)return;
    let timer;
    const onNote=event=>{
      if(String(event?.data?.call_id||'')!==String(selectedId))return;
      clearTimeout(timer);timer=setTimeout(()=>refetchNotes(),450);
    };
    let unsubscribe;
    try{unsubscribe=base44.entities.CallNote.subscribe(onNote);}catch{}
    return()=>{clearTimeout(timer);unsubscribe?.();};
  },[selectedId,refetchNotes]);

  const selected = useMemo(() => queue.find(call => call.id === selectedId) || queue[0] || null, [queue, selectedId]);

  const refreshQueue = async () => {
    if (working || queueFetching) return;
    clearBase44ReadCacheMatching('function:getMyDispatchQueue:');
    const result = await refetch({cancelRefetch:false});
    if (result.isError) toast.error('Queue refresh failed. Please retry.');
  };
  const refreshNotes = async () => {
    if (working || notesFetching || !selectedId) return;
    clearBase44ReadCacheMatching('function:sharedCadTimeline:');
    const result = await refetchNotes({cancelRefetch:false});
    if (result.isError) toast.error('CAD notes refresh failed. Please retry.');
  };
  const queueRefreshButton = <Button type="button" variant="outline" disabled={working || queueFetching} onClick={refreshQueue} className="min-h-11 border-cyan-500 bg-slate-900 text-cyan-100 hover:bg-slate-800"><RefreshCw className={`mr-2 h-4 w-4 ${queueFetching?'animate-spin':''}`}/>{queueFetching?'Refreshing…':'Refresh queue'}</Button>;
  const updatedLabel = timestamp => timestamp ? new Date(timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Not synced yet';

  const changeStatus = async status => {
    if (!selected || working || actionLock.current) return;
    if (status === 'Cleared' && !disposition.trim()) return toast.error('Enter a disposition before clearing this call.');
    actionLock.current = true;
    setWorking(true);
    const callId = selected.id;
    try {
      const response = await base44.functions.invoke('updateMyFieldCallStatus', { call_id:selected.id, status, disposition:status === 'Cleared' ? disposition.trim() : '' });
      const data = response?.data || response || {};
      if (!data.success || data.error) throw new Error(data.error || 'Call status was not saved');
      const savedStatus = data.status || status;
      const assignmentStatus = {Acknowledged:'accepted',Enroute:'enroute','On Scene':'on_scene',Cleared:'cleared'}[savedStatus];
      await queryClient.cancelQueries({queryKey:['myDispatchQueue']});
      queryClient.setQueryData(['myDispatchQueue'], old => {
        const rows = (old?.queue || []).filter(c => savedStatus !== 'Cleared' || c.id !== callId).map(c => c.id === callId ? {...c,assignment:{...c.assignment,status:assignmentStatus}} : c);
        return {...old,queue:rows,count:rows.length,current_call_id:rows[0]?.id || ''};
      });
      if (savedStatus === 'Cleared') {setDisposition('');setSelectedId(data.next_call_id || '');}
      else void refetchNotes();
      void queryClient.invalidateQueries({queryKey:['myDispatchQueue']});
      if (status === 'Cleared') {
        toast.success(data.next_call_number ? `Call cleared. Next call: ${data.next_call_number}.` : 'Call cleared. Your dispatch queue is clear.');
      } else {
        toast.success(`${savedStatus} recorded.`);
      }
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to update call status'); }
    finally { actionLock.current = false; setWorking(false); }
  };

  const addNote = async () => {
    if (!selected || !note.trim() || working) return;
    setWorking(true);
    try {
      const response=await base44.functions.invoke('sharedCadTimeline',{action:'post',call_id:selected.id,note:`[FIELD UPDATE] ${note.trim()}`});
      const saved=response?.data||response||{};
      if(!saved.success)throw new Error(saved.error||'CAD note was not saved');
      setNote('');
      await refetchNotes();
      toast.success('Note saved to the shared officer / dispatch CAD log.');
    } catch (e) { toast.error(e?.response?.data?.error || e?.message || 'Unable to add note'); }
    finally { setWorking(false); }
  };

  const respondWelfare = async action => {
    if (!selected || working) return;
    setWorking(true);
    try {
      const response = await base44.functions.invoke('manageOfficerWelfare', { action:action==='ok'&&!selected.welfare_check?'self_ok':action, call_id:selected.id,check_id:selected.welfare_check?.id });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      toast.success(action === 'ok' ? 'Welfare OK sent to dispatch.' : 'Assistance request sent to dispatch and command.');
      await Promise.all([refetch(),refetchNotes()]);
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
      await Promise.all([refetch(),refetchNotes()]);
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

  if (isLoading || (error && !payload.queue)) return <div className="p-6 text-slate-200"><div className="rounded-xl border border-slate-600 bg-slate-900 p-4 space-y-3"><p role="status">{isLoading?'Loading dispatch queue…':'Dispatch queue could not load: '+error.message}</p>{queueRefreshButton}</div></div>;

  return <div className="pf-cad-workspace pf-officer-workspace min-h-full text-white">
    <div className="pf-officer-content">
      <header className="pf-cad-heading"><div><div className="pf-cad-eyebrow">Operations / Field response</div><h1>Officer Queue</h1><p>Respond, document and clear your assigned calls.</p></div><div className="pf-cad-actions"><span role="status" className="pf-cad-sync">{queueFetching?'Updating…':error?'Refresh failed':`Updated ${updatedLabel(queueUpdatedAt)}`}</span>{queueRefreshButton}</div></header>
      <div className="pf-cad-metrics pf-officer-metrics">
        <div className="pf-cad-metric"><span>Assigned calls</span><strong>{queue.length}</strong></div>
        <div className="pf-cad-metric"><span>Critical / high</span><strong className="text-red-300">{queue.filter(c=>['critical','high'].includes(String(c.priority).toLowerCase())).length}</strong></div>
        <div className="pf-cad-metric"><span>Current assignment</span><strong className="pf-officer-ref">{queue[0]?.agency_cad_number||queue[0]?.bps_reference||queue[0]?.call_id||'None'}</strong></div>
      </div>
      {!queue.length ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-10 text-center"><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400"/><h2 className="text-lg font-black">Queue clear</h2><p className="text-sm text-slate-400">No active calls are assigned to you.</p></div> : <div className="pf-officer-grid">
        <aside className="pf-cad-panel pf-officer-list"><div className="pf-cad-panel-head"><h2>Assigned calls <span className="pf-cad-count">{queue.length}</span></h2></div><Input aria-label="Find an assigned call" value={queueSearch} onChange={e=>setQueueSearch(e.target.value)} placeholder="Find reference, incident or location" className="border-slate-600 bg-slate-900"/>{!visibleQueue.length&&<p className="p-4 text-sm text-slate-400">No matching assigned calls.</p>}
          {visibleQueue.map((call)=><button key={call.id} disabled={working} onClick={()=>{setSelectedId(call.id);setDisposition('');setNote('');}} aria-pressed={selected?.id===call.id} className={`pf-officer-call w-full rounded-xl border p-3 text-left transition ${selected?.id===call.id?'border-cyan-400 bg-cyan-950/40':'border-slate-700 bg-[#08111d] hover:border-slate-500'}`}>
            <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black text-slate-400">#{queue.indexOf(call)+1} IN QUEUE</div><Badge className={priorityClass(call.priority)}>{String(call.priority||'medium').toUpperCase()}</Badge></div>
            <div className="mt-2 font-black">{call.agency_cad_number || call.bps_reference || call.call_id || call.id}</div><div className="text-sm text-slate-200">{call.incident || 'Call for service'}</div><div className="mt-1 text-xs text-slate-400">{call.location || 'Location pending'}</div><div className="mt-2 text-[10px] font-bold text-cyan-300">YOUR STATUS: {statusLabel(call.assignment?.status)} · {call.assigned_officers?.find(u=>u.role==='primary')?.officer_name||'Primary pending'} (PRIMARY)</div>
          </button>)}
        </aside>

        {selected && <main className="pf-officer-detail min-w-0">
          <section className="pf-cad-panel pf-officer-summary p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold text-cyan-300">CAD {selected.agency_cad_number || selected.bps_reference || selected.call_id || selected.id}</div><h2 className="mt-1 text-2xl font-black">{selected.incident || 'Call for Service'}</h2><div className="mt-2 flex items-start gap-2 text-sm text-slate-300"><MapPinned className="mt-0.5 h-4 w-4 text-cyan-400"/>{selected.location || 'Location unavailable'}{selected.cross_street ? ` · Cross: ${selected.cross_street}` : ''}</div>{selected.description && <p className="mt-3 rounded-lg bg-slate-950 p-3 text-sm text-slate-300">{selected.description}</p>}</div><Badge className={priorityClass(selected.priority)}>{String(selected.priority||'medium').toUpperCase()}</Badge></div>
          </section>

          {selected.welfare_check && <section className="rounded-2xl border border-red-500/50 bg-red-950/25 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-black text-red-200"><HeartPulse className="h-5 w-5"/>Welfare check requested</div><div className="mt-1 text-xs text-slate-300">Dispatch is requesting your welfare status for this call.</div></div><div className="flex gap-2"><Button onClick={()=>respondWelfare('ok')} disabled={working} className="bg-emerald-700 hover:bg-emerald-600">Welfare OK</Button><Button onClick={()=>respondWelfare('assist')} disabled={working} className="bg-red-700 hover:bg-red-600">Need assistance</Button></div></div></section>}

          <section className="pf-cad-panel pf-officer-response"><div className="pf-cad-panel-head"><div><div className="pf-cad-eyebrow">Response workflow</div><h2>Update response status</h2></div><span className="pf-cad-count">{statusLabel(selected.assignment?.status)}</span></div><div className="pf-response-steps">{[['pending','Assigned'],['accepted','Acknowledged'],['enroute','En route'],['on_scene','On scene']].map(([id,label],i)=>{const current=Math.max(0,['pending','accepted','enroute','on_scene'].indexOf(selected.assignment?.status||'pending'));return <div key={id} data-step={i<current?'done':i===current?'current':'next'}><span>{i<current?'✓':i+1}</span>{label}</div>;})}</div><div className="pf-officer-response-buttons">
            <Button disabled={working || ['accepted','enroute','on_scene'].includes(selected.assignment?.status)} onClick={()=>changeStatus('Acknowledged')} className="bg-indigo-700 hover:bg-indigo-600"><CheckCircle2 className="mr-2 h-4 w-4"/>{['accepted','enroute','on_scene'].includes(selected.assignment?.status)?'Acknowledged':'Acknowledge call'}</Button>
            <Button disabled={working} onClick={()=>changeStatus('Enroute')} className="bg-blue-700 hover:bg-blue-600"><Navigation className="mr-2 h-4 w-4"/>En route</Button>
            <Button disabled={working} onClick={()=>changeStatus('On Scene')} className="bg-amber-700 hover:bg-amber-600">On scene</Button>
            <Button disabled={working} onClick={directions} variant="outline" className="border-cyan-500 text-cyan-300"><MapPinned className="mr-2 h-4 w-4"/>Directions</Button>
          </div></section>

          <section className="rounded-2xl border border-cyan-500/30 bg-[#08111d] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black text-cyan-200">Officer welfare status</div><p className="mt-1 text-xs text-slate-400">Transmit a verified welfare OK to dispatch at any time while assigned.</p></div><Button disabled={working} onClick={()=>respondWelfare('ok')} className="bg-emerald-700 hover:bg-emerald-600"><HeartPulse className="mr-2 h-4 w-4"/>Send welfare OK</Button></div></section>

          {!!selected.assigned_officers?.length&&<section className="pf-cad-panel pf-officer-section p-4"><h3 className="mb-2 font-black text-cyan-300">ASSIGNED UNITS · LIVE STATUS</h3><div className="flex flex-wrap gap-2">{selected.assigned_officers.map((officer,index)=><div key={`${officer.unit_id}-${index}`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"><div className="font-bold">{officer.officer_name}</div><div className="mt-1 text-slate-400"><span className={officer.role==='primary'?'font-black text-emerald-300':'font-bold text-cyan-300'}>{officer.role==='primary'?'PRIMARY UNIT':'ADDITIONAL UNIT'}</span> · {statusLabel(officer.status)}</div></div>)}</div></section>}
          <section className="pf-cad-panel pf-officer-section p-4"><div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><MessageSquare className="h-4 w-4 text-cyan-300"/>Shared call notes and activity</h3><Button type="button" variant="outline" disabled={working || notesFetching} onClick={refreshNotes} className="min-h-10 border-cyan-500 bg-slate-900 text-cyan-100 hover:bg-slate-800"><RefreshCw className={`mr-2 h-4 w-4 ${notesFetching?'animate-spin':''}`}/>{notesFetching?'Refreshing…':'Refresh notes'}</Button></div><p role="status" className="mb-2 text-xs text-slate-400">{notesFetching?'Updating CAD notes…':notesError?'Notes refresh failed — retry above.':`Notes updated: ${updatedLabel(notesUpdatedAt)}`}</p><div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-950/60 p-2">{!sharedNotes.length?<div className="p-4 text-center text-xs text-slate-500">No notes yet.</div>:sharedNotes.slice().reverse().map(n=><div key={n.id} className="rounded-lg border border-slate-800 bg-[#0b1623] p-2"><div className="text-[10px] font-black text-cyan-300">{n.author_name || 'CAD USER'}</div><div className="mt-1 whitespace-pre-wrap text-xs text-slate-200">{n.note}</div><div className="mt-1 text-[10px] text-slate-500">{n.created_date?new Date(n.created_date).toLocaleString():''}{n.kind==='activity'?' · CAD ACTIVITY':''}</div></div>)}</div><div className="mt-3 flex gap-2"><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add note for dispatch and other assigned units…" rows={2}/><Button onClick={addNote} disabled={working || !note.trim()}><MessageSquare className="mr-2 h-4 w-4"/>Post note</Button></div></section>

          <section className="grid gap-2 sm:grid-cols-3"><Button onClick={()=>openReport('IncidentReports')} variant="outline"><ClipboardList className="mr-2 h-4 w-4"/>Incident report</Button><Button onClick={()=>openReport('DailyActivityReports')} variant="outline"><ClipboardList className="mr-2 h-4 w-4"/>DAR</Button><Button onClick={requestSupervisor} disabled={working} className="bg-purple-700 hover:bg-purple-600"><ShieldAlert className="mr-2 h-4 w-4"/>Request supervisor</Button></section>

          <section className="pf-cad-panel pf-officer-clear p-4"><div className="flex items-center gap-2 font-black"><Siren className="h-4 w-4 text-red-400"/>Clear / disposition</div><p className="mt-1 text-xs text-slate-400">Disposition is required. Clearing removes this call from your queue and automatically advances you to the next assigned call.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input value={disposition} onChange={e=>setDisposition(e.target.value)} placeholder="Disposition (required), e.g. assisted, unfounded, report taken…"/><Button onClick={()=>changeStatus('Cleared')} disabled={working || !disposition.trim()} className="bg-red-700 hover:bg-red-600"><CheckCircle2 className="mr-2 h-4 w-4"/>Clear call</Button></div></section>
        </main>}
      </div>}
    </div>
  </div>;
}