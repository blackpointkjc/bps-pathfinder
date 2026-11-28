import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { cadRecommendUnits } from '@/lib/cadRecommendations';
import { Crosshair, Send } from 'lucide-react';
import './cad-upgrade.css';

const unitLabel = unit => {
  const rank = String(unit?.rank || '').trim();
  const last = String(unit?.last_name || unit?.full_name || '').trim().split(/\s+/).pop();
  const name = [rank, last].filter(Boolean).join(' ');
  return name || (unit?.unit_number ? `Unit ${unit.unit_number}` : 'Field unit');
};

/**
 * Intelligent unit recommendations for the incident being worked. The ranking
 * comes from live Pathfinder data only: availability, a fresh GPS fix and the
 * work the unit is already carrying. Assignment runs through the same
 * manageCadUnitAssignment function the dispatch board uses.
 */
export default function CadRecommendationList({ call, units = [], onAssigned }) {
  const [working, setWorking] = useState('');
  const [feedback, setFeedback] = useState('');

  const recommendations = useMemo(() => cadRecommendUnits(call, units, 3), [call, units]);

  const assign = async item => {
    if (!call?.id || working) return;
    setWorking(item.unit.id);
    setFeedback('');
    try {
      const response = await base44.functions.invoke('manageCadUnitAssignment', {
        action: 'assign',
        call_id: call.id,
        unit_id: item.unit.id,
      });
      const payload = response?.data || {};
      if (payload.error) throw new Error(payload.error);
      setFeedback(`${unitLabel(item.unit)} assigned to this incident.`);
      window.dispatchEvent(new CustomEvent('bps-data-changed', {
        detail: { kind: 'entity', name: 'DispatchCall', method: 'update', at: Date.now() },
      }));
      onAssigned?.();
    } catch (error) {
      setFeedback(error?.response?.data?.error || error?.message || 'Assignment could not be saved.');
    } finally {
      setWorking('');
    }
  };

  return (
    <div className="cad-recommend">
      {recommendations.map(item => (
        <article key={item.unit.id || item.unit.email} className="cad-recommend-row">
          <div>
            <b>{unitLabel(item.unit)}</b>
            <small>{item.reasons.join(' · ')}</small>
          </div>
          <button
            type="button"
            onClick={() => assign(item)}
            disabled={Boolean(working)}
            aria-label={`Assign ${unitLabel(item.unit)} to this incident`}
          >
            {working === item.unit.id ? 'Assigning…' : <><Send size={13} /> Assign</>}
          </button>
        </article>
      ))}
      {!recommendations.length && (
        <p className="cad-recommend-empty">
          <Crosshair size={14} /> No eligible unit right now — every field unit is offline, stale, held or already assigned.
        </p>
      )}
      {feedback && <p className="cad-recommend-feedback" role="status">{feedback}</p>}
    </div>
  );
}