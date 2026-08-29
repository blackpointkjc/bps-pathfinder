import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Clock3, Building2, Users, ClipboardCheck, ArrowRight, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { buildDirectoryIndex, operationalName } from '@/lib/operationalDisplay';

const actions = [
  { label: 'Company Employees', detail: 'Employee records, assignments and status', icon: Users, page: 'HRManageCompanyEmployees' },
  { label: 'Time Entries', detail: 'Review and manage employee time records', icon: Clock3, page: 'ManageTimeEntries' },
  { label: 'PTO & Leave', detail: 'Approvals, manual PTO and leave history', icon: CalendarClock, page: 'AdminPTOApproval' },
  { label: 'Performance Reviews', detail: 'HR performance review workflow', icon: ClipboardCheck, page: 'AdminPerformanceReviews' },
  { label: 'Client Assignments', detail: 'Manage client accounts and employee assignments', icon: Building2, page: 'ManageClients' },
];

const clean = value => String(value || '').replace(/_/g, ' ').trim();

export default function HROverview() {
  const queryClient = useQueryClient();
  const completeTask = useMutation({
    mutationFn: async item => {
      const result = await base44.functions.invoke('getRoleWorkQueue', {
        action: 'complete',
        task_key: item.id,
        title: item.title,
        person: item.person,
        kind: item.kind,
        source_id: item.source_id,
        queue_role: 'hr',
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hrOverviewSnapshot'] }),
  });

  const { data = {}, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['hrOverviewSnapshot'],
    queryFn: async () => {
      // Idempotent: creates only annual reviews that are actually due and missing.
      const annualResult = await base44.functions.invoke('generateAnnualPerformanceReviews', {}).catch(err => ({ data: { error: err?.message || 'Annual review check failed' } }));
      const annualPayload = annualResult?.data || annualResult || {};
      const queueResult = await base44.functions.invoke('getRoleWorkQueue', { queue_role: 'hr' });
      const queue = queueResult?.data || queueResult || {};
      if (queue.error) throw new Error(queue.error);
      const previous = queryClient.getQueryData(['hrOverviewSnapshot']) || {};
      if (queue.load_errors?.length && previous.tasks?.length) {
        const mergedTasks = [...(queue.tasks || []), ...previous.tasks]
          .filter((task, index, rows) => rows.findIndex(item => item.id === task.id) === index);
        return {
          ...queue,
          tasks: mergedTasks,
          counts: { ...(previous.counts || {}), total: mergedTasks.length },
          annual_review_check_error: annualPayload.error || '',
          retaining_last_confirmed_tasks: true,
        };
      }
      return { ...queue, annual_review_check_error: annualPayload.error || '' };
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 60 * 1000,
  });

  const employees = (data.employees || []).filter(row => !row.termination_date);
  const directory = buildDirectoryIndex(employees);
  const counts = data.counts || {};
  const activeEntries = data.active_entries || [];
  const pendingActions = data.tasks || [];

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102239] via-[#0b1726] to-[#07101c] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Briefcase className="h-4 w-4"/>Human Resources Command</div><h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">HR Operations Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Live workforce status plus the actual HR approvals and review steps waiting for action.</p></div>
            <div className="flex flex-wrap items-center gap-2"><div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING HR DATA' : `${pendingActions.length} ACTIONS WAITING`}</div><button type="button" onClick={() => refetch()} disabled={isFetching} className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs font-black text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">{isFetching ? 'CHECKING…' : 'REFRESH TASKS'}</button></div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Active Employees', counts.active_employees ?? employees.length, Users, 'Directory accounts currently active'], ['Clocked In', counts.clocked_in ?? activeEntries.length, UserCheck, 'Employees with open time entries'], ['Attendance Exceptions', (counts.missed_clock_ins || 0) + (counts.late_clock_outs || 0), AlertCircle, 'Missed clock-ins and late clock-outs awaiting review'], ['All Pending HR Work', counts.total || 0, ClipboardCheck, 'Attendance, PTO and performance reviews']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-lg"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Icon className="h-5 w-5"/></div><span className="text-3xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5">
            <div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Pending Actions</div><h3 className="mt-1 text-xl font-black">HR work queue</h3></div><AlertCircle className="h-5 w-5 text-amber-300"/></div>
            <div className="mt-4 space-y-2">
              {!!data.load_errors?.length && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">Partial queue data: {data.load_errors.join(', ')} could not be loaded. Available tasks are still shown below.</div>}
              {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">HR work queue could not load: {error.message}</div> : pendingActions.length ? pendingActions.slice(0, 16).map(item => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-bold text-white">{item.title}</div><div className="text-xs font-bold text-amber-200">{item.person}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div></div><div className="flex shrink-0 flex-wrap gap-2"><Link to={createPageUrl(item.page)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-center text-xs font-black text-cyan-200 hover:bg-cyan-500/20">OPEN TASK</Link><button type="button" onClick={() => completeTask.mutate(item)} disabled={completeTask.isPending} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">MARK DONE</button></div></div>) : <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-800/60 p-7 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4"/>No HR actions are waiting.</div>}
              {!!data.recently_completed?.length && <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-400">Recently completed ({data.recently_completed.length})</summary><div className="mt-3 space-y-2">{data.recently_completed.slice(0,6).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs"><span className="font-bold text-slate-300">{item.title || item.task_key}</span><span className="text-emerald-300">{item.completed_at ? new Date(item.completed_at).toLocaleString() : 'Completed'}</span></div>)}</div></details>}
              {completeTask.error && <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">{completeTask.error.message}</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5">
            <div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Workforce Now</div><h3 className="mt-1 text-xl font-black">Currently clocked in</h3>
            <div className="mt-4 space-y-2">{activeEntries.slice(0,7).map(entry => <div key={entry.id} className="rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="text-sm font-bold">{operationalName(entry, directory, { fallback: 'Employee' })}</div><div className="mt-1 text-xs text-cyan-300">{entry.location || 'Location not listed'}</div></div>)}{!activeEntries.length && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No active time entries.</div>}</div>
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{actions.map(({ label, detail, icon: Icon, page }) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-[#102238]"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300"/></div><div className="mt-4 text-sm font-black text-white">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}
