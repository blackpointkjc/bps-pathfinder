import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, RadioTower, X } from 'lucide-react';
import {
  cadAgeLabel,
  cadReferenceValue,
  cadServiceLevel,
} from '@/lib/cadOperationalStatus';
import './cad-upgrade.css';
import {needsPropertyAssignment} from '@/lib/cadWorkspaceModel';
import {monitoredIncidents} from '@/lib/cadMonitorSelection';

const FIELD_SOURCE = /officer|field|mdt|helpm|self|patrol|unit/i;

const isFieldCall = call => FIELD_SOURCE.test(String(call?.source || call?.source_channel || ''));

/**
 * CommandCentral-style incident monitor. Only incidents explicitly pinned by the current user are displayed.
 */
export default function CadIncidentMonitor({ calls = [], loading = false, onOpen, onCollapse, selectedIds=[], onTogglePin,propertyIds=new Set() }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(()=>monitoredIncidents(calls,selectedIds).map(call=>({call,level:cadServiceLevel(call,now),pending:needsPropertyAssignment(call,propertyIds)})),[calls,selectedIds,now,propertyIds]);
  const missing=selectedIds.filter(id=>!rows.some(row=>String(row.call.id)===id));

  const pending = rows.filter(row => row.pending).length;
  const overdue = rows.filter(row => row.level.state === 'overdue').length;

  return (
    <section className="cad-monitor" aria-label="Incident monitor">
      <div className="cad-monitor-bar">
        <span className="cad-monitor-title"><RadioTower size={14} /> My monitored incidents ({rows.length})</span>
        <span className="cad-monitor-counts">
          <b data-tone={pending ? 'warning' : 'normal'}>{pending} pending</b>
          <b data-tone={overdue ? 'danger' : 'normal'}>{overdue} over SLA</b>
        </span>
        <button type="button" onClick={onCollapse} aria-label="Hide the incident monitor" title="Hide incident monitor">
          <ChevronUp size={14} />
        </button>
      </div>
      <div className="cad-monitor-track">
        {rows.map(({ call, level, pending: awaiting }) => (
          <div key={call.id} className="cad-monitor-entry"><button
            type="button"
            className="cad-monitor-chip"
            data-state={level.state}
            data-pending={awaiting}
            onClick={() => onOpen?.(call)}
            title={`${cadReferenceValue(call)} · ${call.incident || 'Incident'} · ${call.location || 'Location pending'}`}
          >
            <span className="cad-monitor-ref">{cadReferenceValue(call)}</span>
            <strong>{call.incident || 'Incident'}</strong>
            <small>{call.location || 'Location pending'}</small>
            <span className="cad-monitor-meta">
              <em data-tone={level.priority}>{level.code}</em>
              <time>{cadAgeLabel(level.minutes)}</time>
              <i>{awaiting ? 'Pending' : 'Active'}</i>
              {isFieldCall(call) && <i data-field="true">Field</i>}
            </span>
          </button>{onTogglePin&&<button className="cad-monitor-remove" type="button" aria-label={'Stop monitoring '+cadReferenceValue(call)} title="Stop monitoring" onClick={()=>onTogglePin(call.id)}><X size={14}/></button>}</div>
        ))}
        {missing.map(id=><div className="cad-monitor-missing" key={id}><span>Incident no longer in live feed</span><button type="button" aria-label="Remove unavailable incident from monitor" onClick={()=>onTogglePin?.(id)}><X size={14}/></button></div>)}
        {!rows.length && !missing.length && (
          <p className="cad-monitor-empty">
            {loading ? 'Loading the live CAD feed…' : 'No calls selected. Use the pin icon on an incident to monitor it.'}
          </p>
        )}
      </div>
    </section>
  );
}