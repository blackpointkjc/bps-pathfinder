import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Ban, CheckCircle2, Globe, Laptop, ShieldCheck, Users } from 'lucide-react';
import { browserCategoryLabel, profileLabel, profileTone } from '@/lib/browserProfiles';

function useBrowserAdminData() {
  return useQuery({
    queryKey: ['browserAdminOverview'],
    queryFn: async () => {
      const unwrap = value => (Array.isArray(value) ? value : value?.items || []);
      const [policiesResult, rulesResult, requestsResult, activityResult] = await Promise.all([
        base44.entities.BrowserPolicy.list({ limit: 50 }),
        base44.entities.BrowserSiteRule.list({ limit: 200 }),
        base44.entities.BrowserAccessRequest.list({ sort: '-created_date', limit: 100 }),
        base44.entities.BrowserActivity.list({ sort: '-occurred_at', limit: 300 }),
      ]);
      return {
        policies: unwrap(policiesResult),
        rules: unwrap(rulesResult),
        requests: unwrap(requestsResult),
        activity: unwrap(activityResult),
      };
    },
    staleTime: 30000,
  });
}

export default function AdminBrowserOverview() {
  const { data, isLoading } = useBrowserAdminData();
  const policies = data?.policies || [];
  const rules = data?.rules || [];
  const pending = (data?.requests || []).filter(request => request.status === 'pending');
  const activity = data?.activity || [];

  const blocked = activity.filter(record => record.decision === 'blocked');
  const allowed = activity.filter(record => record.decision === 'allowed');

  const topCategories = useMemo(() => {
    const counts = {};
    blocked.forEach(record => {
      const key = record.category || 'unclassified';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [blocked]);

  const repeatUsers = useMemo(() => {
    const counts = {};
    blocked.forEach(record => {
      const key = record.user_email || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [blocked]);

  const cards = [
    { label: 'Browsing profiles', value: policies.length, detail: `${policies.filter(item => item.active !== false).length} active`, icon: ShieldCheck },
    { label: 'Site rules', value: rules.length, detail: `${rules.filter(rule => rule.rule_type === 'block').length} blocked · ${rules.filter(rule => rule.rule_type === 'allow').length} allowed`, icon: Ban },
    { label: 'Pending requests', value: pending.length, detail: 'Awaiting administrator review', icon: Users },
    { label: 'Blocked attempts', value: blocked.length, detail: `of ${activity.length} recorded decisions`, icon: AlertTriangle },
    { label: 'Approved access', value: allowed.length, detail: 'Searches and visits allowed', icon: CheckCircle2 },
    { label: 'Repeat violations', value: repeatUsers.length, detail: 'Employees with 3 or more blocks', icon: Globe },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950">
                <Icon className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-none text-white">{isLoading ? '—' : card.value}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-300">{card.label}</p>
                <p className="truncate text-[10px] text-slate-500">{card.detail}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <h2 className="text-sm font-bold text-white">Blocked categories</h2>
          {topCategories.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No blocked attempts recorded yet.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {topCategories.map(([key, count]) => (
                <div key={key} className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-36 shrink-0 truncate">{browserCategoryLabel(key)}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <span className="block h-full rounded-full bg-red-500/70" style={{ width: `${Math.round((count / (topCategories[0][1] || 1)) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right text-slate-300">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <h2 className="text-sm font-bold text-white">Policy coverage by role</h2>
          <div className="mt-2 space-y-1.5">
            {policies.map(policy => (
              <div key={policy.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-white">{policy.name}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {(policy.assigned_roles || []).join(', ') || 'No role assigned'}
                    {(policy.assigned_emails || []).length ? ` · ${policy.assigned_emails.length} personal` : ''}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${profileTone(policy.profile)}`}>
                  {profileLabel(policy.profile)}
                </span>
              </div>
            ))}
            {!policies.length && <p className="text-xs text-slate-400">No profiles configured.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-amber-800/60 bg-amber-950/15 p-3">
        <div className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-bold text-white">Enforcement boundary</h2>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-slate-300">
          This console governs browsing performed inside the managed company browser only. Employees can bypass restrictions
          through other browsers, mobile applications, alternate DNS services, VPNs or external networks. Full enforcement
          requires device management (MDM), enterprise browser policies, DNS filtering or a secure web gateway alongside this
          console. Keep Strict Search Only as the default and manage exceptions here.
        </p>
      </section>
    </div>
  );
}