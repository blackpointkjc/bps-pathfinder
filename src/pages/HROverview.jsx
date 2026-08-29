import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, Clock3, Building2, Users, ClipboardCheck, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { listDirectoryUsers } from '@/lib/appDirectory';

const actions = [
  { label: 'Company Employees', detail: 'Employee records, assignments and status', icon: Users, page: 'HRManageCompanyEmployees' },
  { label: 'Time Entries', detail: 'Review and manage employee time records', icon: Clock3, page: 'ManageTimeEntries' },
  { label: 'PTO & Leave', detail: 'Approvals, manual PTO and leave history', icon: CalendarClock, page: 'AdminPTOApproval' },
  { label: 'Performance Reviews', detail: 'HR performance review workflow', icon: ClipboardCheck, page: 'AdminPerformanceReviews' },
  { label: 'Client Assignments', detail: 'Manage client accounts and employee assignments', icon: Building2, page: 'ManageClients' },
];

const statusText = value => String(value || '').replace(/_/g, ' ').trim();

export default function HROverview() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ['hrOverviewSnapshot'],
    queryFn: async () => {
      const employees = await listDirectoryUsers('-last_updated', 500).catch(() => []);
      const leave = await base44.entities.TimeOffRequest.list('-created_date', 150).catch(() => []);
      const reviews = await base44.entities.PerformanceReview.list('-updated_date', 150).catch(() => []);
      const entries = await base44.entities.TimeEntry.list('-clock_in', 150).catch(() => []);
      return { employees, leave, reviews, entries };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const employees = (data.employees || []).filter(row => !row.termination_date);
  const pendingLeave = (data.leave || []).filter(row => String(row.status || '').toLowerCase() === 'pending');
  const openReviews = (data.reviews || []).filter(row => !['completed','closed','acknowledged'].includes(String(row.status || row.workflow_stage || '').toLowerCase()));
  const activeEntries = (data.entries || []).filter(row => row.clock_in && !row.clock_out);
  const recentChanges = [...pendingLeave.slice(0, 3).map(row => ({ type: 'Leave Request', name: row.officer_name || row.created_by || row.officer_email || 'Employee', detail: statusText(row.request_type || row.leave_type || 'Pending approval') })), ...openReviews.slice(0, 3).map(row => ({ type: 'Performance Review', name: row.officer_name || row.officer_email || 'Employee', detail: statusText(row.workflow_stage || row.status || 'In progress') }))].slice(0, 5);

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102239] via-[#0b1726] to-[#07101c] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Briefcase className="h-4 w-4"/>Human Resources Command</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">HR Operations Overview</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Live employee status, leave approvals, review workflow and workforce activity—not just shortcuts.</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING HR DATA' : 'HR WORKSPACE ONLINE'}</div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Active Employees', employees.length, Users, 'Directory accounts currently active'], ['Clocked In', activeEntries.length, UserCheck, 'Employees with open time entries'], ['PTO Awaiting Action', pendingLeave.length, CalendarClock, 'Leave requests requiring review'], ['Open Reviews', openReviews.length, ClipboardCheck, 'Performance workflow still in progress']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-lg"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><Icon className="h-5 w-5"/></div><span className="text-3xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5">
            <div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Priority Queue</div><h3 className="mt-1 text-xl font-black">Items needing HR attention</h3></div><AlertCircle className="h-5 w-5 text-amber-300"/></div>
            <div className="mt-4 space-y-2">
              {recentChanges.length ? recentChanges.map((item, index) => <div key={`${item.type}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div><div className="text-sm font-bold text-white">{item.name}</div><div className="text-xs text-slate-500">{item.type}</div></div><div className="text-right text-xs font-bold text-amber-200">{item.detail}</div></div>) : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No pending leave or review items were found.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5">
            <div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Workforce Now</div><h3 className="mt-1 text-xl font-black">Currently clocked in</h3>
            <div className="mt-4 space-y-2">{activeEntries.slice(0,6).map(entry => <div key={entry.id} className="rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="text-sm font-bold">{entry.officer_name || entry.officer_email || 'Employee'}</div><div className="mt-1 text-xs text-cyan-300">{entry.location || 'Location not listed'}</div></div>)}{!activeEntries.length && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No active time entries.</div>}</div>
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {actions.map(({ label, detail, icon: Icon, page }) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-[#102238]"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300"/></div><div className="mt-4 text-sm font-black text-white">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}
        </div>
      </div>
    </div>
  );
}