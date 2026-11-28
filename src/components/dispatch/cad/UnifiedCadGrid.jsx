import {useState} from 'react';
import {Map, MessageSquare, Radio, Search, Users} from 'lucide-react';
import TacticalCommandMap from '../TacticalCommandMap';
import CommandIncidentDetails from '../CommandIncidentDetails';
import CadIncidentComments from './CadIncidentComments';
import {cadNeedsDispatch,cadUnitAvailable} from '@/lib/cadOperationalStatus';
import './unified-cad-grid.css';

const unitKey=u=>String(u.id||u.email||u.unit_number);
const fieldCall=c=>/officer|field|mdt|helpm|self|patrol/i.test([c.source,c.source_channel].filter(Boolean).join(' '));
const available=u=>cadUnitAvailable(u)&&!u.dispatch_hold_new_calls;
export default function UnifiedCadGrid({calls,allCalls,units,loading,rosterLoading,rosterError,onRetryRoster,detail,onOpen,onClose,onDispatch,onMap,onPriority,onClear,canChangePriority,canClear,canManage,priorityOf,priorities,identifierOf,incidentOf,elapsedOf,callDistrict,working,onCreate,onRefresh,initialFocus,query,setQuery,agency,setAgency}){
 const [view,setView]=useState('queues');
 const [unitSearch,setUnitSearch]=useState('');
 const [showMap,setShowMap]=useState(true);
 const [fieldOnly,setFieldOnly]=useState(false);
 const open=c=>{onOpen(c);setView('incident');};
 const scoped=fieldOnly?calls.filter(fieldCall):calls;
 const pending=scoped.filter(cadNeedsDispatch);
 const active=scoped.filter(c=>!cadNeedsDispatch(c));
 const roster=units.filter(u=>[u.unit_number,u.rank,u.last_name,u.status].join(' ').toLowerCase().includes(unitSearch.toLowerCase()));
 const unitLabel=id=>{const u=units.find(u=>[u.id,u.user_id,u.active_officer_id,u.unit_number].some(v=>v!=null&&String(v)===String(id)));return u?.unit_number||'Unit';};
 const card=c=><button type="button" key={c.id} className="cc-call" data-priority={priorityOf(c)} aria-pressed={detail?.id===c.id} onClick={()=>open(c)}><div className="cc-call-meta"><b>{identifierOf(c).value}</b><span>{priorities[priorityOf(c)]?.label.split(' · ')[0]||'P3'}</span><time>{elapsedOf(c)||'—'}</time></div><strong>{incidentOf(c)}</strong><p>{c.location||'Location pending'}</p><div className="cc-call-tags"><small>{c.status||'New'}</small>{fieldCall(c)&&<small>FIELD</small>}{(c.assigned_units||[]).map(id=><small key={id} data-unit="true">{unitLabel(id)}</small>)}</div>{c.description&&<p className="cc-snippet">{c.description}</p>}</button>;
 const queue=(title,items,kind)=><section className={'cc-panel cc-'+kind} aria-label={title}><header><span>{title} ({items.length})</span></header><div className="cc-scroll">{items.map(card)}{!items.length&&<p className="cc-empty">{loading?'Loading calls…':'No matching incidents'}</p>}</div></section>;
 return <div className="cc-workspace">
  <div className="cc-toolbar"><div className="cc-create">{canManage&&<><button onClick={()=>onCreate('dispatch')} type="button">+ Incident</button><button onClick={()=>onCreate('field')} type="button">+ Field initiated</button></>}</div><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search CAD number, address, incident" aria-label="Search CAD incidents"/></label><select value={agency} onChange={e=>setAgency(e.target.value)} aria-label="Agency"><option value="all">All agencies</option>{[...new Set(allCalls.map(c=>c.agency).filter(Boolean))].sort().map(a=><option key={a}>{a}</option>)}</select><button type="button" aria-pressed={fieldOnly} onClick={()=>setFieldOnly(v=>!v)}>Field calls</button><button type="button" aria-pressed={showMap} onClick={()=>setShowMap(v=>!v)}><Map size={14}/> Map</button></div>
  <nav className="cc-mobile" aria-label="Compact CAD panels">{[['units','Units'],['queues','Calls'],['incident','Incident'],['comments','Comments'],['map','Map']].map(([id,label])=><button key={id} type="button" aria-pressed={view===id} disabled={['incident','comments'].includes(id)&&!detail} onClick={()=>{if(id==='map')setShowMap(true);setView(id);}}>{label}</button>)}</nav>
  <div className="cc-grid" data-view={view} data-map={showMap} data-selected={!!detail}>
   <section className="cc-panel cc-units" aria-label="Units"><header><span><Users size={14}/> Units ({roster.length})</span><button onClick={onRetryRoster} disabled={rosterLoading} type="button">Refresh</button></header><input className="cc-unit-search" aria-label="Search units" value={unitSearch} onChange={e=>setUnitSearch(e.target.value)} placeholder="Find unit"/>{rosterError&&<p className="cc-empty">{rosterError}</p>}<div className="cc-scroll">{[['Available',roster.filter(available)],['Assigned / other',roster.filter(u=>!available(u))]].map(([title,rows])=><div key={title}><h3 className="cc-unit-group">{title} ({rows.length})</h3>{rows.map(u=><div className="cc-unit" key={unitKey(u)} data-state={available(u)?'available':u.connection_stale?'stale':String(u.status||'unknown').toLowerCase()}><div><b>{u.unit_number||'—'}</b><small>{u.status||'Unknown'}</small></div><span>{[u.rank,u.last_name].filter(Boolean).join(' ')||'Officer'}{u.dispatch_hold_new_calls?' · HOLD':u.connection_stale?' · STALE':''}</span>{u.current_call_info&&<small>{u.current_call_info}</small>}</div>)}</div>)}{!roster.length&&<p className="cc-empty">{rosterLoading?'Loading roster…':'No matching units'}</p>}</div></section>
   {queue('Pending incidents',pending,'pending')}
   <section className="cc-panel cc-incident" aria-label="Selected incident">{detail?<CommandIncidentDetails key={detail.id} call={detail} units={units} allCalls={allCalls} priority={priorities[priorityOf(detail)]||priorities.medium} reference={identifierOf(detail).value} incident={incidentOf(detail)} elapsed={elapsedOf(detail)} district={callDistrict(detail)} onClose={()=>{onClose();setView('queues')}} onUnits={()=>setView('units')} onDispatch={onDispatch} onMap={onMap} onPriority={onPriority} onClear={onClear} canChangePriority={canChangePriority} canClear={canClear} canManage={canManage} working={working} unified onChanged={onRefresh} onCloned={open}/>:<><header><span><Radio size={14}/> Incident workstation</span></header><div className="cc-idle"><Radio size={30}/><strong>Select an incident</strong><p>Pending and active calls remain visible while you work.</p></div></>}</section>
   {queue('Active incidents',active,'active')}
   <section className="cc-panel cc-comments" aria-label="Live incident comments"><header><span><MessageSquare size={14}/> Live comments</span>{detail&&<small>{identifierOf(detail).value}</small>}</header>{detail?<CadIncidentComments key={detail.id} call={detail}/>:<div className="cc-idle"><MessageSquare size={24}/><p>Select a call to read its shared timeline.</p></div>}</section>
   {showMap&&<section className="cc-panel cc-map"><TacticalCommandMap calls={allCalls} units={units} selectedCall={detail} onCallClick={open}/></section>}
  </div>
 </div>
}
