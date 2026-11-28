import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatEasternDateTime } from '@/lib/easternTime';
import { Activity, RefreshCw } from 'lucide-react';
import './cad-upgrade.css';

const FIELD_SOURCE = /officer|field|mdt|helpm|self|patrol|unit/i;

const stamp = value => {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
};

const minutes = (from, to) => {
  const start = stamp(from);
  const end = stamp(to);
  if (start == null || end == null || end < start) return null;
  return (end - start) / 60000;
};

const median = values => {
  const list = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
};

const duration = value => {
  if (value == null) return '—';
  if (value < 1) return `${Math.round(value * 60)}s`;
  return `${value.toFixed(1)} min`;
};

/**
 * Response analytics from recorded Pathfinder CAD activity — the same
 * DispatchCall, CallHistory and CallAssignment records the board dispatches on.
 * Nothing here is simulated: every figure is measured from stored timestamps.
 */
export default function CadResponseAnalytics() {
  const query = useQuery({
    queryKey: ['cadResponseAnalytics'],
    queryFn: async () => {
      const results = await Promise.allSettled([
        base44.entities.DispatchCall.list('-created_date', 300),
        base44.entities.CallHistory.list('-archived_date', 200),
        base44.entities.CallAssignment.list('-assigned_at', 300),
      ]);
      const labels=['Live calls','Archived calls','Assignments'];
      const warnings=results.flatMap((result,index)=>result.status==='rejected'?[labels[index]+' unavailable']:[]);
      if(warnings.length===results.length)throw new Error(warnings.join('; '));
      const [live,archived,assignments]=results.map(result=>result.status==='fulfilled'?result.value:[]);
      const seen = new Set();
      const calls = [...(live || []), ...(archived || [])].filter(call => {
        const key = String(call.original_call_id || call.id || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { calls, assignments: assignments || [], warnings };
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const metrics = useMemo(() => {
    const calls = query.data?.calls || [];
    const assignments = query.data?.assignments || [];
    const dispatch = calls.map(call => minutes(call.time_received || call.created_date, call.time_dispatched));
    const acknowledgement = assignments.map(row => minutes(row.assigned_at, row.accepted_at));
    const travel = calls.map(call => minutes(call.time_dispatched, call.time_on_scene));
    const clearance = calls.map(call => minutes(call.time_on_scene, call.time_cleared || call.time_closed));
    const total = calls.map(call => minutes(call.time_received || call.created_date, call.time_cleared || call.time_closed));
    const open = calls.filter(call => !stamp(call.time_closed) && !stamp(call.time_cleared));

    const byAgency = new Map();
    for (const call of calls) {
      const agency = String(call.agency || 'Black Point').trim() || 'Black Point';
      const bucket = byAgency.get(agency) || { agency, calls: 0, dispatch: [], travel: [], total: [] };
      bucket.calls += 1;
      const dispatched = minutes(call.time_received || call.created_date, call.time_dispatched);
      const travelled = minutes(call.time_dispatched, call.time_on_scene);
      const completed = minutes(call.time_received || call.created_date, call.time_cleared || call.time_closed);
      if (dispatched != null) bucket.dispatch.push(dispatched);
      if (travelled != null) bucket.travel.push(travelled);
      if (completed != null) bucket.total.push(completed);
      byAgency.set(agency, bucket);
    }

    return {
      sampled: calls.length,
      open: open.length,
      field: calls.filter(call => FIELD_SOURCE.test(String(call.source || call.source_channel || ''))).length,
      dispatch: median(dispatch),
      acknowledgement: median(acknowledgement),
      travel: median(travel),
      clearance: median(clearance),
      total: median(total),
      measured: dispatch.filter(value => value != null).length,
      agencies: [...byAgency.values()].sort((a, b) => b.calls - a.calls).slice(0, 6).map(bucket => ({
        agency: bucket.agency,
        calls: bucket.calls,
        dispatch: median(bucket.dispatch),
        travel: median(bucket.travel),
        total: median(bucket.total),
      })),
      recent: [...calls]
        .filter(call => stamp(call.time_cleared) || stamp(call.time_closed))
        .sort((a, b) => (stamp(b.time_cleared || b.time_closed) || 0) - (stamp(a.time_cleared || a.time_closed) || 0))
        .slice(0, 8)
        .map(call => ({
          id: call.id,
          incident: call.incident || 'Incident',
          agency: call.agency || 'Black Point',
          cleared: call.time_cleared || call.time_closed,
          total: minutes(call.time_received || call.created_date, call.time_cleared || call.time_closed),
        })),
    };
  }, [query.data]);

  const kpis = [
    { key: 'dispatch', label: 'Dispatch', value: metrics.dispatch, note: 'received → dispatched' },
    { key: 'ack', label: 'Acknowledged', value: metrics.acknowledgement, note: 'assigned → accepted' },
    { key: 'travel', label: 'Travel', value: metrics.travel, note: 'dispatched → on scene' },
    { key: 'clearance', label: 'Clearance', value: metrics.clearance, note: 'on scene → cleared' },
    { key: 'total', label: 'Total response', value: metrics.total, note: 'received → cleared' },
  ];

  return (
    <section className="cad-analytics">
      <header className="cad-analytics-bar">
        <h2><Activity size={16} /> Response analytics</h2>
        <span className="cad-analytics-note">
          {query.isLoading ? 'Measuring recorded CAD activity…' : `${metrics.sampled} sampled calls · ${metrics.measured} timed · ${metrics.field} field-initiated`}
        </span>
        <button type="button" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw size={14} /> {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {query.isError && <p className="cad-analytics-warning" role="alert">Response records could not be measured. {query.error?.message}</p>}

      {!!query.data?.warnings?.length&&<p className="cad-analytics-warning" role="alert">Partial sample: {query.data.warnings.join('; ')}. Missing data is not counted as zero.</p>}
      <div className="cad-analytics-kpis">
        {kpis.map(kpi => (
          <div key={kpi.key} className="cad-analytics-kpi">
            <span>{kpi.label}</span>
            <strong>{duration(kpi.value)}</strong>
            <small>median · {kpi.note}</small>
          </div>
        ))}
      </div>

      <div className="cad-analytics-grid">
        <div className="cad-analytics-panel">
          <div className="cad-panel-bar"><span>Agency performance</span><span>{metrics.open} open now</span></div>
          <div className="cad-analytics-table-wrap">
            <table className="cad-analytics-table">
              <thead>
                <tr><th>Agency</th><th>Calls</th><th>Dispatch</th><th>Travel</th><th>Total</th></tr>
              </thead>
              <tbody>
                {metrics.agencies.map(row => (
                  <tr key={row.agency}>
                    <td>{row.agency}</td>
                    <td>{row.calls}</td>
                    <td>{duration(row.dispatch)}</td>
                    <td>{duration(row.travel)}</td>
                    <td>{duration(row.total)}</td>
                  </tr>
                ))}
                {!metrics.agencies.length && (
                  <tr><td colSpan={5}>{query.isLoading ? 'Loading recorded calls…' : 'No recorded CAD calls to measure yet.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="cad-analytics-panel">
          <div className="cad-panel-bar"><span>Recently cleared</span></div>
          <div className="cad-analytics-recent">
            {metrics.recent.map(call => (
              <article key={call.id}>
                <div><b>{call.incident}</b><small>{call.agency}</small></div>
                <div><time>{call.cleared ? `${formatEasternDateTime(call.cleared)} ET` : '—'}</time><em>{duration(call.total)}</em></div>
              </article>
            ))}
            {!metrics.recent.length && <p className="cad-analytics-empty">{query.isLoading ? 'Loading cleared calls…' : 'No cleared calls in the measured window.'}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}