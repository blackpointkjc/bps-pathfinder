import CADUnitStatusBoard from '@/components/dispatch/CADUnitStatusBoard';
import { useAuth } from '@/lib/AuthContext';
import { cadAgeLabel, cadReferenceValue, cadServiceLevel } from '@/lib/cadOperationalStatus';
import { ArrowRight } from 'lucide-react';

/**
 * Resource workstation: the live unit status board beside the assignment
 * backlog. Repurposes the existing CAD unit board and pairs it with the
 * longest-holding unassigned incidents so a dispatcher can match a unit to a
 * call without switching screens.
 */
export default function CadResourceBoard({ calls = [], onOpenCall }) {
  const { user } = useAuth();
  const awaiting = calls
    .filter(call => !(Array.isArray(call?.assigned_units) && call.assigned_units.length))
    .map(call => ({ call, level: cadServiceLevel(call) }))
    .sort((a, b) => Number(b.level.state === 'overdue') - Number(a.level.state === 'overdue') || b.level.minutes - a.level.minutes);

  return (
    <div className="cad-resource-board">
      <section className="cad-terminal-panel cad-resource-units">
        <CADUnitStatusBoard currentUser={user} />
      </section>
      <section className="cad-terminal-panel">
        <div className="tac-panel-bar">
          <span>Awaiting assignment · {awaiting.length}</span>
          <span className="cad-panel-hint">Longest hold first</span>
        </div>
        <div className="cad-terminal-scroll">
          {awaiting.map(({ call, level }) => (
            <button key={call.id} type="button" className="cad-awaiting-row" data-state={level.state} onClick={() => onOpenCall?.(call)}>
              <span className="cad-awaiting-code">{level.code}</span>
              <span className="cad-awaiting-body">
                <b>{cadReferenceValue(call)}</b>
                <strong>{call.incident || 'Incident pending'}</strong>
                <small>{call.location || 'Location pending'}</small>
              </span>
              <span className="cad-awaiting-age">
                {cadAgeLabel(level.minutes)}
                <ArrowRight size={14} />
              </span>
            </button>
          ))}
          {!awaiting.length && <p className="tac-empty">Every active incident has a unit assigned.</p>}
        </div>
      </section>
    </div>
  );
}