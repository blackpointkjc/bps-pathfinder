import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function IncidentPerformanceDetails({ jobDuty, isAdmin, onChanged }) {
  const [busy, setBusy] = useState(null);
  const items = (jobDuty?.shifts || []).flatMap(shift => (shift.incidents?.items || []).map(item => ({ ...item, property: shift.property })));
  const decide = async (item, reason) => {
    if (busy) return;
    setBusy(item.call_id);
    try {
      await base44.entities.CallPerformanceDecision.create({ call_id: String(item.call_id), excluded: reason !== 'restored', reason });
      toast.success(reason === 'restored' ? 'Call restored to performance metrics.' : 'Call excluded from incident performance metrics for all officers.');
      await onChanged();
    } catch (error) {
      toast.error(error?.message || 'Unable to save the decision.');
    } finally { setBusy(null); }
  };
  return <details className="mt-3 rounded-md border border-slate-700 p-3 text-xs text-slate-300">
    <summary className="cursor-pointer font-semibold text-cyan-300">Incident call details · {items.length} calls · {jobDuty?.incidentReports?.excluded || 0} excluded</summary>
    <p className="mt-2 text-slate-400">Property calls during the officer’s shift count while active. A submitted linked incident report satisfies the requirement. Admin exclusions apply to this call for all officers; dispatch remains active.</p>
    {items.length === 0 && <p className="mt-2">No matching calls under the property’s incident-report rule in this period.</p>}
    {items.map((item, index) => <div key={item.call_id + ':' + index} className="mt-2 rounded border border-slate-700 bg-slate-950/50 p-2">
      <div className="font-semibold text-white">{item.call_number || item.call_id} · {item.call_type || 'Call for service'}</div>
      <div>{item.property} · {item.call_location}</div>
      <div className="mt-1">{item.status === 'completed' ? 'Report submitted: ' + item.report_number : item.status === 'missing' ? 'Incident report required' : 'Excluded: ' + item.reason}</div>
      {item.decision_by && <div className="text-slate-400">Recorded by {item.decision_by}</div>}
      {isAdmin && !item.status.startsWith('excluded_reassignment') && <div className="mt-2 flex flex-wrap gap-2">
        {item.status === 'excluded_admin' ?
          <button disabled={!!busy} onClick={() => decide(item, 'restored')} className="rounded border border-cyan-700 px-2 py-1 disabled:opacity-50">Restore to metrics</button> :
          <><button disabled={!!busy} onClick={() => decide(item, 'off_property')} className="rounded border border-slate-500 px-2 py-1 disabled:opacity-50">Exclude: off property</button>
          <button disabled={!!busy} onClick={() => decide(item, 'offsite')} className="rounded border border-slate-500 px-2 py-1 disabled:opacity-50">Exclude: offsite</button></>}
      </div>}
    </div>)}
  </details>;
}
