import './cad-workstations.css';
import './tactical-console.css';
import TacticalCommandMap from './TacticalCommandMap';
import CommandEventLog from './CommandEventLog';
import IncidentPrioritySelect from './IncidentPrioritySelect';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import { lookupDistrict } from '@/utils/districtLookup';
import { comparePersonnel } from '@/utils/rankPolicy';
import { Radio, Search, Users, RefreshCw, ArrowRight, MapPin, Clock3, ChevronRight, ShieldCheck } from 'lucide-react';

export default function LiveCommandWorkspace({calls=[],allCalls=[],units=[],loading,syncStatus={},rateLimited,onRefresh,onOpen,selectedCall,onClose,onMap,onDispatch,onPriority,onClear,canChangePriority,canClear,priorityOf,identifierOf,incidentOf,timeOf,elapsedOf,elapsedTimestampOf,isExternal,actions,settings,rosterLoading=false,rosterError='',onRetryRoster}){
 const [query,setQuery]=useState(''),[agency,setAgency]=useState('all'),[focus,setFocus]=useState('all'),[unitSearch,setUnitSearch]=useState(''),[working,setWorking]=useState(''),[error,setError]=useState('');
 const [utilityPanel,setUtilityPanel]=useState(null);
 const [screen,setScreen]=useState('operations');
 const [unitFilter,setUnitFilter]=useState('all');
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
 const officers=units.filter(u=>(unitFilter==='all'||String(u.status||'').toLowerCase()===unitFilter)&&[u.rank,u.last_name,u.unit_number,u.platoon,u.status].join(' ').toLowerCase().includes(unitSearch.toLowerCase())).sort(comparePersonnel);
 const detail=selectedCall?(allCalls.find(call=>call.id===selectedCall.id)||selectedCall):null;
 const run=async(key,task)=>{if(working)return;setWorking(key);setError('');try{await task();}catch(e){setError(e?.response?.data?.error||e.message||'Action could not be saved.');}finally{setWorking('');}};
 return <div className="tac-console tac-command">
  <header className="tac-header"><div className="tac-brand"><Radio size={23}/><div><small>BLACK POINT · OPERATIONS</small><h1>Command / Control</h1></div></div><div className="tac-header-actions"><span className="tac-feed-state"><i data-state={rateLimited||syncStatus.state==='error'?'warning':loading?'loading':'ready'}/>{rateLimited?'RATE LIMITED':loading?'SYNCING':syncStatus.state==='error'?'DEGRADED':'CAD FEED'}</span><button onClick={onRefresh}><RefreshCw size={15}/> Refresh</button>{actions}<button onClick={()=>setUtilityPanel('duty')}>Duty settings</button></div></header>
  <div className="tac-command-strip">{[
    ['ALL INCIDENTS',allCalls.length,'all','normal'],['UNASSIGNED',allCalls.filter(needsDispatch).length,'unassigned','warning'],['P1 / P2',critical.length,'urgent','danger'],['AVAILABLE',available.length,'resources','ready'],['DISTRESS',units.filter(u=>String(u.status).toLowerCase()==='distress').length,'distress','danger']
  ].map(([label,count,id,tone])=><button key={id} data-tone={tone} onClick={()=>{if(id==='resources'||id==='distress'){setUnitFilter(id==='distress'?'distress':'available');setScreen('units');}else {setFocus(id);setScreen('incidents')}}}><span>{label}</span><strong>{loading&&!allCalls.length&&id==='all'?'—':count}</strong></button>)}</div>
  {(error||syncStatus.state==='error'&&syncStatus.error||rateLimited)&&<p role="alert" className="tac-warning">{error||syncStatus.error||'CAD rate limited. Showing last received data.'}</p>}
  <div className="tac-mobile-switch"><button aria-pressed={screen==='operations'} onClick={()=>setScreen('operations')}>Operations</button><button aria-pressed={screen==='incidents'} onClick={()=>setScreen('incidents')}>Incidents</button><button aria-pressed={screen==='units'} onClick={()=>setScreen('units')}>Units</button></div>
  <div className="tac-command-grid" data-screen={screen}>
    <section className="tac-incident-rail"><div className="tac-panel-bar"><span>Incident stack <b>{visible.length}</b></span><button onClick={()=>{setFocus('all');setQuery('');setAgency('all')}}>Reset</button></div>
      <div className="tac-filters"><label><Search size={14}/><input aria-label="Search live incidents" value={query} onChange={e=>setQuery(e.target.value)} placeholder="CAD / address / incident"/></label><select aria-label="Agency" value={agency} onChange={e=>setAgency(e.target.value)}><option value="all">All agencies</option>{[...new Set(allCalls.map(c=>c.agency).filter(Boolean))].sort().map(a=><option key={a}>{a}</option>)}{allCalls.some(isExternal)&&<option value="external">PulsePoint</option>}</select></div>
      <div className="tac-segment">{[['all','All'],['urgent','Priority'],['unassigned','Unassigned']].map(([id,label])=><button key={id} aria-pressed={focus===id} onClick={()=>setFocus(id)}>{label}</button>)}</div>
      <div className="tac-incident-scroll">{visible.map(call=>{const p=priorities[priorityOf(call)]||priorities.medium;return <button key={call.id} className="tac-call-strip" data-priority={priorityOf(call)} aria-pressed={detail?.id===call.id} onClick={()=>{onOpen(call);setScreen('operations')}}><div className="tac-call-top"><span className={'cad-priority border '+p.style}>{p.label.split(' · ')[0]}</span><b>{identifierOf(call).value}</b><time>{elapsedOf(call)||'—'}</time></div><strong>{incidentOf(call)}</strong><span className="tac-address">{call.location||'Location pending'}</span><div className="tac-call-foot"><span>{call.agency||'BPS'}</span><span>{call.status||'Active'}</span><span>{(call.assigned_units||[]).length} units</span>{isExternal(call)&&<span>PulsePoint</span>}</div></button>})}{!visible.length&&<p className="tac-empty">{loading?'Loading incidents…':'No matching active incidents'}</p>}</div>
    </section>
    <div className="tac-operations"><TacticalCommandMap calls={allCalls} units={units} onCallClick={onOpen}/>
     <section className="tac-selected"><div className="tac-panel-bar"><span>Selected incident</span>{detail&&<button onClick={onClose}>Deselect</button>}</div>{detail?<div className="tac-selected-body"><div className="tac-selected-head"><div><small>{identifierOf(detail).value} · {detail.agency||'BPS'} · {detail.status||'Active'}</small><h2>{incidentOf(detail)}</h2><p>{detail.location||'Location pending'}</p></div><b className={'cad-priority border '+(priorities[priorityOf(detail)]||priorities.medium).style}>{(priorities[priorityOf(detail)]||priorities.medium).label}</b></div><div className="tac-selected-facts"><span>Received <b>{timeOf(detail.time_received||detail.created_date)} ET</b></span><span>Elapsed <b>{elapsedOf(detail)||'—'}</b></span><span>District <b>{callDistrict(detail)}</b></span><span>Units <b>{(detail.assigned_units||[]).length}</b></span></div>{detail.hazards&&<p className="tac-warning">HAZARDS: {detail.hazards}</p>}{detail.description&&<p className="tac-narrative">{detail.description}</p>}{detail.source==='public_helpme'&&<p className="tac-narrative">Website Help Me request · {detail.caller_name||'Caller not provided'} · {detail.caller_phone||'Callback not provided'}</p>}<div className="tac-selected-actions"><button className="tac-primary" onClick={()=>onDispatch?.(detail)}>Open dispatch / assign <ArrowRight size={15}/></button><button onClick={()=>onMap(detail)}>Full map</button>{canChangePriority&&<IncidentPrioritySelect call={detail} priority={priorityOf(detail)} onSave={onPriority} disabled={!!working}/>} {canClear&&<button className="tac-danger" disabled={!!working} onClick={event=>{if(window.confirm('Clear this CAD incident? Confirm the response is complete.'))void run(detail.id,async()=>{await onClear(detail,event);onClose?.();});}}>{working===detail.id?'Saving…':'Clear call'}</button>}</div></div>:<p className="tac-empty">Select an incident or map marker to inspect it here.</p>}</section>
    </div>
    <section className="tac-unit-rail"><div className="tac-panel-bar"><span><Users size={15}/> Unit status</span><div><button onClick={onRetryRoster} disabled={rosterLoading} aria-label="Refresh officers"><RefreshCw size={14}/></button><button onClick={()=>setUtilityPanel('resources')}>Roster</button></div></div><div className="tac-filters"><label><Search size={14}/><input aria-label="Find unit" placeholder="Unit / officer / platoon" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)}/></label><select value={unitFilter} onChange={e=>setUnitFilter(e.target.value)} aria-label="Unit status filter"><option value="all">All statuses</option>{[...new Set(units.map(u=>String(u.status||'').toLowerCase()).filter(Boolean))].map(status=><option key={status}>{status}</option>)}</select></div>{rosterError&&<p className="tac-warning">{rosterError}</p>}<div className="tac-unit-scroll">{officers.map(unit=><div key={unit.id||unit.email} className="tac-unit-row" data-status={String(unit.status||'').toLowerCase()}><strong className="tac-unit-number">{unit.unit_number||'—'}</strong><div><b>{[unit.rank,unit.last_name].filter(Boolean).join(' ')||'Officer'}</b><small>{unit.connection_stale?'STALE':unit.presence_online||unit.session_active?'ONLINE':'OFFLINE'}{unit.platoon?' · '+unit.platoon:''}</small>{unit.current_call_info&&<small className="tac-unit-call">{unit.current_call_info}</small>}</div><span>{unit.status||'Unknown'}</span></div>)}{!officers.length&&<p className="tac-empty">{rosterLoading?'Loading units…':'No matching units'}</p>}</div></section>
  </div>
  <CommandEventLog calls={allCalls} onSelect={onOpen}/>
  <Dialog open={!!utilityPanel} onOpenChange={open=>{if(!open)setUtilityPanel(null);}}>
   <DialogContent className="max-w-3xl border-slate-700 bg-slate-900 text-white">
    <DialogHeader><DialogTitle className="pr-10">{utilityPanel==='duty'?'My duty & location':'Unit status & resources'}</DialogTitle><DialogDescription>{utilityPanel==='duty'?'Manage your duty status and location sharing.':'Search officers and review availability and assignments.'}</DialogDescription></DialogHeader>
    {utilityPanel==='duty'?<div className="min-w-0 space-y-4">{settings}</div>:(
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"><div className="border-b border-slate-700 p-4"><h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-emerald-300"/>Unit status / resources</h2><p className="mt-1 text-xs text-slate-400">Officer availability, presence and CAD assignments</p>{rosterError&&<p role="alert" className="mt-2 text-xs text-amber-300">{rosterError}</p>}<button type="button" disabled={rosterLoading} onClick={onRetryRoster} className="mt-2 rounded border border-cyan-700 px-3 py-2 text-xs disabled:opacity-50">{rosterLoading?'Refreshing officers…':'Refresh officers'}</button><input aria-label="Find field officer" placeholder="Name, unit, platoon or status" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)} className="mt-3 min-h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm"/></div><div className="max-h-[58vh] divide-y divide-slate-800 overflow-y-auto">{officers.map(unit=><div key={unit.id||unit.email} className="p-4"><div className="flex items-center gap-3">{unit.profile_photo_url?<img src={unit.profile_photo_url} alt="" className="h-10 w-10 rounded-full object-cover"/>:<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">{unit.unit_number||'—'}</span>}<div className="min-w-0 flex-1"><strong className="block break-words text-sm text-white">{[unit.rank,unit.last_name].filter(Boolean).join(' ')||'Officer'}</strong><span className="text-xs text-slate-500">Unit {unit.unit_number||'—'}{unit.platoon?' · '+unit.platoon:''}</span></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className={unit.status==='Available'?'text-emerald-300':unit.status==='Distress'?'text-red-300':'text-slate-300'}>{unit.status||'Status unavailable'}</span><span className="text-slate-500">{unit.connection_stale?'Connection stale':unit.presence_online||unit.session_active?'Online':'Offline'}</span></div>{unit.current_call_info&&<p className="mt-2 text-xs leading-relaxed text-slate-400">{unit.current_call_info}</p>}</div>)}{!officers.length&&<p className="p-6 text-sm text-slate-400">{rosterLoading?'Loading officer roster…':unitSearch?'No officers match this search.':'Officer roster unavailable. Select Refresh officers to retry.'}</p>}</div></section>
    )}
   </DialogContent>
  </Dialog>

 </div>;
}