import {CadTerminalHeader,CadRefresh,CadPanelBar,CadMetricStrip,CadStatus} from '@/components/dispatch/CadTerminal';
import {Users,Search,X,RadioTower} from 'lucide-react';
import {formatEasternDateTime} from '@/lib/easternTime';
import '@/components/dispatch/cad-center-terminal.css';
import {useState,useEffect} from 'react';
import useCadRoster from '@/hooks/useCadRoster';
import {DashboardDataProvider,useDashboardData,useOptionalDashboardData} from '@/lib/DashboardDataContext';

import {dutyRows} from '@/components/dispatch/UnitDutyBoard';
import {cadNeedsDispatch,cadServiceLevel,cadReferenceValue,cadAgeLabel} from '@/lib/cadOperationalStatus';
import {cadDisplayUnitState} from '@/lib/cadWorkspaceModel';
import {cadDestination} from '@/lib/cadNavigation';
import {useNavigate} from 'react-router-dom';
import '@/components/dispatch/cad/unified-cad-grid.css';

function UnitStatusPage({initialStatus='All',initialUnitSearch='',onOpenCall}) {
    const navigate=useNavigate();
    const {calls,rateLimited}=useDashboardData();
    const {rows:units,loading,error,lastVerifiedAt,refresh}=useCadRoster();
    const [query,setQuery]=useState(initialUnitSearch),[status,setStatus]=useState(initialStatus==='All'?'ALL':initialStatus),[platoon,setPlatoon]=useState('ALL'),[selectedId,setSelectedId]=useState(null);
    const manualRefresh=()=>refresh(true);
    const all=dutyRows(units,calls);
    const rows=dutyRows(units,calls,query,status).filter(u=>platoon==='ALL'||(u.platoon||u.oversight_platoon)===platoon);
    const key=u=>String(u.id||u.email||u.officer_email);
    const selected=rows.find(u=>key(u)===selectedId);
    const openCall=call=>onOpenCall?onOpenCall(call):navigate(cadDestination('CommandDashboard',new URLSearchParams({call_id:call.id})));
    const states=['Available','Dispatched','Enroute','On Scene','Busy','Out of Service','Distress'];
    const presence=u=>u.connection_stale||u.presence_state==='stale'?'Stale':u.session_active===false||u.presence_state==='offline'?'Offline':u.presence_online===true||u.session_active===true?'Online':'Offline';
    const gps=u=>u.live_location_hidden?'Private':presence(u)==='Stale'?'Stale':presence(u)==='Offline'?'Offline':u.gps_updated_at?'Recorded fix':u.last_gps_updated_at?'Last known':'Unavailable';
    const name=u=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.officer_name||u.full_name||'Officer';
    return <div className="tac-console cad-terminal-page cad-unit-terminal">
      <CadTerminalHeader title="Unit Board" icon={Users} subtitle="Officer status and current assignments"><CadRefresh busy={loading} onClick={manualRefresh}/></CadTerminalHeader>
      <CadMetricStrip items={[{label:'Roster',value:all.length,selected:status==='ALL',onClick:()=>setStatus('ALL')},...states.map(label=>({label,value:all.filter(u=>u.status===label).length,tone:label==='Distress'?'danger':label==='Available'?'ready':'neutral',selected:status===label,onClick:()=>setStatus(label)}))]}/>
      {(error||rateLimited)&&<p role="status" className="tac-warning">{error||'Refresh delayed. Showing last received statuses.'} <button type="button" disabled={loading} onClick={manualRefresh}>Retry roster</button></p>}<p className="cad-terminal-footer">{lastVerifiedAt?'Roster read '+formatEasternDateTime(lastVerifiedAt)+' ET':'Waiting for a verified officer roster'}</p>
      <div className="cad-terminal-filter"><label><Search size={15}/><input aria-label="Find unit" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Officer / badge / assignment"/></label><select aria-label="Duty status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option>{states.map(s=><option key={s}>{s}</option>)}</select><select aria-label="Platoon" value={platoon} onChange={e=>setPlatoon(e.target.value)}><option value="ALL">All platoons</option>{[...new Set(all.map(u=>u.platoon||u.oversight_platoon).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select><button type="button" onClick={()=>{setQuery('');setStatus('ALL');setPlatoon('ALL');}}>Reset</button></div>
      <div className="cc-unit-board" data-detail={!!selected}>
       <section className="cc-panel"><header><span><Users size={14}/> Units ({rows.length})</span></header><div className="cc-scroll">{[['Available',rows.filter(u=>cadDisplayUnitState(u)==='available')],['Assigned / other',rows.filter(u=>cadDisplayUnitState(u)!=='available')]].map(([label,group])=><div key={label}><h3 className="cc-unit-group">{label} ({group.length})</h3>{group.map(u=><button type="button" key={key(u)} aria-pressed={selectedId===key(u)} className="cc-unit cc-unit-select" data-state={cadDisplayUnitState(u)} onClick={()=>setSelectedId(key(u))}><div><b>{u.unit_number||'—'}</b><small>{u.status||'Unknown'}</small><small>{presence(u)}</small></div><span>{name(u)} · {u.platoon||u.oversight_platoon||'Unassigned'}</span><small>{u.assignment}</small></button>)}</div>)}{!rows.length&&<p className="cc-empty">{loading?'Loading roster…':error?'Roster unavailable. Retry above.':'No matching officers'}</p>}</div></section>
       <section className="cc-panel cc-unit-inspect"><header><span>Officer detail</span>{selected&&<button onClick={()=>setSelectedId(null)} aria-label="Close officer detail"><X size={15}/></button>}</header><div className="cc-scroll">{selected?<><div className="cad-terminal-record-title"><small>UNIT {selected.unit_number||'—'}</small><h2>{name(selected)}</h2><CadStatus value={selected.status}/></div><dl className="cad-terminal-fields">{[['Platoon',selected.platoon||selected.oversight_platoon],['Presence',presence(selected)],['GPS',gps(selected)],['Last recorded update',selected.last_update_at||selected.last_update?formatEasternDateTime(selected.last_update_at||selected.last_update)+' ET':null],['Current assignment',selected.assignment]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'Not recorded'}</dd></div>)}</dl>{calls.filter(c=>(c.assigned_units||[]).some(id=>[selected.id,selected.user_id,selected.active_officer_id,selected.email].some(v=>v!=null&&String(v)===String(id)))).map(c=><button key={c.id} className="cc-call" onClick={()=>openCall(c)}><strong>{cadReferenceValue(c)} · {c.incident}</strong><p>{c.location}</p></button>)}</>:<p className="cc-empty">Select an officer to inspect duty status and assignments.</p>}</div></section>

      </div>
    </div>;
}
export default function UnitStatus(props){const existing=useOptionalDashboardData();return existing?<UnitStatusPage {...props}/>:<DashboardDataProvider><UnitStatusPage {...props}/></DashboardDataProvider>;}
