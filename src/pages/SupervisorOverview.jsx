import { ShieldCheck, ClipboardList, Radio, ClipboardCheck, FileWarning, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const actions = [
  { label: 'Live Field Oversight', detail: 'Units, active calls, welfare and supervisor requests', icon: Radio, page: 'SupervisorFieldOversight' },
  { label: 'Action Items', detail: 'Pending command tasks and required follow-up', icon: ClipboardList, page: 'SupervisorTasks' },
  { label: 'Officer Inspections', detail: 'Field inspections and documented follow-up', icon: ClipboardCheck, page: 'SupervisorInspections' },
  { label: 'Performance Reviews', detail: 'Supervisor review and signature workflow', icon: ShieldCheck, page: 'SupervisorPerformanceReview' },
  { label: 'Write-Ups & Complaints', detail: 'Discipline, complaints and oversight records', icon: FileWarning, page: 'SupervisorWriteUps' },
];

export default function SupervisorOverview() {
  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-[#10233b] via-[#0a1625] to-[#070d17] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-blue-300"><ShieldCheck className="h-4 w-4"/>Field Leadership</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Supervisor Command Overview</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">See what needs attention first, then move directly into field oversight, personnel actions, reviews and officer tools.</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">COMMAND READY</div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {actions.map(({ label, detail, icon: Icon, page }) => (
            <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-[#102238]">
              <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-blue-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-300"/></div>
              <div className="mt-4 text-sm font-black text-white">{label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
