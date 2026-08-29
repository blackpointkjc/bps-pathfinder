import { useQuery } from '@tanstack/react-query';
import { GraduationCap, BookOpen, ShieldCheck, Users, ClipboardCheck, ArrowRight, AlertTriangle, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';

const actions = [
  { label: 'Training Setup', detail: 'Build modules, courses and training content', icon: GraduationCap, page: 'AdminTraining' },
  { label: 'Training Records', detail: 'Classes, rosters, certificates and records', icon: BookOpen, page: 'TrainingRecords' },
  { label: 'Compliance', detail: 'Assignments, submissions and certification status', icon: ShieldCheck, page: 'AdminTrainingCompliance' },
  { label: 'Students', detail: 'Student accounts and assigned coursework', icon: Users, page: 'ManageStudents' },
];

export default function TrainerOverview() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ['trainerOverviewSnapshot'],
    queryFn: async () => {
      const modules = await base44.entities.TrainingModule.list('-created_date', 120).catch(() => []);
      const assignments = await base44.entities.TrainingAssignment.list('-assigned_date', 150).catch(() => []);
      const submissions = await base44.entities.TrainingSubmission.list('-submission_date', 150).catch(() => []);
      const completions = await base44.entities.TrainingCompletion.list('-completed_date', 150).catch(() => []);
      return { modules, assignments, submissions, completions };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const modules = data.modules || [];
  const assignments = data.assignments || [];
  const submissions = data.submissions || [];
  const completions = data.completions || [];
  const pendingAssignments = assignments.filter(row => !['completed','passed','closed'].includes(String(row.status || '').toLowerCase()));
  const pendingSubmissions = submissions.filter(row => ['pending','submitted','awaiting_review'].includes(String(row.status || '').toLowerCase()));
  const recent = submissions.slice(0, 6);

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-[#21163d] via-[#101526] to-[#070d17] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-violet-300"><GraduationCap className="h-4 w-4"/>Training Operations</div><h2 className="mt-2 text-3xl font-black md:text-4xl">Training Command Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Course inventory, assignment workload, submission review and completion activity in one view.</p></div><div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING TRAINING DATA' : 'TRAINING ONLINE'}</div></div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Training Modules',modules.length,BookOpen,'Available training content'],['Open Assignments',pendingAssignments.length,ClipboardCheck,'Assignments not yet completed'],['Awaiting Review',pendingSubmissions.length,AlertTriangle,'Submitted work requiring review'],['Completions',completions.length,ShieldCheck,'Recorded training completions']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300"><Icon className="h-5 w-5"/></div><span className="text-3xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}</div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Recent Training Activity</div><h3 className="mt-1 text-xl font-black">Latest submissions</h3></div><Activity className="h-5 w-5 text-violet-300"/></div><div className="mt-4 space-y-2">{recent.length ? recent.map((row,index) => <div key={row.id || index} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div><div className="text-sm font-bold">{row.officer_name || row.student_name || row.officer_email || 'Trainee'}</div><div className="text-xs text-slate-500">{row.module_title || row.training_title || row.assignment_name || 'Training submission'}</div></div><div className="text-xs font-bold text-violet-200">{String(row.status || 'submitted').replace(/_/g,' ')}</div></div>) : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No recent submissions.</div>}</div></section>
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Assignment Health</div><h3 className="mt-1 text-xl font-black">Training workload</h3><div className="mt-4 space-y-3"><div className="rounded-xl border border-slate-800 bg-[#0d1a2a] p-4"><div className="text-2xl font-black">{assignments.length}</div><div className="text-xs text-slate-500">Total assignments</div></div><div className="rounded-xl border border-slate-800 bg-[#0d1a2a] p-4"><div className="text-2xl font-black">{Math.max(0, assignments.length - pendingAssignments.length)}</div><div className="text-xs text-slate-500">Completed / closed assignments</div></div></div></section>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{actions.map(({label,detail,icon:Icon,page}) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-violet-500/40 hover:bg-[#17152b]"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-violet-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-violet-300"/></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}