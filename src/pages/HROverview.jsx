import { Briefcase, CalendarClock, Clock3, Building2, Users, ClipboardCheck, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const actions = [
  { label: 'Company Employees', detail: 'Employee records, assignments and status', icon: Users, page: 'HRManageCompanyEmployees' },
  { label: 'Time Entries', detail: 'Review and manage employee time records', icon: Clock3, page: 'ManageTimeEntries' },
  { label: 'PTO & Leave', detail: 'Approvals, manual PTO and leave history', icon: CalendarClock, page: 'AdminPTOApproval' },
  { label: 'Performance Reviews', detail: 'HR performance review workflow', icon: ClipboardCheck, page: 'AdminPerformanceReviews' },
  { label: 'Client Assignments', detail: 'Manage client accounts and employee assignments', icon: Building2, page: 'ManageClients' },
];

export default function HROverview() {
  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#102239] via-[#0b1726] to-[#07101c] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Briefcase className="h-4 w-4"/>Human Resources Command</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">HR Operations Overview</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Employee administration, time, leave, performance and client assignments from one clear workspace.</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">HR WORKSPACE ONLINE</div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {actions.map(({ label, detail, icon: Icon, page }) => (
            <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-[#102238]">
              <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-cyan-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300"/></div>
              <div className="mt-4 text-sm font-black text-white">{label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
