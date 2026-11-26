import '@/components/dispatch/cad-center-terminal.css';
import '@/components/dispatch/cad-workstations.css';
import '@/components/dispatch/tactical-console.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, MapPinned, MessageSquare, Navigation, ShieldAlert, HeartPulse, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatEasternTime,formatEasternDateTime } from '@/lib/easternTime';
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
  const detailPanelRef=useRef(null);
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

  return <div className="tac-console tac-mdt cad-mdt-terminal">
    <header className="tac-header"><div className="tac-brand"><ShieldAlert size={24}/><div><small>BLACK POINT · MOBILE DATA TERMINAL</small><h1>Field response</h1></div></div><div className="tac-header-actions"><span className="tac-feed-state"><i data-state={error?'warning':queueFetching?'loading':'ready'}/>{queueFetching?'SYNCING':error?'REFRESH FAILED':`UPDATED ${updatedLabel(queueUpdatedAt)}`}</span>{queueRefreshButton}</div></header>
    {!selected?<section className="tac-mdt-idle"><CheckCircle2 size={38}/><h2>Queue clear</h2><p>No active calls are assigned to you.</p></section>:<>
      <div className="tac-mdt-current" ref={detailPanelRef} data-priority={String(selected.priority||'medium').toLowerCase()}><div><small>SELECTED ASSIGNMENT · {queue.indexOf(selected)+1} OF {queue.length}</small><h2>{selected.incident||'Call for service'}</h2><p><MapPinned size={19}/>{selected.location||'Location unavailable'}</p></div><div className="tac-mdt-reference"><Badge className={priorityClass(selected.priority)}>{String(selected.priority||'medium').toUpperCase()}</Badge><strong>{selected.agency_cad_number||selected.bps_reference||selected.call_id||selected.id}</strong><span>{statusLabel(selected.assignment?.status)} · {String(selected.assignment?.role||'role unverified').toUpperCase()}</span></div></div>
      {selected.welfare_check&&<div className="tac-mdt-welfare" role="alert"><HeartPulse size={23}/><div><b>WELFARE CHECK REQUESTED</b><p>Dispatch is requesting your welfare status.</p></div><button disabled={working} onClick={()=>respondWelfare('ok')}>Welfare OK</button><button className="tac-danger" disabled={working} onClick={()=>respondWelfare('assist')}>Need assistance</button></div>}
      <div className="tac-mdt-actionbar">
        <button data-phase={['accepted','enroute','on_scene'].includes(selected.assignment?.status)?'done':'ready'} disabled={working||['accepted','enroute','on_scene'].includes(selected.assignment?.status)} onClick={()=>changeStatus('Acknowledged')}><CheckCircle2 size={22}/><span>{['accepted','enroute','on_scene'].includes(selected.assignment?.status)?'Acknowledged':'Acknowledge'}</span></button>
        <button data-phase={selected.assignment?.status==='enroute'?'current':'ready'} disabled={working} onClick={()=>changeStatus('Enroute')}><Navigation size={22}/><span>En route</span></button>
        <button data-phase={selected.assignment?.status==='on_scene'?'current':'ready'} disabled={working} onClick={()=>changeStatus('On Scene')}><MapPinned size={22}/><span>On scene</span></button>
        <button disabled={working} onClick={directions}><Navigation size={22}/><span>Directions</span></button>
        <button data-phase="done" disabled={working} onClick={()=>respondWelfare('ok')}><HeartPulse size={22}/><span>Welfare OK</span></button>
        <button disabled={working} onClick={requestSupervisor}><ShieldAlert size={22}/><span>Supervisor</span></button>
      </div>
      <div className="cad-mdt-body"><div className="tac-mdt-grid">
       <div className="tac-mdt-main">
        <section className="tac-mdt-pane"><div className="tac-panel-bar"><span>Incident information</span><span>{selected.agency||'BPS'}</span></div><dl className="tac-mdt-facts">{[['Received',formatEasternDateTime(selected.time_received||selected.created_date)+' ET'],['Cross street',selected.cross_street||'Not recorded'],['District / zone',selected.district||selected.zone||'Not recorded'],['Caller',selected.caller_name||'Not recorded'],['Callback',selected.caller_phone||'Not recorded'],['Assignment',String(selected.assignment?.role||'Not verified')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.hazards&&<p className="tac-warning">SAFETY ALERT · {selected.hazards}</p>}<div className="tac-mdt-narrative"><small>INCIDENT NARRATIVE</small><p>{selected.description||'No narrative recorded.'}</p></div></section>
        <section className="tac-mdt-pane"><div className="tac-panel-bar"><span>Shared CAD log</span><button disabled={working||notesFetching} onClick={refreshNotes}><RefreshCw size={14}/> Refresh</button></div><div className="tac-log-status" role="status">{notesFetching?'Updating activity…':notesError?'Activity unavailable — retry':`Updated ${updatedLabel(notesUpdatedAt)}`}</div><div className="tac-mdt-log">{sharedNotes.length?sharedNotes.slice().reverse().map(n=><article key={n.id}><div><time>{formatEasternTime(n.created_date)} ET</time><b>{n.author_name||'CAD user'}</b>{n.kind==='activity'&&<span>CAD EVENT</span>}</div><p>{n.note}</p></article>):<p className="tac-empty">{notesError?'Unable to load notes':notesFetching?'Loading notes…':'No recorded notes yet'}</p>}</div><div className="tac-mdt-compose"><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Enter a field update for dispatch…" rows={3}/><button className="tac-primary" onClick={addNote} disabled={working||!note.trim()}><MessageSquare size={16}/> Post update</button></div></section>
       </div>
       <aside className="tac-mdt-side">
        <section className="tac-mdt-pane"><div className="tac-panel-bar"><span>Assigned units</span><b>{selected.assigned_officers?.length||0}</b></div>{selected.assigned_officers?.length?selected.assigned_officers.map((u,i)=><div className="tac-unit-row" key={`${u.unit_id}-${i}`}><strong>{u.officer_name||'Officer'}</strong><small>{u.role==='primary'?'PRIMARY':'ADDITIONAL'}</small><span>{statusLabel(u.status)}</span></div>):<p className="tac-empty">No unit details recorded</p>}</section>
        <section className="tac-mdt-pane"><div className="tac-panel-bar"><span>Reports / documentation</span></div><div className="tac-mdt-report-buttons"><button onClick={()=>openReport('IncidentReports')}><ClipboardList size={17}/> Incident report</button><button onClick={()=>openReport('DailyActivityReports')}><ClipboardList size={17}/> Daily activity report</button></div></section>
        <section className="tac-mdt-pane tac-clearance"><div className="tac-panel-bar"><span>Clearance / disposition</span></div><div className="tac-clearance-body"><p>Record the outcome before clearing. The next assigned call will open automatically.</p><Textarea value={disposition} onChange={e=>setDisposition(e.target.value)} placeholder="Disposition required…" rows={3}/><button className="tac-danger" onClick={()=>changeStatus('Cleared')} disabled={working||!disposition.trim()}><CheckCircle2 size={18}/> Clear assignment</button></div></section>
       </aside>
      </div>
      <section className="tac-mdt-pane tac-mdt-queue"><div className="tac-panel-bar"><span>Assignment stack · {queue.length} total</span><span>{Math.max(0,queue.length-1)} other calls</span></div><div className="tac-filters"><input aria-label="Find assigned call" value={queueSearch} onChange={e=>setQueueSearch(e.target.value)} placeholder="Search assignment stack"/></div><div className="tac-mdt-queue-list">{visibleQueue.map(call=><button key={call.id} data-priority={String(call.priority||'medium').toLowerCase()} aria-pressed={selected.id===call.id} disabled={working} onClick={()=>{if(selected.id===call.id)return;if((note.trim()||disposition.trim())&&!window.confirm('Switch call and discard unsaved note or disposition?'))return;setSelectedId(call.id);setNote('');setDisposition('');detailPanelRef.current?.scrollIntoView({block:'start',behavior:'smooth'});}}><span>#{queue.indexOf(call)+1} · {selected.id===call.id?'SELECTED':statusLabel(call.assignment?.status)}</span><b>{call.incident||'Call for service'}</b><small>{call.location||'Location pending'}</small><small>{call.agency_cad_number||call.bps_reference||call.call_id||call.id}</small></button>)}{!visibleQueue.length&&<p className="tac-empty">No matching assignments</p>}</div></section>
      </div>
    </>}
  </div>;
}
