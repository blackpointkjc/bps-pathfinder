import { useMemo, useState } from 'react';
import { ArrowRight, RadioTower, Users } from 'lucide-react';
import {
  cadAgeLabel,
  cadNeedsDispatch,
  cadReferenceValue,
  cadServiceLevel,
} from '@/lib/cadOperationalStatus';
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
  onOpenUnits,
}) {
  const [status, setStatus] = useState(initialStatus || 'All');
  const [query, setQuery] = useState(initialUnitSearch || '');
  const [now] = useState(() => Date.now());

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
    return units.filter(unit => {
      if (status !== 'All' && String(unit.status || 'Unknown') !== status) return false;
      return !term || [unit.unit_number, unit.rank, unit.last_name, unit.full_name, unit.status, unit.current_call_info]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [units, status, query]);

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
            <button type="button" onClick={onOpenUnits}>Full board</button>
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
          <div className="cad-terminal-scroll">
            {rows.map(unit => (
              <div key={unit.id || unit.email} className="cad-resource-unit" data-tone={STATUS_TONE[String(unit.status || '').toLowerCase()] || 'normal'}>
                <strong>{unit.unit_number || '—'}</strong>
                <div>
                  <b>{[unit.rank, unit.last_name || unit.full_name].filter(Boolean).join(' ') || 'Officer'}</b>
                  <small>{unit.current_call_info || unit.platoon || 'No active assignment'}</small>
                </div>
                <span>{unit.status || 'Unknown'}</span>
              </div>
            ))}
            {!rows.length && <p className="tac-empty">{rosterLoading ? 'Loading units…' : 'No matching units.'}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}