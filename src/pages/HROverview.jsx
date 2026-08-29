import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Clock3, Building2, Users, ClipboardCheck, ArrowRight, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { listDirectoryUsers } from '@/lib/appDirectory';
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
  const { data = {}, isLoading } = useQuery({
    queryKey: ['hrOverviewSnapshot'],
    queryFn: async () => {
      const employees = await listDirectoryUsers('-last_updated', 500).catch(() => []);
      const leave = await base44.entities.TimeOffRequest.list('-created_date', 150).catch(() => []);
      const reviewsResult = await base44.functions.invoke('managePerformanceReviews', { action: 'list' }).catch(() => ({}));
      const reviewsPayload = reviewsResult?.data || reviewsResult || {};
      const entries = await base44.entities.TimeEntry.list('-clock_in', 150).catch(() => []);
      return { employees, leave, reviews: reviewsPayload.reviews || [], entries };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const employees = (data.employees || []).filter(row => !row.termination_date);
  const directory = buildDirectoryIndex(employees);
  const pendingLeave = (data.leave || []).filter(row => String(row.status || '').toLowerCase() === 'pending');
  const openReviews = (data.reviews || []).filter(row => String(row.workflow_stage || '').toLowerCase() !== 'approved');
  const hrApprovalReviews = openReviews.filter(row => String(row.workflow_stage || '').toLowerCase() === 'hr_approval_pending');
  const activeEntries = (data.entries || []).filter(row => row.clock_in && !row.clock_out);

  const pendingActions = [
    ...pendingLeave.slice(0, 5).map(row => ({
      id: `pto-${row.id}`,
      title: operationalName(row, directory, { fallback: 'Employee' }),
      type: 'PTO / Leave Request',
      detail: clean(row.request_type || row.leave_type || 'Pending approval'),
      page: 'AdminPTOApproval',
    })),
    ...hrApprovalReviews.slice(0, 5).map(row => ({
      id: `review-${row.id}`,
      title: operationalName(row, directory, { fallback: 'Officer' }),
      type: 'Performance Review Final Approval',
      detail: 'Supervisor and officer steps complete · HR approval required',
      page: 'AdminPerformanceReviews',
    })),
  ].slice(0, 8);

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102239] via-[#0b1726] to-[#07101c] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Briefcase className="h-4 w-4"/>Human Resources Command</div><h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">HR Operations Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Live workforce status plus the actual HR approvals and review steps waiting for action.</p></div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING HR DATA' : `${pendingActions.length} ACTIONS WAITING`}</div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Active Employees', employees.length, Users, 'Directory accounts currently active'], ['Clocked In', activeEntries.length, UserCheck, 'Employees with open time entries'], ['PTO Awaiting Action', pendingLeave.length, CalendarClock, 'Real requests requiring HR decision'], ['HR Review Approvals', hrApprovalReviews.length, ClipboardCheck, 'Performance reviews ready for HR']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-lg"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Icon className="h-5 w-5"/></div><span className="text-3xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5">
            <div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Pending Actions</div><h3 className="mt-1 text-xl font-black">HR work queue</h3></div><AlertCircle className="h-5 w-5 text-amber-300"/></div>
            <div className="mt-4 space-y-2">
              {pendingActions.length ? pendingActions.map(item => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-bold text-white">{item.title}</div><div className="text-xs font-bold text-amber-200">{item.type}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div></div><Link to={createPageUrl(item.page)} className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/20">OPEN TASK</Link></div>) : <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-800/60 p-7 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4"/>No HR approvals are waiting.</div>}
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
