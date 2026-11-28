import {CadTerminalHeader,CadRefresh,CadPanelBar,CadMetricStrip,CadStatus} from '@/components/dispatch/CadTerminal';
import {Users,Search,X} from 'lucide-react';
import {formatEasternDateTime} from '@/lib/easternTime';
import '@/components/dispatch/cad-center-terminal.css';
import {useState} from 'react';
import useCadRoster from '@/hooks/useCadRoster';
import {DashboardDataProvider,useDashboardData,useOptionalDashboardData} from '@/lib/DashboardDataContext';

import {dutyRows} from '@/components/dispatch/UnitDutyBoard';

function UnitStatusPage() {
    const {calls,rateLimited}=useDashboardData();
    const {rows:units,loading,error,lastVerifiedAt,refresh}=useCadRoster();
    const [query,setQuery]=useState(''),[status,setStatus]=useState('ALL'),[platoon,setPlatoon]=useState('ALL'),[selectedId,setSelectedId]=useState(null);
    const manualRefresh=()=>refresh(true);
    const all=dutyRows(units,calls);
    const rows=dutyRows(units,calls,query,status).filter(u=>platoon==='ALL'||(u.platoon||u.oversight_platoon)===platoon);
    const key=u=>String(u.id||u.email||u.officer_email);
    const selected=rows.find(u=>key(u)===selectedId);
    const states=['Available','Dispatched','Enroute','On Scene','Busy','Out of Service','Distress'];
    const presence=u=>u.connection_stale||u.presence_state==='stale'?'Stale':u.session_active===false||u.presence_state==='offline'?'Offline':u.presence_online===true||u.session_active===true?'Online':'Offline';
    const gps=u=>u.live_location_hidden?'Private':presence(u)==='Stale'?'Stale':presence(u)==='Offline'?'Offline':u.gps_updated_at?'Recorded fix':u.last_gps_updated_at?'Last known':'Unavailable';
    const name=u=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.officer_name||u.full_name||'Officer';
    return <div className="tac-console cad-terminal-page cad-unit-terminal">
      <CadTerminalHeader title="Unit status / resources" icon={Users} subtitle="Duty readiness and recorded assignments"><CadRefresh busy={loading} onClick={manualRefresh}/></CadTerminalHeader>
      <CadMetricStrip items={[{label:'Roster',value:all.length,selected:status==='ALL',onClick:()=>setStatus('ALL')},...states.map(label=>({label,value:all.filter(u=>u.status===label).length,tone:label==='Distress'?'danger':label==='Available'?'ready':'neutral',selected:status===label,onClick:()=>setStatus(label)}))]}/>
      {(error||rateLimited)&&<p role="status" className="tac-warning">{error||'Refresh delayed. Showing last received statuses.'} <button type="button" disabled={loading} onClick={manualRefresh}>Retry roster</button></p>}<p className="cad-terminal-footer">{lastVerifiedAt?'Roster read '+formatEasternDateTime(lastVerifiedAt)+' ET':'Waiting for a verified officer roster'}</p>
      <div className="cad-terminal-filter"><label><Search size={15}/><input aria-label="Find unit" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Officer / badge / assignment"/></label><select aria-label="Duty status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All statuses</option>{states.map(s=><option key={s}>{s}</option>)}</select><select aria-label="Platoon" value={platoon} onChange={e=>setPlatoon(e.target.value)}><option value="ALL">All platoons</option>{[...new Set(all.map(u=>u.platoon||u.oversight_platoon).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select><button type="button" onClick={()=>{setQuery('');setStatus('ALL');setPlatoon('ALL');}}>Reset</button></div>
      <div className="cad-terminal-split cad-unit-split" data-detail={!!selected}>
       <section className="cad-terminal-panel"><CadPanelBar title={rows.length+' operational officers'}/><div className="cad-terminal-scroll"><table className="cad-terminal-table"><thead><tr>{['Unit','Officer','Status','Platoon','Assignment','Presence / GPS'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{rows.map(u=><tr key={key(u)} data-selected={selectedId===key(u)} onClick={()=>setSelectedId(key(u))}><td><button className="cad-record-link" type="button" onClick={()=>setSelectedId(key(u))}>{u.unit_number||'—'}</button></td><td>{name(u)}</td><td><CadStatus value={u.status}/></td><td>{u.platoon||u.oversight_platoon||'Unassigned'}</td><td>{u.assignment}</td><td>{presence(u)} / {gps(u)}</td></tr>)}</tbody></table>{!rows.length&&<p className="tac-empty">{loading?'Loading roster…':error?'Roster unavailable. Retry above.':'No matching officers'}</p>}</div></section>
       <section className="cad-terminal-panel cad-unit-detail"><CadPanelBar title="Officer detail">{selected&&<button onClick={()=>setSelectedId(null)} aria-label="Close officer detail"><X size={15}/></button>}</CadPanelBar><div className="cad-terminal-scroll">{selected?<><div className="cad-terminal-record-title"><small>UNIT {selected.unit_number||'—'}</small><h2>{name(selected)}</h2><CadStatus value={selected.status}/></div><dl className="cad-terminal-fields">{[['Platoon',selected.platoon||selected.oversight_platoon],['Presence',presence(selected)],['GPS',gps(selected)],['Last recorded update',selected.last_update_at||selected.last_update?formatEasternDateTime(selected.last_update_at||selected.last_update)+' ET':null],['Current assignment',selected.assignment]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'Not recorded'}</dd></div>)}</dl></>:<p className="tac-empty">Select an officer to inspect duty status and assignment.</p>}</div></section>
      </div>
    </div>;
}
export default function UnitStatus(){const existing=useOptionalDashboardData();return existing?<UnitStatusPage/>:<DashboardDataProvider><UnitStatusPage/></DashboardDataProvider>;}
