import {useEffect,useMemo,useRef,useState} from 'react';
import {Map as MapIcon, MessageSquare, Search, Users, X, Plus, PanelRightClose, PanelRightOpen, ChevronDown, ChevronRight, RefreshCw, Maximize, Minimize} from 'lucide-react';
import TacticalCommandMap from '../TacticalCommandMap';
import CommandIncidentDetails from '../CommandIncidentDetails';
import CadIncidentComments from './CadIncidentComments';
import {cadUnitAvailable,cadAgeLabel} from '@/lib/cadOperationalStatus';
import {splitCadIncidents,isFieldInitiated,cadDisplayUnitState,isOpenIncident} from '@/lib/cadWorkspaceModel';
import './unified-cad-grid.css';

const unitKey=u=>String(u.id||u.email||u.unit_number);
const available=u=>cadUnitAvailable(u)&&cadDisplayUnitState(u)==='available';
const stateCode={available:'AV',dispatched:'AS',enroute:'ENRT','on scene':'ARRVD',busy:'BUSY',distress:'SOS','out of service':'OOS',offline:'OFF',stale:'STALE',hold:'HOLD'};
const age=(value,now)=>{const t=Date.parse(value||'');return Number.isFinite(t)&&t<=now?cadAgeLabel((now-t)/60000):'—';};
const name=u=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.full_name||'Officer';
export default function UnifiedCadGrid({calls=[],allCalls=[],units=[],loading,rosterLoading,rosterError,onRetryRoster,detail,onOpen,onClose,onDispatch,onMap,onPriority,onClear,canChangePriority,canClear,canManage,priorityOf,priorities,identifierOf,incidentOf,elapsedOf,callDistrict,working,onCreate,onRefresh,query,setQuery,agency,setAgency,showMap=true,onMapVisibility,screen,unitFilter='all',setUnitFilter,onReset,draft,draftOpen=false,onCloseDraft}){
 const [view,setView]=useState('queues');
 const [unitSearch,setUnitSearch]=useState('');
 const [fieldOnly,setFieldOnly]=useState(false);
 const [tabs,setTabs]=useState(()=>detail?.id?[detail.id]:[]);
 const [draftSelected,setDraftSelected]=useState(draftOpen);
 const [collapsed,setCollapsed]=useState({});
 const [now,setNow]=useState(Date.now);
 const [unitDetail,setUnitDetail]=useState(null);
 const unitSearchRef=useRef(null),workspaceRef=useRef(null);
 const [fullscreen,setFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState('');
 useEffect(()=>{const update=()=>setFullscreen(document.fullscreenElement===workspaceRef.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
 const toggleFullscreen=async()=>{setFullscreenError('');try{if(document.fullscreenElement===workspaceRef.current)await document.exitFullscreen();else if(workspaceRef.current?.requestFullscreen)await workspaceRef.current.requestFullscreen();else throw Error('Full-screen is not available in this browser.');}catch(error){setFullscreenError(error.message||'Could not enter full-screen.');}};
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t);},[]);
 useEffect(()=>{if(detail?.id){setTabs(old=>old.includes(detail.id)?old:[...old,detail.id]);setView('incident');setDraftSelected(false);}},[detail?.id]);
 useEffect(()=>{if(draftOpen){setDraftSelected(true);setView('incident');}else setDraftSelected(false);},[draftOpen]);
 useEffect(()=>{if(screen==='units'){setView('units');unitSearchRef.current?.focus();}else if(screen==='incidents')setView('queues');},[screen]);
 const open=c=>{onOpen(c);setDraftSelected(false);setView('incident');};
 const liveById=useMemo(()=>{const map=new Map(allCalls.map(c=>[c.id,c]));if(detail?.id&&!map.has(detail.id))map.set(detail.id,detail);return map;},[allCalls,detail]);
 const openTabs=[...new Set([...tabs,...(detail?.id?[detail.id]:[])])].filter(id=>liveById.has(id)&&isOpenIncident(liveById.get(id)));
 const closeTab=id=>{
  setTabs(old=>old.filter(x=>x!==id));
  if(detail?.id===id){const next=openTabs.filter(x=>x!==id).at(-1);if(next)open(liveById.get(next));else if(draftOpen){onClose();setDraftSelected(true);}else{onClose();setView('queues');}}
 };
 const selected=detail&&isOpenIncident(detail)?detail:null;
 const editing=Boolean(draftOpen||selected);
 useEffect(()=>{if(!editing&&['incident','comments'].includes(view))setView('queues');},[editing,view]);
 const {pending,active}=splitCadIncidents(calls,fieldOnly);
 const roster=units.filter(u=>(unitFilter==='all'||String(u.status||'').toLowerCase()===unitFilter)&&[u.unit_number,u.rank,u.last_name,u.full_name,u.email,u.status,u.platoon].join(' ').toLowerCase().includes(unitSearch.toLowerCase()));
 const unitsById=useMemo(()=>{const map=new Map();for(const u of units)for(const id of [u.id,u.user_id,u.active_officer_id,u.unit_number,u.email])if(id!=null)map.set(String(id),u);return map;},[units]);
 const groups=[['Available',roster.filter(available)],['Assigned & busy',roster.filter(u=>!available(u)&&!['offline','stale','out of service','hold'].includes(cadDisplayUnitState(u)))],['Unavailable / offline',roster.filter(u=>!available(u)&&['offline','stale','out of service','hold'].includes(cadDisplayUnitState(u)))]];
 const card=c=><button type="button" key={c.id} className="cc-call" data-priority={priorityOf(c)} aria-pressed={!draftSelected&&selected?.id===c.id} onClick={()=>open(c)}>
 <div className="cc-call-index"><b>{identifierOf(c).value}</b><time>{elapsedOf(c)||'—'}</time><MessageSquare size={12}/></div>
 <div className="cc-call-body"><div className="cc-call-title"><em>{priorities[priorityOf(c)]?.label.split(' · ')[0]||'P3'}</em><strong>{incidentOf(c)}</strong></div><p>{c.location||'Location pending'}</p>{c.agency&&<small>{c.agency}</small>}{c.hazards&&<span className="cc-hazard" title={c.hazards}>⚠ {c.hazards}</span>}
 <div className="cc-call-tags">{(c.assigned_units||[]).map(id=>{const u=unitsById.get(String(id));const state=u?cadDisplayUnitState(u):'unknown';return <small key={id} data-unit="true" data-state={state}>{u?.unit_number||'Unit'} {stateCode[state]||''}</small>})}{isFieldInitiated(c)&&<small>FIELD</small>}{!(c.assigned_units||[]).length&&<small>{c.status||'New'}</small>}</div></div>
 {c.description&&<p className="cc-snippet">{c.description}</p>}</button>;
 const queue=(title,items,kind)=><section className={'cc-panel cc-'+kind} aria-label={title}><header><b>{title} ({items.length})</b><button type="button" title="Refresh incidents" onClick={onRefresh}><RefreshCw size={12}/></button></header>{kind==='pending'&&canManage&&<div className="cc-create"><button type="button" onClick={()=>{onCreate('dispatch');setDraftSelected(true);setView('incident')}}><Plus size={12}/> Incident</button><button type="button" onClick={()=>{onCreate('field');setDraftSelected(true);setView('incident')}}><Plus size={12}/> Field initiated</button></div>}<div className="cc-scroll cc-call-list">{items.map(card)}{!items.length&&<p className="cc-empty">{loading?'Loading calls…':'No matching incidents'}</p>}</div></section>;
 const toggleMap=()=>{onMapVisibility?.(!showMap);if(!showMap)setView('map');else if(view==='map')setView('queues');};
 return <div ref={workspaceRef} className="cc-workspace cc-workspace-v2">
  <div className="cc-toolbar"><label><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find incident · CAD number, address, type" aria-label="Search CAD incidents"/></label><select value={agency} onChange={e=>setAgency(e.target.value)} aria-label="Agency"><option value="all">All agencies</option>{[...new Set(allCalls.map(c=>c.agency).filter(Boolean))].sort().map(a=><option key={a}>{a}</option>)}</select><button type="button" aria-pressed={fieldOnly} onClick={()=>setFieldOnly(v=>!v)}>Field calls</button><button type="button" onClick={()=>{setFieldOnly(false);onReset?.();}}>Reset filters</button><button type="button" aria-pressed={showMap} onClick={toggleMap}>{showMap?<PanelRightClose size={14}/>:<PanelRightOpen size={14}/>} Map</button><button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>{fullscreen?<Minimize size={14}/>:<Maximize size={14}/>} {fullscreen?'Exit full screen':'Full screen'}</button></div>{fullscreenError&&<p role="alert" className="cc-empty">{fullscreenError}</p>}
  <nav className="cc-mobile" aria-label="Compact CAD panels">{[['units','Units'],['queues','Calls'],['incident','Incident'],['comments','Comments'],['map','Map']].map(([id,label])=><button key={id} type="button" aria-pressed={view===id} disabled={id==='incident'&&!editing||id==='comments'&&!selected} onClick={()=>{if(id==='map')onMapVisibility?.(true);if(id==='comments')setDraftSelected(false);setView(id);}}>{label}</button>)}</nav>
  <div className="cc-grid" data-view={view} data-map={showMap} data-selected={editing} data-draft={draftOpen&&draftSelected}>
   <section className="cc-panel cc-units" aria-label="Units"><header><b>Units ({roster.length})</b><button onClick={onRetryRoster} disabled={rosterLoading} type="button" title="Refresh units"><RefreshCw size={12}/></button></header><div className="cc-unit-filters"><input ref={unitSearchRef} className="cc-unit-search" aria-label="Search units" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)} placeholder="Find unit"/><select className="cc-unit-search" aria-label="Filter unit status" value={unitFilter} onChange={e=>setUnitFilter?.(e.target.value)}><option value="all">All statuses</option>{[...new Set(units.map(u=>String(u.status||'').toLowerCase()).filter(Boolean))].sort().map(s=><option key={s}>{s}</option>)}</select></div>{rosterError&&<p className="cc-empty">{rosterError}</p>}
   <div className="cc-scroll">{groups.map(([title,rows])=><div key={title}><button type="button" className="cc-unit-group" aria-expanded={!collapsed[title]} onClick={()=>setCollapsed(v=>({...v,[title]:!v[title]}))}>{collapsed[title]?<ChevronRight size={12}/>:<ChevronDown size={12}/>} {title} ({rows.length})</button>{!collapsed[title]&&rows.map(u=>{const state=cadDisplayUnitState(u);return <button type="button" className="cc-unit cc-radio-row" title={name(u)+' · '+state} aria-pressed={unitDetail===unitKey(u)} key={unitKey(u)} data-state={state} onClick={()=>setUnitDetail(old=>old===unitKey(u)?null:unitKey(u))}><b>{u.unit_number||'—'}</b><span>{stateCode[state]||String(u.status||'?').toUpperCase()}</span><time title={u.status_updated_at||u.last_status_change?'Time since status change':'Time since last recorded update'}>{age(u.status_updated_at||u.last_status_change||u.last_update,now)}</time></button>})}</div>)}{!roster.length&&<p className="cc-empty">{rosterLoading?'Loading roster…':'No matching units'}</p>}</div>
   {unitDetail&&(()=>{const u=roster.find(u=>unitKey(u)===unitDetail);return u?<div className="cc-unit-pop"><b>{name(u)}</b><p>{u.platoon||'No platoon recorded'} · {u.status}</p><p>{u.current_call_info||'No recorded assignment'}</p>{allCalls.filter(c=>(c.assigned_units||[]).some(id=>unitsById.get(String(id))===u)).map(c=><button key={c.id} onClick={()=>open(c)}>{identifierOf(c).value} · {incidentOf(c)}</button>)}</div>:null})()}
   </section>
   {queue('Pending incidents',pending,'pending')}
   {editing&&<section className="cc-panel cc-incident" aria-label="Selected incident"><div className="cc-tabs" role="tablist" aria-label="Open incidents">{openTabs.map(id=>{const c=liveById.get(id);return <div className="cc-tab" key={id} data-active={!draftSelected&&selected?.id===id}><button type="button" role="tab" aria-selected={!draftSelected&&selected?.id===id} onClick={()=>open(c)}>{identifierOf(c).value}</button><button type="button" title="Close incident tab" onClick={()=>closeTab(id)}><X size={12}/></button></div>})}{draftOpen&&<div className="cc-tab" data-active={draftSelected}><button type="button" role="tab" aria-selected={draftSelected} onClick={()=>{setDraftSelected(true);setView('incident')}}>DRAFT</button><button title="Discard draft" type="button" onClick={onCloseDraft}><X size={12}/></button></div>}</div>
   {draftOpen&&<div className="cc-draft-host" hidden={!draftSelected}>{draft}</div>}
   {selected&&!draftSelected&&<div className="cc-editor"><CommandIncidentDetails key={selected.id} call={selected} units={units} allCalls={allCalls} priority={priorities[priorityOf(selected)]||priorities.medium} reference={identifierOf(selected).value} incident={incidentOf(selected)} elapsed={elapsedOf(selected)} district={callDistrict(selected)} onClose={()=>closeTab(selected.id)} onUnits={()=>{setView('units');unitSearchRef.current?.focus();}} onDispatch={onDispatch} onMap={onMap} onPriority={onPriority} onClear={onClear} canChangePriority={canChangePriority} canClear={canClear} canManage={canManage} working={working} unified inlineComments onChanged={onRefresh} onCloned={open}/><section className="cc-editor-comments" aria-label="Live incident comments"><header><MessageSquare size={13}/> Live comments</header><CadIncidentComments key={selected.id} call={selected}/></section></div>}
   </section>}
   {queue('Active incidents',active,'active')}
   {showMap&&<section className="cc-panel cc-map" aria-label="Live map"><header><b>Map</b><button type="button" onClick={toggleMap} title="Hide map"><X size={14}/></button></header><TacticalCommandMap calls={allCalls} units={units} selectedCall={selected} onCallClick={open}/></section>}
  </div>
 </div>
}
