import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { AlertOctagon, CheckCircle2, Clock3, Radar, UserX } from 'lucide-react';
import { formatEasternDateTime } from '@/lib/easternTime';

export default function AutoDispatchShadowFeed() {
  const [evaluations, setEvaluations] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await base44.functions.invoke('getAutoDispatchEvaluations', {});
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      const latestByAlert = new Map();
      for (const row of payload.evaluations || []) {
        const key = row.property_alert_id || row.event_key;
        if (!latestByAlert.has(key)) latestByAlert.set(key, row);
      }
      setEvaluations([...latestByAlert.values()].slice(0, 4));
      setError('');
    } catch (err) {
      setError(err?.message || 'Unable to load automatic-dispatch evaluations');
    }
  };

  useEffect(() => {
    load();
    const unsubscribe = base44.entities.AutoDispatchEvaluation.subscribe(() => load());
    const interval = setInterval(load, 15000);
    return () => {
      unsubscribe?.();
      clearInterval(interval);
    };
  }, []);

  if (error) return <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">{error}</div>;
  if (!evaluations.length) return null;

  return (
    <section className="max-h-64 flex-none overflow-y-auto border-b border-cyan-500/30 bg-[#081522] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-cyan-300" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Property Automatic Dispatch</h3>
        </div>
        <Badge className="border border-emerald-500/40 bg-emerald-950 text-emerald-200">AUTO-ASSIGN ACTIVE</Badge>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {evaluations.map(item => {
          const selected = item.ranking?.filter(unit => (item.recommended_unit_ids || []).includes(unit.unit_id)) || [];
          const noUnit = item.decision === 'no_eligible_unit';
          return (
            <article key={item.id} className={`rounded-lg border p-3 ${noUnit ? 'border-red-500/40 bg-red-950/20' : 'border-slate-700 bg-slate-950/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-white">CAD {item.cad_number || item.call_id}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />{formatEasternDateTime(item.evaluated_at)} ET</div>
                </div>
                <Badge className={noUnit ? 'bg-red-700 text-white' : item.decision === 'disabled' ? 'bg-slate-700' : 'bg-cyan-800 text-cyan-100'}>{String(item.decision || '').replaceAll('_', ' ').toUpperCase()}</Badge>
              </div>
              {noUnit ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-black text-red-200"><UserX className="h-4 w-4" />NO ELIGIBLE UNIT AVAILABLE</div>
              ) : selected.length ? (
                <div className="mt-3 space-y-1">
                  {selected.map((unit, index) => (
                    <div key={unit.unit_id} className="flex items-center justify-between gap-2 rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-1.5 text-[10px]">
                      <span className="font-bold text-emerald-100"><CheckCircle2 className="mr-1 inline h-3 w-3" />{index ? 'BACKUP' : 'PRIMARY'} — UNIT {unit.unit_number || 'UNASSIGNED'}</span>
                      <span className="text-emerald-200">{unit.distance_miles} mi · {unit.eta_minutes} min</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-200"><AlertOctagon className="h-4 w-4" />Manual review or property configuration prevents recommendation.</div>
              )}
              <div className="mt-2 text-[10px] text-slate-500">{item.excluded_units?.length || 0} field unit(s) excluded with recorded reasons.</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
