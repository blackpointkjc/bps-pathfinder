import { useMemo, useState } from 'react';
import { ArrowRight, RadioTower, Users, RefreshCw } from 'lucide-react';
import {
  cadAgeLabel,
  cadNeedsDispatch,
  cadReferenceValue,
  cadServiceLevel,
} from '@/lib/cadOperationalStatus';
import {dutyRows} from '../UnitDutyBoard';
import {formatEasternDateTime} from '@/lib/easternTime';
import './cad-command.css';

const STATUS_TONE = {
  available: 'ready',
  distress: 'danger',
  enroute: 'warning',
  'on scene': 'warning',
  busy: 'warning',
  dispatched: 'normal',
  'out of service': 'muted',
};

/**
 * CommandCentral-style resource workstation: the assignment backlog beside the
 * live unit roster. Unassigned incidents are ordered by service level so the
 * call closest to breaching its clock is always at the top, and one click hands
 * it to the command board for assignment.
 */
export default function CadResourceBoard({
  calls = [],
  units = [],
  loading = false,
  rosterLoading = false,
  initialStatus = 'All',
  initialUnitSearch = '',
  onOpenCall,
  onRefresh,
  rosterError,
}) {
  const [status, setStatus] = useState(initialStatus || 'All');
  const [query, setQuery] = useState(initialUnitSearch || '');
  const [now] = useState(() => Date.now());
  const [selectedId,setSelectedId]=useState(null);
  const [platoon,setPlatoon]=useState('All');

  const backlog = useMemo(() => calls
    .filter(cadNeedsDispatch)
    .map(call => ({ call, level: cadServiceLevel(call, now) }))
    .sort((a, b) => Number(b.level.state === 'overdue') - Number(a.level.state === 'overdue')
      || (b.level.minutes ?? 0) - (a.level.minutes ?? 0)), [calls, now]);

  const statuses = useMemo(
    () => ['All', ...new Set(units.map(unit => String(unit.status || 'Unknown')))],
    [units],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return dutyRows(units,calls).filter(unit => {
      if(platoon!=='All'&&(unit.platoon||unit.oversight_platoon)!==platoon)return false;
      if (status !== 'All' && String(unit.status || 'Unknown') !== status) return false;
      return !term || [unit.unit_number, unit.rank, unit.last_name, unit.full_name, unit.status, unit.assignment]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [units,calls,status,query,platoon]);

  const key=unit=>String(unit.id||unit.email||unit.officer_email);
  const selected=rows.find(unit=>key(unit)===selectedId);
  const selectedCalls=selected?calls.filter(call=>[...(call.assigned_units||[]),...(call.pathfinder_assignment_unit_ids||[])].some(id=>[selected.id,selected.user_id,selected.active_officer_id,selected.email,selected.officer_email].some(value=>value!=null&&String(value)===String(id)))):[];
  return (
    <div className="cad-resource-board">
      <div className="cad-resource-summary">
        {statuses.map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={status === name}
            data-tone={STATUS_TONE[name.toLowerCase()] || 'normal'}
            onClick={() => setStatus(name)}
          >
            <span>{name}</span>
            <strong>{name === 'All' ? units.length : units.filter(unit => String(unit.status || 'Unknown') === name).length}</strong>
          </button>
        ))}
      </div>
      <div className="cad-resource-grid">
        <section className="cad-terminal-panel">
          <div className="tac-panel-bar">
            <span><RadioTower size={14} /> Assignment backlog <b>{backlog.length}</b></span>
            <span>Oldest first</span>
          </div>
          <div className="cad-terminal-scroll">
            {backlog.map(({ call, level }) => (
              <button key={call.id} type="button" className="cad-resource-call" data-state={level.state} onClick={() => onOpenCall?.(call)}>
                <div><b>{cadReferenceValue(call)}</b><span>{level.code}</span><time>{cadAgeLabel(level.minutes)}</time></div>
                <strong>{call.incident || 'Incident'}</strong>
                <small>{call.location || 'Location pending'}{call.agency ? ` · ${call.agency}` : ''}</small>
                <em>Assign unit <ArrowRight size={13} /></em>
              </button>
            ))}
            {!backlog.length && <p className="tac-empty">{loading ? 'Loading incidents…' : 'Every active incident has an assigned unit.'}</p>}
          </div>
        </section>
        <section className="cad-terminal-panel">
          <div className="tac-panel-bar">
            <span><Users size={14} /> Units <b>{rows.length}</b></span>
            <button type="button" disabled={rosterLoading} onClick={onRefresh}><RefreshCw size={14} className={rosterLoading?"animate-spin":""}/>{rosterLoading?"Updating…":"Refresh"}</button>
          </div>
          <div className="cad-terminal-filter">
            <label>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Unit / officer / status"
                aria-label="Filter units"
              />
            </label>
            <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Unit status">
              {statuses.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div className="cad-terminal-filter"><select aria-label="Platoon" value={platoon} onChange={e=>setPlatoon(e.target.value)}><option>All</option>{[...new Set(units.map(u=>u.platoon||u.oversight_platoon).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select><button type="button" onClick={()=>{setQuery('');setStatus('All');setPlatoon('All');setSelectedId(null);}}>Reset</button></div>
          {rosterError&&<p role="status" className="tac-empty">{rosterError}</p>}
          <div className="cad-terminal-scroll">
            {rows.map(unit => (
              <button type="button" key={key(unit)} aria-pressed={selectedId===key(unit)} onClick={()=>setSelectedId(old=>old===key(unit)?null:key(unit))} className="cad-resource-unit" data-tone={STATUS_TONE[String(unit.status || '').toLowerCase()] || 'normal'}>
                <strong>{unit.unit_number || '—'}</strong>
                <div>
                  <b>{[unit.rank, unit.last_name || unit.full_name].filter(Boolean).join(' ') || 'Officer'}</b>
                  <small>{unit.assignment || 'No active assignment'}</small>
                </div>
                <span>{unit.status || 'Unknown'}</span>
              </button>
            ))}
            {!rows.length && <p className="tac-empty">{rosterLoading ? 'Loading units…' : 'No matching units.'}</p>}
            {selected&&<div className="cad-resource-inspect"><b>Unit {selected.unit_number||'—'} · {[selected.rank,selected.last_name].filter(Boolean).join(' ')||selected.full_name||'Officer'}</b><p>{selected.status||'Unknown'} · {selected.connection_stale?'Connection stale':selected.presence_online||selected.session_active?'Online':'Offline'}</p><p>{selected.platoon||selected.oversight_platoon||'Unassigned'} · GPS {selected.live_location_hidden?'Private':selected.connection_stale?'Stale':selected.gps_updated_at?'Recorded fix':selected.last_gps_updated_at?'Last known':'Unavailable'}</p><p>{selected.assignment}</p>{(selected.last_update_at||selected.last_update)&&<p>Last recorded update: {formatEasternDateTime(selected.last_update_at||selected.last_update)} ET</p>}{selectedCalls.map(call=><button key={call.id} type="button" onClick={()=>onOpenCall?.(call)}>{cadReferenceValue(call)} · {call.incident} · {call.location}</button>)}{!selectedCalls.length&&<p>No active assignment recorded.</p>}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}