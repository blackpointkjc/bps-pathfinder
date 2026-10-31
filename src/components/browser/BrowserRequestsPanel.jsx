import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Check, X } from 'lucide-react';

const DURATIONS = [
  { value: 1, label: '1 hour' },
  { value: 4, label: '4 hours' },
  { value: 8, label: 'One shift (8h)' },
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
];

const STATUS_STYLES = {
  pending: 'border-amber-700 bg-amber-500/10 text-amber-200',
  approved: 'border-emerald-700 bg-emerald-500/10 text-emerald-200',
  denied: 'border-red-800 bg-red-500/10 text-red-200',
  expired: 'border-slate-700 bg-slate-800 text-slate-300',
};

export default function BrowserRequestsPanel({ reviewer }) {
  const queryClient = useQueryClient();
  const [durations, setDurations] = useState({});
  const [busyId, setBusyId] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['browserRequests'],
    queryFn: async () => {
      const result = await base44.entities.BrowserAccessRequest.list({ sort: '-created_date', limit: 100 });
      return Array.isArray(result) ? result : result?.items || [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['browserRequests'] });
    queryClient.invalidateQueries({ queryKey: ['browserActivity'] });
  };

  const decide = async (request, approve) => {
    setBusyId(request.id);
    try {
      const hours = Number(durations[request.id] || 24);
      await base44.entities.BrowserAccessRequest.update(request.id, approve
        ? {
          status: 'approved',
          duration_hours: hours,
          expires_at: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
          decided_by: reviewer?.full_name || reviewer?.email || 'Administrator',
          decided_by_email: reviewer?.email || '',
          decided_at: new Date().toISOString(),
          decision_note: `Temporary access for ${hours} hour(s).`,
        }
        : {
          status: 'denied',
          decided_by: reviewer?.full_name || reviewer?.email || 'Administrator',
          decided_by_email: reviewer?.email || '',
          decided_at: new Date().toISOString(),
          decision_note: 'Request denied by administrator.',
        });
      refresh();
    } finally {
      setBusyId('');
    }
  };

  const pending = requests.filter(request => request.status === 'pending');
  const history = requests.filter(request => request.status !== 'pending');

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-white">Access requests</h2>
        <p className="text-xs text-slate-400">Approve temporary access without changing company-wide policy.</p>
      </div>

      {isLoading && <p className="text-xs text-slate-400">Loading requests…</p>}
      {!isLoading && pending.length === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">No requests are awaiting review.</p>
      )}

      <div className="grid gap-2 lg:grid-cols-2">
        {pending.map(request => (
          <article key={request.id} className="rounded-xl border border-amber-800/60 bg-amber-950/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{request.domain}</p>
                <p className="truncate text-[11px] text-slate-400">{request.user_name || request.user_email}</p>
              </div>
              <span className="rounded-full border border-amber-700 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">pending</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-300">{request.justification}</p>
            <p className="mt-1 text-[10px] text-slate-500">{request.created_date ? format(new Date(request.created_date), 'MMM d, yyyy HH:mm') : ''}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Temporary access duration for ${request.domain}`}
                value={durations[request.id] || 24}
                onChange={event => setDurations(current => ({ ...current, [request.id]: event.target.value }))}
                className="h-9 rounded-lg border border-slate-600 bg-slate-950 px-2 text-xs text-white"
              >
                {DURATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => decide(request, true)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-700 bg-emerald-600/20 px-3 text-xs font-semibold text-emerald-100 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                type="button"
                disabled={busyId === request.id}
                onClick={() => decide(request, false)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-800 px-3 text-xs font-semibold text-red-200 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> Deny
              </button>
            </div>
          </article>
        ))}
      </div>

      {history.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-slate-900 text-[11px] text-slate-400">
              <tr>
                <th className="p-2.5">Employee</th>
                <th className="p-2.5">Domain</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Expires</th>
                <th className="p-2.5">Decided by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {history.slice(0, 40).map(request => (
                <tr key={request.id}>
                  <td className="p-2.5 text-slate-300">{request.user_name || request.user_email}</td>
                  <td className="p-2.5 font-semibold text-white">{request.domain}</td>
                  <td className="p-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[request.status] || STATUS_STYLES.expired}`}>{request.status}</span>
                  </td>
                  <td className="p-2.5 text-slate-400">{request.expires_at ? format(new Date(request.expires_at), 'MMM d, HH:mm') : '—'}</td>
                  <td className="p-2.5 text-slate-400">{request.decided_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}