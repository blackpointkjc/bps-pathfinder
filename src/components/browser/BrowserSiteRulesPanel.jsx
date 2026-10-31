import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Ban, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { BROWSER_CATEGORY_OPTIONS, normaliseDomain } from '@/lib/browserProfiles';
import { accessLabel } from '@/utils/accountLabels';

export default function BrowserSiteRulesPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ domain: '', rule_type: 'allow', category: '', scope: 'all', role: '', user_email: '', note: '', expires_at: '' });
  const [error, setError] = useState('');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['browserSiteRules'],
    queryFn: async () => {
      const result = await base44.entities.BrowserSiteRule.list({ sort: '-created_date', limit: 200 });
      return Array.isArray(result) ? result : result?.items || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: payload => base44.entities.BrowserSiteRule.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browserSiteRules'] });
      setForm({ domain: '', rule_type: 'allow', category: '', scope: 'all', role: '', user_email: '', note: '', expires_at: '' });
    },
  });

  const remove = async rule => {
    await base44.entities.BrowserSiteRule.delete(rule.id);
    queryClient.invalidateQueries({ queryKey: ['browserSiteRules'] });
  };

  const toggle = async rule => {
    await base44.entities.BrowserSiteRule.update(rule.id, { active: rule.active === false });
    queryClient.invalidateQueries({ queryKey: ['browserSiteRules'] });
  };

  const submit = event => {
    event.preventDefault();
    const domain = normaliseDomain(form.domain);
    if (!domain || !domain.includes('.')) {
      setError('Enter a valid domain, for example courtlistener.com.');
      return;
    }
    setError('');
    createMutation.mutate({
      domain,
      rule_type: form.rule_type,
      category: form.category,
      scope: form.scope,
      role: form.scope === 'role' ? form.role : '',
      user_email: form.scope === 'user' ? form.user_email.trim().toLowerCase() : '',
      note: form.note.trim(),
      active: true,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    });
  };

  const field = 'h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white';

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-white">Allowlist &amp; blocklist</h2>
        <p className="text-xs text-slate-400">An explicit block always wins. Temporary grants can expire automatically.</p>
      </div>

      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 md:grid-cols-6">
        <label className="text-[11px] font-semibold text-slate-300 md:col-span-2">
          Domain
          <input value={form.domain} onChange={event => setForm({ ...form, domain: event.target.value })} placeholder="example.com" className={`mt-1 ${field}`} />
        </label>
        <label className="text-[11px] font-semibold text-slate-300">
          Rule
          <select value={form.rule_type} onChange={event => setForm({ ...form, rule_type: event.target.value })} className={`mt-1 ${field}`}>
            <option value="allow">Allow</option>
            <option value="block">Block</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-300">
          Category
          <select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} className={`mt-1 ${field}`}>
            <option value="">Uncategorized</option>
            {BROWSER_CATEGORY_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-300">
          Applies to
          <select value={form.scope} onChange={event => setForm({ ...form, scope: event.target.value })} className={`mt-1 ${field}`}>
            <option value="all">Everyone</option>
            <option value="role">One role</option>
            <option value="user">One employee</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-300">
          Expires
          <input type="datetime-local" value={form.expires_at} onChange={event => setForm({ ...form, expires_at: event.target.value })} className={`mt-1 ${field}`} />
        </label>

        {form.scope === 'role' && (
          <label className="text-[11px] font-semibold text-slate-300 md:col-span-2">
            Role
            <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} className={`mt-1 ${field}`}>
              <option value="">Select role…</option>
              {['officer', 'supervisor', 'dispatch', 'cad_access', 'hr', 'accounting', 'trainer', 'support', 'support_staff', 'admin'].map(role => (
                <option key={role} value={role}>{accessLabel(role)}</option>
              ))}
            </select>
          </label>
        )}
        {form.scope === 'user' && (
          <label className="text-[11px] font-semibold text-slate-300 md:col-span-2">
            Employee email
            <input value={form.user_email} onChange={event => setForm({ ...form, user_email: event.target.value })} placeholder="officer@company.com" className={`mt-1 ${field}`} />
          </label>
        )}
        <label className="text-[11px] font-semibold text-slate-300 md:col-span-2">
          Reason
          <input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Business reason" className={`mt-1 ${field}`} />
        </label>
        <div className="flex items-end md:col-span-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-700 bg-cyan-600/20 px-3 text-xs font-semibold text-cyan-100 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Add rule
          </button>
        </div>
        {error && <p className="text-xs font-semibold text-red-400 md:col-span-6">{error}</p>}
      </form>

      {isLoading && <p className="text-xs text-slate-400">Loading rules…</p>}
      {!isLoading && rules.length === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">No allowlist or blocklist entries yet.</p>
      )}

      {rules.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-900 text-[11px] text-slate-400">
              <tr>
                <th className="p-2.5">Domain</th>
                <th className="p-2.5">Rule</th>
                <th className="p-2.5">Applies to</th>
                <th className="p-2.5">Expires</th>
                <th className="p-2.5">Reason</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {rules.map(rule => (
                <tr key={rule.id} className={rule.active === false ? 'opacity-50' : ''}>
                  <td className="p-2.5 font-semibold text-white">{rule.domain}</td>
                  <td className="p-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rule.rule_type === 'allow' ? 'border-emerald-700 bg-emerald-500/10 text-emerald-200' : 'border-red-800 bg-red-500/10 text-red-200'}`}>
                      {rule.rule_type === 'allow' ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                      {rule.rule_type}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-300">
                    {rule.scope === 'role' ? accessLabel(rule.role) : rule.scope === 'user' ? rule.user_email : 'Everyone'}
                  </td>
                  <td className="p-2.5 text-slate-400">{rule.expires_at ? new Date(rule.expires_at).toLocaleString() : 'No expiry'}</td>
                  <td className="max-w-[220px] truncate p-2.5 text-slate-400">{rule.note || '—'}</td>
                  <td className="p-2.5 text-right">
                    <button type="button" onClick={() => toggle(rule)} className="mr-1 min-h-8 rounded border border-slate-700 px-2 text-[10px] text-slate-300">
                      {rule.active === false ? 'Enable' : 'Disable'}
                    </button>
                    <button type="button" aria-label="Delete rule" onClick={() => remove(rule)} className="min-h-8 rounded border border-slate-700 px-2 text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}