import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ClipboardList, Radio, ClipboardCheck, FileWarning, ArrowRight, Siren, Users, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { buildDirectoryIndex, operationalName } from '@/lib/operationalDisplay';

const actions = [
  { label: 'Live Field Oversight', detail: 'Units, active calls, welfare and supervisor requests', icon: Radio, page: 'SupervisorFieldOversight' },
  { label: 'Action Items', detail: 'Pending command tasks and required follow-up', icon: ClipboardList, page: 'SupervisorTasks' },
  { label: 'Officer Inspections', detail: 'Field inspections and documented follow-up', icon: ClipboardCheck, page: 'SupervisorInspections' },
  { label: 'Performance Reviews', detail: 'Supervisor review and signature workflow', icon: ShieldCheck, page: 'SupervisorPerformanceReview' },
  { label: 'Write-Ups & Complaints', detail: 'Discipline, complaints and oversight records', icon: FileWarning, page: 'SupervisorWriteUps' },
];

export default function SupervisorOverview() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ['supervisorOverviewSnapshot'],
    queryFn: async () => {
      const users = await listDirectoryUsers('-last_updated', 500).catch(() => []);
      const taskResult = await base44.functions.invoke('getSupervisorScopedTasks', {}).catch(() => ({}));
      const taskPayload = taskResult?.data || taskResult || {};
      const boardResult = await base44.functions.invoke('getSupervisorWelfareBoard', {}).catch(() => ({}));
      const board = boardResult?.data || boardResult || {};
      return { users, tasks: taskPayload, board };
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const directory = buildDirectoryIndex(data.users || []);
  const tasks = data.tasks || {};
  const board = data.board || {};
  const complaints = tasks.complaints || [];
  const writeups = tasks.writeups || [];
  const reviews = [...(tasks.reviews || []), ...(tasks.reviewFollowUps || [])];
  const inspections = tasks.inspections || [];
  const liveUnits = board.live_units || [];
  const activeCalls = board.active_calls || [];
  const welfare = board.welfare_checks || board.active_welfare || [];
  const supervisorRequests = board.supervisor_requests || [];
  const attention = [
    ...supervisorRequests.slice(0,2).map(row => ({ label: 'Supervisor Request', detail: row.call_number || row.location || 'Field request pending' })),
    ...welfare.slice(0,2).map(row => ({ label: 'Welfare Check', detail: operationalName(row, directory, { fallback: 'Officer' }) })),
    ...writeups.slice(0,1).map(row => ({ label: 'Write-Up', detail: operationalName(row, directory, { fallback: 'Officer' }) })),
  ].slice(0,5);

  const taskQueue = [
    ...reviews.slice(0,4).map(row => ({ id:`review-${row.id}`, title:'Performance Review', person:operationalName(row,directory,{fallback:'Officer'}), detail:'Supervisor review/signature workflow requires action', page:'SupervisorPerformanceReview' })),
    ...inspections.slice(0,4).map(row => ({ id:`inspection-${row.id}`, title:'Officer Inspection', person:operationalName(row,directory,{fallback:'Officer'}), detail:row.location || 'Inspection follow-up required', page:'SupervisorInspections' })),
    ...writeups.slice(0,4).map(row => ({ id:`writeup-${row.id}`, title:'Write-Up', person:operationalName(row,directory,{fallback:'Officer'}), detail:'Disciplinary review requires supervisor action', page:'SupervisorWriteUps' })),
    ...complaints.slice(0,4).map(row => ({ id:`complaint-${row.id}`, title:'Complaint Investigation', person:operationalName(row,directory,{fallback:'Officer'}), detail:'Complaint investigation/follow-up required', page:'SupervisorComplaints' })),
  ].slice(0,10);

  const totalTasks = complaints.length + writeups.length + reviews.length + inspections.length;

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-[#10233b] via-[#0a1625] to-[#070d17] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-blue-300"><ShieldCheck className="h-4 w-4"/>Field Leadership</div><h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Supervisor Command Overview</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Live command status, active calls, welfare, supervisor requests and pending personnel actions in one screen.</p></div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING COMMAND DATA' : 'COMMAND READY'}</div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Live Units', liveUnits.length, Users, 'Units currently visible to supervisor'], ['Active Calls', activeCalls.length, Siren, 'Calls requiring field response'], ['Welfare / Requests', welfare.length + supervisorRequests.length, Activity, 'Officer welfare and assist requests'], ['Action Items', totalTasks, ClipboardList, 'Reviews, inspections and discipline']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5 shadow-lg"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Icon className="h-5 w-5"/></div><span className="text-3xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-blue-300">Command Attention</div><h3 className="mt-1 text-xl font-black">Needs supervisor action</h3></div><Siren className="h-5 w-5 text-red-300"/></div><div className="mt-4 space-y-2">{attention.length ? attention.map((item,index) => <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="text-sm font-bold">{item.label}</div><div className="text-right text-xs text-slate-400">{item.detail}</div></div>) : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No urgent command attention items are currently listed.</div>}</div></section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="text-xs font-black uppercase tracking-[.16em] text-blue-300">Pending Actions</div><h3 className="mt-1 text-xl font-black">Supervisor work queue</h3><div className="mt-4 space-y-2">{taskQueue.slice(0,6).map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-[#0d1a2a] p-3"><div className="text-sm font-black">{item.title}</div><div className="text-xs font-bold text-blue-200">{item.person}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div><Link to={createPageUrl(item.page)} className="mt-2 inline-block rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-200 hover:bg-blue-500/20">OPEN TASK</Link></div>)}{!taskQueue.length && <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">No personnel actions are waiting.</div>}</div></section>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{actions.map(({ label, detail, icon: Icon, page }) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-[#102238]"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-blue-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-300"/></div><div className="mt-4 text-sm font-black text-white">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}