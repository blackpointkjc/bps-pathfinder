import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, RadioTower } from 'lucide-react';
import {
  cadAgeLabel,
  cadNeedsDispatch,
  cadReferenceValue,
  cadServiceLevel,
} from '@/lib/cadOperationalStatus';
import './cad-upgrade.css';

const FIELD_SOURCE = /officer|field|mdt|helpm|self|patrol|unit/i;

const isFieldCall = call => FIELD_SOURCE.test(String(call?.source || call?.source_channel || ''));

/**
 * CommandCentral-style incident monitor. Outstanding calls stay on screen on
 * every workstation for their whole lifecycle: pending dispatch first, then the
 * calls already assigned but at or past their service level.
 */
export default function CadIncidentMonitor({ calls = [], loading = false, onOpen, onCollapse }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(() => calls
    .map(call => {
      const level = cadServiceLevel(call, now);
      const pending = cadNeedsDispatch(call);
      return { call, level, pending };
    })
    .filter(row => row.pending || row.level.state === 'overdue' || row.level.state === 'watch')
    .sort((a, b) => {
      if (a.pending !== b.pending) return a.pending ? -1 : 1;
      return (b.level.minutes ?? -1) - (a.level.minutes ?? -1);
    })
    .slice(0, 12), [calls, now]);

  const pending = rows.filter(row => row.pending).length;
  const overdue = rows.filter(row => row.level.state === 'overdue').length;

  return (
    <section className="cad-monitor" aria-label="Incident monitor">
      <div className="cad-monitor-bar">
        <span className="cad-monitor-title"><RadioTower size={14} /> Incident monitor</span>
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
          <button
            key={call.id}
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
          </button>
        ))}
        {!rows.length && (
          <p className="cad-monitor-empty">
            {loading ? 'Loading the live CAD feed…' : 'No pending or at-risk incidents right now.'}
          </p>
        )}
      </div>
    </section>
  );
}