import './cad-workstations.css';
import IncidentPrioritySelect from './IncidentPrioritySelect';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import { lookupDistrict } from '@/utils/districtLookup';
import { comparePersonnel } from '@/utils/rankPolicy';
import { Radio, Search, Users, RefreshCw, ArrowRight, MapPin, Clock3, ChevronRight, ShieldCheck } from 'lucide-react';

export default function LiveCommandWorkspace({calls=[],allCalls=[],units=[],loading,syncStatus={},rateLimited,onRefresh,onOpen,selectedCall,onClose,onMap,onDispatch,onPriority,onClear,canChangePriority,canClear,priorityOf,identifierOf,incidentOf,timeOf,elapsedOf,elapsedTimestampOf,isExternal,actions,settings,rosterLoading=false,rosterError='',onRetryRoster}){
 const [query,setQuery]=useState(''),[agency,setAgency]=useState('all'),[focus,setFocus]=useState('all'),[unitSearch,setUnitSearch]=useState(''),[working,setWorking]=useState(''),[error,setError]=useState('');
 const [utilityPanel,setUtilityPanel]=useState(null);
 const [districts,setDistricts]=useState({});
 const districtCache=useRef(new Map());
 useEffect(()=>{
  let cancelled=false;
  const candidates=allCalls.filter(c=>Number.isFinite(Number(c.latitude))&&Number.isFinite(Number(c.longitude))&&
    !(Number(c.latitude)===0&&Number(c.longitude)===0));
  const pending=[...new Map(candidates.map(c=>[`${Number(c.latitude).toFixed(5)},${Number(c.longitude).toFixed(5)}`,c])).entries()]
    .filter(([key])=>!districtCache.current.has(key)).slice(0,80);
  // Bound network work on an incident-heavy dispatch screen; never geocode during render.
  (async()=>{
   for(let i=0;i<pending.length && !cancelled;i+=4){
    await Promise.all(pending.slice(i,i+4).map(async([key,c])=>{
     const value=await lookupDistrict(Number(c.latitude),Number(c.longitude)).catch(()=> '—');
     if(!cancelled){districtCache.current.set(key,value);setDistricts(old=>({...old,[key]:value}));}
    }));
   }
  })();
  return()=>{cancelled=true;};
 },[allCalls.map(c=>`${c.id}:${c.latitude}:${c.longitude}`).join('|')]);
 const callDistrict=call=>{
  const lat=Number(call.latitude),lng=Number(call.longitude);
  const key=`${lat.toFixed(5)},${lng.toFixed(5)}`;
  return Number.isFinite(lat)&&Number.isFinite(lng)&&!(lat===0&&lng===0)
   ? districts[key]||districtCache.current.get(key)||'Checking district…'
   : call.district||call.beat||call.zone||'District unavailable';
 };
 const needsDispatch=call=>!(call.assigned_units||[]).length;
 const critical=allCalls.filter(c=>['critical','high'].includes(priorityOf(c)));
 const available=units.filter(u=>u.status==='Available'&&!u.connection_stale&&(u.presence_online===true||u.session_active===true));
 const priorities={critical:{label:'P1 · Critical',style:'border-red-500/60 bg-red-950/50 text-red-200'},high:{label:'P2 · High',style:'border-orange-500/50 bg-orange-950/40 text-orange-200'},medium:{label:'P3 · Standard',style:'border-amber-600/40 bg-amber-950/30 text-amber-200'},low:{label:'P4 · Low',style:'border-sky-500/40 bg-sky-950/30 text-sky-200'}};
 const visible=calls.filter(c=>(agency==='all'||agency==='external'&&isExternal(c)||c.agency===agency)&&(focus==='all'||focus==='unassigned'&&needsDispatch(c)||focus==='urgent'&&['critical','high'].includes(priorityOf(c)))&&[incidentOf(c),c.location,c.cross_street,identifierOf(c).value].join(' ').toLowerCase().includes(query.toLowerCase()));
 // Chronological board, not priority-sorted: newest/shortest elapsed first,
 // oldest/longest elapsed last. Use the same timestamp as the visible timer.
 // Unknown timestamps remain at the bottom with a deterministic tie-break.
 visible.sort((a,b)=>{
  const at=elapsedTimestampOf?.(a),bt=elapsedTimestampOf?.(b);
  if(!at&&!bt)return String(a.id||'').localeCompare(String(b.id||''));
  if(!at)return 1;
  if(!bt)return -1;
  return bt-at||String(a.id||'').localeCompare(String(b.id||''));
 });
 const officers=units.filter(u=>[u.rank,u.last_name,u.unit_number,u.platoon,u.status].join(' ').toLowerCase().includes(unitSearch.toLowerCase())).sort(comparePersonnel);
 const detail=selectedCall?(allCalls.find(call=>call.id===selectedCall.id)||selectedCall):null;
 const run=async(key,task)=>{if(working)return;setWorking(key);setError('');try{await task();}catch(e){setError(e?.response?.data?.error||e.message||'Action could not be saved.');}finally{setWorking('');}};
 return <div className="live-command-workspace pf-cad-workspace pf-command-workspace min-h-full min-w-0 text-slate-100">
  <header className="pf-cad-heading"><div><div className="pf-cad-eyebrow">Operations / Command</div><h1>Command Board</h1><p>Monitor incidents and response readiness.</p></div><div className="pf-cad-actions"><button type="button" className="pf-cad-button" onClick={onRefresh}><RefreshCw size={16}/> Refresh</button>{actions}</div></header>
  {critical.length>0&&<div className="pf-cad-alert"><span className="pf-cad-dot pf-cad-dot-danger"/><strong>{critical.length} priority response{critical.length===1?'':'s'} active</strong><button type="button" onClick={()=>setFocus('urgent')}>Review priority incidents <ArrowRight size={15}/></button></div>}
  {(error||syncStatus.state==='error'&&syncStatus.error)&&<div role="alert" className="mb-4 rounded-xl border border-red-700 bg-red-950/40 p-4 text-sm text-red-100">{error||syncStatus.error}</div>}
  <div className="pf-cad-metrics">{[
   {id:'all',label:'Active incidents',value:loading&&!allCalls.length?'—':allCalls.length,detail:'All current calls',color:'text-white'},
   {id:'unassigned',label:'Needs dispatch',value:allCalls.filter(needsDispatch).length,detail:'No assigned unit',color:'text-amber-300'},
   {id:'urgent',label:'Priority response',value:critical.length,detail:'Critical and high priority',color:'text-red-300'},
   {id:'resources',label:'Available officers',value:available.length,detail:'Online and ready',color:'text-emerald-300'}
  ].map(metric=><button type="button" key={metric.id} onClick={()=>metric.id==='resources'?setUtilityPanel('resources'):setFocus(metric.id)} aria-pressed={metric.id!=='resources'&&focus===metric.id} className="pf-cad-metric"><span className="text-xs font-medium text-slate-400">{metric.label}</span><strong className={'mt-1 block text-2xl font-black '+metric.color}>{metric.value}</strong><span className="mt-1 block text-xs text-slate-500">{metric.detail}</span></button>)}</div>
  <div className="pf-command-grid">
   <section className="pf-cad-panel pf-command-incidents" aria-label="Live incident queue">
    <div className="pf-cad-panel-head"><div><div className="pf-cad-eyebrow">Incident stream</div><h2><Radio size={19}/> Active calls <span className="pf-cad-count">{visible.length}</span></h2></div><button type="button" className="pf-cad-button" onClick={()=>{setFocus('all');setAgency('all');setQuery('');}}>Reset filters</button></div>
    <div className="pf-cad-filter-bar"><label className="pf-cad-search"><Search size={17}/><input aria-label="Search live incidents" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search incident, address or reference"/></label><select aria-label="Filter live command by agency" value={agency} onChange={e=>setAgency(e.target.value)}><option value="all">All agencies</option>{[...new Set(allCalls.map(c=>c.agency).filter(Boolean))].sort().map(a=><option key={a}>{a}</option>)}{allCalls.some(isExternal)&&<option value="external">PulsePoint</option>}</select></div>
    <div className="pf-cad-list-caption"><span>Newest first · shortest elapsed</span><span>{focus==='urgent'?'Priority incidents':focus==='unassigned'?'Unassigned calls':'All active incidents'}</span></div>
    <div className="pf-command-stream">
    {visible.map(call=>{const p=priorities[priorityOf(call)]||priorities.medium;return <article key={call.id} className="pf-command-call" data-priority={priorityOf(call)} data-selected={detail?.id===call.id}>
     <div className="pf-command-call-main"><div className="pf-call-meta"><span className={'cad-priority border '+p.style}>{p.label}</span><span>{identifierOf(call).value}</span><span>{call.agency||'BPS'}</span>{isExternal(call)&&<span className="text-red-300">PulsePoint</span>}<span className="pf-call-elapsed"><Clock3 size={14}/> {elapsedOf(call)||'—'}</span></div>
      <button type="button" className="pf-call-title" onClick={()=>onOpen(call)}>{incidentOf(call)} <ChevronRight size={16}/></button>
      <p className="pf-call-address"><MapPin size={15}/>{call.location||'Location pending'}{call.cross_street?' / '+call.cross_street:''}</p>
      <div className="pf-call-secondary"><span>{timeOf(call.time_received||call.created_date)} ET</span><span>{callDistrict(call)}</span><span>{(call.assigned_units||[]).length} assigned</span><span>{call.status||'Active'}</span></div>
     </div><div className="pf-call-actions"><button type="button" onClick={()=>onDispatch?.(call)} className="pf-cad-primary">Dispatch <ArrowRight size={15}/></button><button type="button" onClick={()=>onMap(call)} className="pf-cad-button">Map</button><button type="button" onClick={()=>onOpen(call)} className="pf-cad-button">Details</button>{canChangePriority&&<IncidentPrioritySelect call={call} priority={priorityOf(call)} onSave={onPriority} disabled={!!working}/>}</div>
    </article>;})}
    {!visible.length&&<div className="pf-cad-empty"><Radio size={28}/><strong>{loading?'Loading incidents…':allCalls.length?'No matching incidents':'No active incidents'}</strong></div>}
    </div>
   </section>
   <aside className="pf-command-sidebar">
    <section className="pf-cad-panel"><div className="pf-cad-panel-head"><div><div className="pf-cad-eyebrow">Field resources</div><h2><Users size={18}/> Unit readiness</h2></div><button type="button" onClick={()=>setUtilityPanel('resources')} className="pf-cad-button">View all</button></div>
      <div className="pf-resource-summary"><span><strong className="text-emerald-300">{available.length}</strong> Available</span><span><strong>{units.length}</strong> Roster</span></div>
      {rosterError&&<p role="alert" className="pf-cad-warning">{rosterError}</p>}
      <div className="pf-cad-filter-bar"><label className="pf-cad-search"><Search size={16}/><input aria-label="Find field officer" placeholder="Find officer or unit" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)}/></label><button type="button" className="pf-cad-button" disabled={rosterLoading} onClick={onRetryRoster} aria-label="Refresh officers"><RefreshCw size={16}/></button></div>
      <div className="pf-resource-list">{officers.slice(0,12).map(unit=><div className="pf-resource-row" key={unit.id||unit.email}><span className="pf-unit-avatar">{unit.unit_number||'—'}</span><div><strong>{[unit.rank,unit.last_name].filter(Boolean).join(' ')||'Officer'}</strong><small>{unit.connection_stale?'Connection stale':unit.presence_online||unit.session_active?'Online':'Offline'}{unit.platoon?' · '+unit.platoon:''}</small></div><span className={unit.status==='Available'?'text-emerald-300':unit.status==='Distress'?'text-red-300':'text-slate-300'}>{unit.status||'Unknown'}</span></div>)}{!officers.length&&<p className="pf-cad-empty">{rosterLoading?'Loading roster…':'No officers to display'}</p>}</div>
    </section>
    <section className="pf-cad-panel pf-cad-duty"><div className="pf-cad-panel-head"><h2><ShieldCheck size={18}/> My duty & location</h2></div><button type="button" className="pf-cad-button" onClick={()=>setUtilityPanel('duty')}>Manage duty settings <ChevronRight size={16}/></button></section>
   </aside>
  </div>
  <Dialog open={!!utilityPanel} onOpenChange={open=>{if(!open)setUtilityPanel(null);}}>
   <DialogContent className="max-w-3xl border-slate-700 bg-slate-900 text-white">
    <DialogHeader><DialogTitle className="pr-10">{utilityPanel==='duty'?'My duty & location':'Unit status & resources'}</DialogTitle><DialogDescription>{utilityPanel==='duty'?'Manage your duty status and location sharing.':'Search officers and review availability and assignments.'}</DialogDescription></DialogHeader>
    {utilityPanel==='duty'?<div className="min-w-0 space-y-4">{settings}</div>:(
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"><div className="border-b border-slate-700 p-4"><h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-emerald-300"/>Unit status / resources</h2><p className="mt-1 text-xs text-slate-400">Officer availability, presence and CAD assignments</p>{rosterError&&<p role="alert" className="mt-2 text-xs text-amber-300">{rosterError}</p>}<button type="button" disabled={rosterLoading} onClick={onRetryRoster} className="mt-2 rounded border border-cyan-700 px-3 py-2 text-xs disabled:opacity-50">{rosterLoading?'Refreshing officers…':'Refresh officers'}</button><input aria-label="Find field officer" placeholder="Name, unit, platoon or status" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)} className="mt-3 min-h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm"/></div><div className="max-h-[58vh] divide-y divide-slate-800 overflow-y-auto">{officers.map(unit=><div key={unit.id||unit.email} className="p-4"><div className="flex items-center gap-3">{unit.profile_photo_url?<img src={unit.profile_photo_url} alt="" className="h-10 w-10 rounded-full object-cover"/>:<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{unit.unit_number||'—'}</span>}<div className="min-w-0 flex-1"><strong className="block break-words text-sm text-white">{[unit.rank,unit.last_name].filter(Boolean).join(' ')||'Officer'}</strong><span className="text-xs text-slate-500">Unit {unit.unit_number||'—'}{unit.platoon?' · '+unit.platoon:''}</span></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className={unit.status==='Available'?'text-emerald-300':unit.status==='Distress'?'text-red-300':'text-slate-300'}>{unit.status||'Status unavailable'}</span><span className="text-slate-500">{unit.connection_stale?'Connection stale':unit.presence_online||unit.session_active?'Online':'Offline'}</span></div>{unit.current_call_info&&<p className="mt-2 text-xs leading-relaxed text-slate-400">{unit.current_call_info}</p>}</div>)}{!officers.length&&<p className="p-6 text-sm text-slate-400">{rosterLoading?'Loading officer roster…':unitSearch?'No officers match this search.':'Officer roster unavailable. Select Refresh officers to retry.'}</p>}</div></section>
    )}
   </DialogContent>
  </Dialog>
  <Dialog open={!!detail} onOpenChange={open=>{if(!open)onClose?.();}}><DialogContent className="max-w-3xl border-slate-700 bg-slate-900 text-white"><DialogHeader><DialogTitle className="pr-10 text-xl">{detail?incidentOf(detail):'Incident details'}</DialogTitle><DialogDescription className="text-slate-400">{detail?identifierOf(detail).value:''}</DialogDescription></DialogHeader>{detail&&<div className="space-y-5">
   {error&&<p role="alert" className="rounded-lg border border-red-700 bg-red-950 p-3 text-sm text-red-100">{error}</p>}
   <dl className="grid gap-4 rounded-xl border border-slate-700 bg-slate-950 p-4 sm:grid-cols-2">{[['Location',detail.location||'Pending'],['Status',detail.status||'Active'],['Priority',(priorities[priorityOf(detail)]||priorities.medium).label],['Received',timeOf(detail.time_received)+' ET'],['Agency',detail.agency||'Pending'],['Cross street',detail.cross_street||'None recorded'],['District / beat',callDistrict(detail)]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-white">{value}</dd></div>)}</dl>
   {detail.source==='public_helpme'&&<section className="rounded-xl border border-cyan-700/50 bg-cyan-950/20 p-3"><h3 className="text-sm font-semibold text-cyan-200">Website Help Me request</h3><p className="mt-1 text-xs text-slate-300">This is a regular CAD call. Open the dispatch console to assign units, change status, add notes or review its response record.</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-slate-400">Caller:</span> {detail.caller_name||'Not provided'}</p><p><span className="text-slate-400">Callback:</span> {detail.caller_phone||'Not provided'}</p><p><span className="text-slate-400">Landmark:</span> {detail.landmark||'Not provided'}</p><p><span className="text-slate-400">Safety hazards:</span> {detail.hazards||'None reported'}</p></div></section>}
   {detail.description&&<section><h3 className="mb-2 text-sm font-semibold text-slate-300">Incident narrative</h3><p className="whitespace-pre-wrap rounded-xl border border-slate-700 p-4 text-sm leading-7 text-slate-200">{detail.description}</p></section>}
   <section><h3 className="mb-2 text-sm font-semibold text-slate-300">Assigned units</h3><div className="flex flex-wrap gap-2">{(detail.assigned_units||[]).map(id=>{const person=units.find(unit=>[unit.id,unit.user_id,unit.officer_id,unit.email].some(value=>String(value)===String(id)));return <span key={id} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">{person?[person.rank,person.last_name,'· Unit',person.unit_number||'—'].filter(Boolean).join(' '):'Unit '+id}</span>;})}{!(detail.assigned_units||[]).length&&<p className="text-sm text-amber-300">No unit has been assigned.</p>}</div></section>
   <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-4"><button type="button" onClick={()=>onDispatch?.(detail)} className="rounded-lg border border-cyan-600 bg-cyan-950 px-4 py-2 text-sm font-bold text-cyan-100">Open full CAD / assign officer</button><button type="button" onClick={()=>onMap(detail)} className="rounded-lg border border-cyan-600 bg-cyan-950 px-4 py-2 text-sm text-cyan-100">Open map & dispatch</button>{canChangePriority&&<IncidentPrioritySelect call={detail} priority={priorityOf(detail)} onSave={onPriority} disabled={!!working}/>}{canClear&&<button type="button" disabled={!!working} onClick={event=>run(detail.id,async()=>{await onClear(detail,event);onClose?.();})} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold">{working===detail.id?'Saving…':'Clear call'}</button>}</div>
  </div>}</DialogContent></Dialog>

 </div>;
}