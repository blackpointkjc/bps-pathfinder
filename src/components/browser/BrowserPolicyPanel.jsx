import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import BrowserPolicyEditor from '@/components/browser/BrowserPolicyEditor';
import { browserCategoryLabel, profileLabel, profileTone } from '@/lib/browserProfiles';
import { accessLabel } from '@/utils/accountLabels';
import { confirmInApp } from '@/lib/inAppDialog';

export default function BrowserPolicyPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['browserPolicies'],
    queryFn: async () => {
      const result = await base44.entities.BrowserPolicy.list({ sort: '-is_default', limit: 50 });
      return Array.isArray(result) ? result : result?.items || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async payload => (editing?.id
      ? base44.entities.BrowserPolicy.update(editing.id, payload)
      : base44.entities.BrowserPolicy.create(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browserPolicies'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = async policy => {
    if (!(await confirmInApp(`Delete the browsing profile "${policy.name}"? Employees on it fall back to the default profile.`))) return;
    await base44.entities.BrowserPolicy.delete(policy.id);
    queryClient.invalidateQueries({ queryKey: ['browserPolicies'] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Browsing profiles</h2>
          <p className="text-xs text-slate-400">Restrictions apply automatically to the user's existing company role. Admin and Full Access always receive Administrator Access.</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-cyan-700 bg-cyan-600/20 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-600/30"
        >
          <Plus className="h-4 w-4" /> New profile
        </button>
      </div>

      {isLoading && <p className="text-xs text-slate-400">Loading profiles…</p>}
      {!isLoading && policies.length === 0 && (
        <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">No browsing profiles configured yet.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {policies.map(policy => (
          <article key={policy.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white">{policy.name}</h3>
                  {policy.is_default && <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">Default</span>}
                  {policy.active === false && <span className="rounded border border-red-800 px-1.5 py-0.5 text-[10px] text-red-300">Inactive</span>}
                </div>
                <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileTone(policy.profile)}`}>
                  <ShieldCheck className="h-3 w-3" /> {profileLabel(policy.profile)}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label="Edit profile" onClick={() => { setEditing(policy); setOpen(true); }} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Delete profile" onClick={() => remove(policy)} className="rounded-lg border border-slate-700 p-2 text-red-300 hover:border-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {policy.description && <p className="mt-2 text-[11px] leading-5 text-slate-400">{policy.description}</p>}

            <dl className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between gap-2">
                <dt>Roles</dt>
                <dd className="text-right text-slate-200">{(policy.assigned_roles || []).map(accessLabel).join(', ') || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Personal overrides</dt>
                <dd className="text-right text-slate-200">{(policy.assigned_emails || []).length || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Blocked categories</dt>
                <dd className="text-right text-slate-200">{(policy.blocked_categories || []).length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Mode</dt>
                <dd className="text-right text-slate-200">{policy.strict_search_only ? 'Strict search-only' : 'Websites allowed'}</dd>
              </div>
            </dl>

            {(policy.blocked_categories || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(policy.blocked_categories || []).slice(0, 6).map(category => (
                  <span key={category} className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{browserCategoryLabel(category)}</span>
                ))}
                {(policy.blocked_categories || []).length > 6 && <span className="text-[10px] text-slate-500">+{policy.blocked_categories.length - 6} more</span>}
              </div>
            )}
          </article>
        ))}
      </div>

      <BrowserPolicyEditor
        open={open}
        policy={editing}
        saving={saveMutation.isPending}
        onOpenChange={value => { setOpen(value); if (!value) setEditing(null); }}
        onSave={payload => saveMutation.mutate(payload)}
      />
    </div>
  );
}