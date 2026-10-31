import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, UserCog } from 'lucide-react';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { profileLabel, profileTone } from '@/lib/browserProfiles';
import { accessLabel } from '@/utils/accountLabels';

function effectivePolicyFor(user, policies) {
  const active = policies.filter(item => item.active !== false);
  const email = String(user.email || '').toLowerCase();
  const roles = new Set([user.role, ...(user.additional_roles || [])].filter(Boolean).map(role => String(role).toLowerCase()));
  const personal = active.find(item => (item.assigned_emails || []).some(value => String(value).toLowerCase() === email));
  if (personal) return { policy: personal, basis: 'Personal override' };
  const byRole = active.find(item => (item.assigned_roles || []).some(role => roles.has(String(role).toLowerCase())));
  if (byRole) return { policy: byRole, basis: 'Role assignment' };
  return { policy: active.find(item => item.is_default) || active[0] || null, basis: 'Default profile' };
}

export default function BrowserUserAssignment({ focusEmail = '' }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(focusEmail);
  const [selectedEmail, setSelectedEmail] = useState(focusEmail);
  const [targetPolicy, setTargetPolicy] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: policies = [] } = useQuery({
    queryKey: ['browserPolicies'],
    queryFn: async () => {
      const result = await base44.entities.BrowserPolicy.list({ limit: 50 });
      return Array.isArray(result) ? result : result?.items || [];
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['browserAssignableUsers'],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    staleTime: 120000,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = users.filter(user => user && user.email);
    if (!term) return rows.slice(0, 12);
    return rows
      .filter(user => [user.email, user.full_name, user.first_name, user.last_name, user.rank]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term))
      .slice(0, 12);
  }, [users, search]);

  const selected = users.find(user => user.email === selectedEmail) || null;
  const current = selected ? effectivePolicyFor(selected, policies) : null;

  const assign = async () => {
    if (!selected || !targetPolicy) return;
    setSaving(true);
    try {
      await Promise.all(policies
        .filter(policy => (policy.assigned_emails || []).includes(selected.email) && policy.id !== targetPolicy)
        .map(policy => base44.entities.BrowserPolicy.update(policy.id, {
          assigned_emails: (policy.assigned_emails || []).filter(email => email !== selected.email),
        })));
      const chosen = policies.find(policy => policy.id === targetPolicy);
      if (chosen && !(chosen.assigned_emails || []).includes(selected.email)) {
        await base44.entities.BrowserPolicy.update(chosen.id, {
          assigned_emails: [...(chosen.assigned_emails || []), selected.email],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['browserPolicies'] });
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await Promise.all(policies
        .filter(policy => (policy.assigned_emails || []).includes(selected.email))
        .map(policy => base44.entities.BrowserPolicy.update(policy.id, {
          assigned_emails: (policy.assigned_emails || []).filter(email => email !== selected.email),
        })));
      queryClient.invalidateQueries({ queryKey: ['browserPolicies'] });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white placeholder:text-slate-500';

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4 text-cyan-300" />
        <h2 className="text-sm font-bold text-white">Employee browser assignment</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Personal overrides follow the employee account managed under Accounts &amp; Access and beat their role profile.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <label htmlFor="browser-user-search" className="text-[11px] font-semibold text-slate-300">Find employee</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id="browser-user-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Name, rank or email"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">
            {isLoading && <p className="text-xs text-slate-400">Loading employees…</p>}
            {filtered.map(user => {
              const name = [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
              return (
                <button
                  key={user.id || user.email}
                  type="button"
                  onClick={() => setSelectedEmail(user.email)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                    selectedEmail === user.email ? 'border-cyan-700 bg-cyan-600/15 text-white' : 'border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{name}</span>
                    <span className="block truncate text-[10px] text-slate-500">{user.email}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {(user.additional_roles || []).map(accessLabel).slice(0, 2).join(' · ') || accessLabel(user.role)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          {!selected ? (
            <p className="text-xs text-slate-400">Select an employee to review their effective browsing profile.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-white">
                {[selected.rank, selected.last_name].filter(Boolean).join(' ') || selected.full_name || selected.email}
              </p>
              <p className="text-[11px] text-slate-500">{selected.email}</p>
              <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileTone(current?.policy?.profile)}`}>
                {profileLabel(current?.policy?.profile)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{current?.basis} · {current?.policy?.name || 'No profile configured'}</p>

              <label htmlFor="browser-target-policy" className="mt-3 block text-[11px] font-semibold text-slate-300">Assign profile</label>
              <select
                id="browser-target-policy"
                value={targetPolicy}
                onChange={event => setTargetPolicy(event.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">Select a profile…</option>
                {policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!targetPolicy || saving}
                  onClick={assign}
                  className="min-h-10 rounded-lg border border-cyan-700 bg-cyan-600/20 px-3 text-xs font-semibold text-cyan-100 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Assign personal override'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={clearOverride}
                  className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 disabled:opacity-60"
                >
                  Remove override
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}