import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { BROWSER_CATEGORY_OPTIONS, browserCategoryLabel } from '@/lib/browserProfiles';

export default function BrowserActivityPanel() {
  const [decision, setDecision] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['browserActivity'],
    queryFn: async () => {
      const result = await base44.entities.BrowserActivity.list({ sort: '-occurred_at', limit: 300 });
      return Array.isArray(result) ? result : result?.items || [];
    },
    staleTime: 30000,
  });

  const filtered = useMemo(() => records.filter(record => {
    if (decision !== 'all' && record.decision !== decision) return false;
    if (category !== 'all' && (record.category || '') !== category) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [record.user_email, record.user_name, record.domain, record.url, record.query, record.reason]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(term);
  }), [records, decision, category, search]);

  const breakdown = useMemo(() => {
    const counts = {};
    filtered.filter(record => record.decision === 'blocked').forEach(record => {
      const key = record.category || 'unclassified';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  const selectClass = 'h-9 rounded-lg border border-slate-600 bg-slate-950 px-2 text-xs text-white';

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-white">Browsing activity</h2>
        <p className="text-xs text-slate-400">
          Most recent 300 decisions (approved searches and visit attempts). Retain only for legitimate business and security needs.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Employee, domain or search text"
          aria-label="Filter browsing activity"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 text-xs text-white placeholder:text-slate-500"
        />
        <select value={decision} onChange={event => setDecision(event.target.value)} className={selectClass} aria-label="Decision filter">
          <option value="all">All decisions</option>
          <option value="allowed">Allowed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={category} onChange={event => setCategory(event.target.value)} className={selectClass} aria-label="Category filter">
          <option value="all">All categories</option>
          <option value="">Uncategorized</option>
          <option value="search">Approved search</option>
          {BROWSER_CATEGORY_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </div>

      {breakdown.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <p className="text-[11px] font-semibold text-slate-300">Blocked by category</p>
          <div className="mt-2 space-y-1.5">
            {breakdown.map(([key, count]) => {
              const max = breakdown[0][1] || 1;
              return (
                <div key={key} className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-36 shrink-0 truncate">{browserCategoryLabel(key)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <span className="block h-full rounded-full bg-red-500/70" style={{ width: `${Math.round((count / max) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right text-slate-300">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && <p className="text-xs text-slate-400">Loading activity…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">No browsing activity matches these filters.</p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-900 text-[11px] text-slate-400">
              <tr>
                <th className="p-2.5">Time</th>
                <th className="p-2.5">Employee</th>
                <th className="p-2.5">Destination</th>
                <th className="p-2.5">Category</th>
                <th className="p-2.5">Decision</th>
                <th className="p-2.5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {filtered.slice(0, 120).map(record => (
                <tr key={record.id}>
                  <td className="whitespace-nowrap p-2.5 text-slate-400">
                    {record.occurred_at ? format(new Date(record.occurred_at), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td className="max-w-[160px] truncate p-2.5 text-slate-300">{record.user_name || record.user_email}</td>
                  <td className="max-w-[220px] p-2.5">
                    <span className="block truncate font-semibold text-white">{record.domain}</span>
                    {record.query && <span className="block truncate text-[10px] text-slate-500">{record.query}</span>}
                  </td>
                  <td className="p-2.5 text-slate-400">{browserCategoryLabel(record.category)}</td>
                  <td className="p-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${record.decision === 'allowed' ? 'border-emerald-700 bg-emerald-500/10 text-emerald-200' : 'border-red-800 bg-red-500/10 text-red-200'}`}>
                      {record.decision}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate p-2.5 text-slate-400" title={record.reason}>{record.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}