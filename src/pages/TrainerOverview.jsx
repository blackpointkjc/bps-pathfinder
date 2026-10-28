import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GraduationCap, BookOpen, ShieldCheck, Users, ClipboardCheck, ArrowRight, AlertTriangle, Activity, CheckCircle2, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { listTrainingUsers } from '@/lib/trainingDirectory';
import { buildDirectoryIndex, operationalName } from '@/lib/operationalDisplay';

const actions = [
  { label: 'Training Setup', detail: 'Build modules, courses and training content', icon: GraduationCap, page: 'TrainerCenter?section=courses' },
  { label: 'Training Records', detail: 'Classes, rosters, certificates and records', icon: BookOpen, page: 'TrainerCenter?section=classes' },
  { label: 'Compliance', detail: 'Assignments, submissions and certification status', icon: ShieldCheck, page: 'TrainerCenter?section=compliance' },
  { label: 'Students', detail: 'Student accounts and assigned coursework', icon: Users, page: 'TrainerCenter?section=students' },
];

const trainingDestination = page => {
 const [route,search='']=page.split('?');
 if (route !== 'TrainerCenter' || !/\/AdminCenter\/?$/i.test(window.location.pathname)) return createPageUrl(page);
 const params=new URLSearchParams(window.location.search), incoming=new URLSearchParams(search);
 params.set('admin_center','training'); params.set('trainer_section',incoming.get('section')||'overview');
 for(const [key,value] of incoming) if(key!=='section') params.set(key,value);
 return window.location.pathname+'?'+params.toString();
};
const pretty = value => String(value || '').replace(/_/g, ' ').trim();

export default function TrainerOverview() {
  const queryClient = useQueryClient();
  const [taskWorking,setTaskWorking]=useState('');
  const [taskFeedback,setTaskFeedback]=useState('');
  const finishCertificationTask = async taskId => {
    if(taskWorking)return;setTaskWorking(taskId);setTaskFeedback('Checking Certification Review…');
    try {
      const response = await base44.functions.invoke('completeTrainerCertificationReview', {taskId});
      const payload = response?.data || response || {};
      if (!payload.success) throw new Error(payload.error || 'Review is not complete');
      setTaskFeedback('Certification Review Completed');toast.success('Certification review completed');
      queryClient.invalidateQueries({queryKey:['trainerOverviewSnapshot']});
    } catch(error) { const message=error?.response?.data?.error || error?.message || 'Unable To Complete Review'; setTaskFeedback(message);toast.error(message); } finally {setTaskWorking('');}
  };
  const { data = {}, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['trainerOverviewSnapshot'],
    queryFn: async () => {
      const failures = [];
      const previous = queryClient.getQueryData(['trainerOverviewSnapshot']) || {};
      const read = async (key, label, loader) => {
        try { return await loader(); }
        catch { failures.push(label); return previous[key] || []; }
      };
      const complete = async (entity, query, sort) => {
        const rows = [];
        for (let skip = 0; skip < 10000; skip += 500) {
          const batch = await base44.entities[entity].filter(query, sort, 500, skip);
          rows.push(...batch);
          if (batch.length < 500) return rows;
        }
        throw new Error('Training source exceeds complete lookup limit');
      };
      const users = await read('users', 'Officer directory', () => listTrainingUsers());
      const assignments = await read('assignments', 'Assignments', () => complete('TrainingAssignment', {status:{$nin:['approved','completed','passed','closed']}}, '-assigned_date'));
      const submissions = await read('submissions', 'Submissions', () => complete('TrainingSubmission', {status:{$in:['pending','submitted','awaiting_review','pending_review']}}, '-submission_date'));
      const completions = await read('completions', 'Completions', () => complete('TrainingCompletion', {completion_date:{$gte:new Date(Date.now()-14*86400000).toISOString().slice(0,10)}}, '-completion_date'));
      const trainerTasks = await read('trainerTasks', 'Assigned tasks', async () => {
        const currentUser = await base44.auth.me();
        if (!currentUser?.id) throw new Error('Sign in required');
        return complete('Task', {assigned_to:currentUser.id,status:{$in:['open','in_progress']}}, '-created_date');
      });
      return { users, assignments, submissions, completions, trainerTasks, failures };
    },
    staleTime: 60000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const incomplete = !!error || !!data.failures?.length;
  const directory = buildDirectoryIndex(data.users || []);
  const assignments = data.assignments || [];
  const submissions = data.submissions || [];
  const completions = data.completions || [];
  const officerCertificates = (data.users || []).flatMap(officer=>[...(officer.officer_certifications||[]),
    ...[['DCJS',officer.dcjs_expiration],['Firearm',officer.firearm_expiration]].filter(([label,date])=>date&&!(officer.officer_certifications||[]).some(cert=>String(cert.training_name||cert.course_id||'').toLowerCase().includes(label.toLowerCase())&&cert.expiration_date===date)).map(([training_name,expiration_date])=>({training_name,expiration_date}))
  ].map((cert,index)=>({...cert, id:officer.id+':'+index, officer_id:officer.id, officer_email:officer.email, officer_name:[officer.rank,officer.last_name].filter(Boolean).join(' '), certification_type:cert.training_name||cert.course_id, days_until_expiration:cert.expiration_date ? Math.ceil((new Date(cert.expiration_date).getTime()-Date.now())/86400000) : null})));
  const certificationTodos = officerCertificates.filter(cert=>cert.days_until_expiration!==null&&cert.days_until_expiration<=90);

  const pendingAssignments = assignments.filter(row => !['approved','completed','passed','closed'].includes(String(row.status || '').toLowerCase()));
  const pendingSubmissions = submissions.filter(row => ['pending','submitted','awaiting_review','pending_review'].includes(String(row.status || '').toLowerCase()));
  const recentCutoff = Date.now() - (14 * 86400000);
  const recentCompletions = completions.filter(row => new Date(row.completion_date || row.completed_date || row.created_date || 0).getTime() >= recentCutoff);

  const certificationReviewTasks = (data.trainerTasks || []).filter(task => task.title === 'Review new officer certifications');
  const taskQueue = [
    ...(data.trainerTasks || []).filter(task => task.title !== 'Review new officer certifications').map(task => ({
      id:'task-'+task.id, person:task.related_name || 'Assigned trainer work', title:task.title || 'Training task',
      detail:task.description || task.status, page:'TrainerCenter?section=courses', urgent:task.priority==='high'||task.priority==='critical'
    })),
    ...pendingAssignments.filter(row=>['overdue','expired','rejected'].includes(String(row.status).toLowerCase()) || (row.due_date && new Date(row.due_date).getTime()<Date.now() && row.status!=='pending_review')).map(row=>({
      id:'assignment-'+row.id, person:row.student_name || operationalName(row,directory,{fallback:'Trainee'}),
      title:'Training assignment needs follow-up', detail:row.module_title || row.training_title || row.status,
      page:'TrainerCenter?section=courses', urgent:true
    })),

    ...certificationReviewTasks.map(task => ({
      id: `cert-review-${task.id}`,
      taskId: task.id,
      person: (() => { const officer = (data.users || []).find(user => user.id === task.related_id); return [officer?.first_name, officer?.last_name].filter(Boolean).join(' ').trim() || officer?.full_name || officer?.email || task.related_name?.trim() || `Officer account unavailable · ${task.related_id || task.id}`; })(),
      title: 'Review new officer certification file',
      detail: 'Verify DCJS, firearm credentials and upload supporting certification records',
      page: 'TrainerCenter?section=compliance' + (task.related_id ? '&officer_id=' + encodeURIComponent(task.related_id) : ''),
      urgent: true,
    })),
    ...certificationTodos.map(row => ({
      id: `cert-${row.id}`,
      person: operationalName(row, directory, { fallback: 'Officer' }),
      title: `${String(row.certification_type || 'Certification').toUpperCase()} certification`,
      detail: `${row.days_until_expiration ?? '?'} days remaining · expires ${row.expiration_date || 'date not listed'}`,
      page: 'TrainerCenter?section=compliance&officer_id='+encodeURIComponent(row.officer_id),
      urgent: Number(row.days_until_expiration) <= 30,
    })),
    ...pendingSubmissions.map(row => ({
      id: `submission-${row.id}`,
      person: row.student_name || operationalName(row, directory, { fallback: 'Trainee' }),
      title: 'Training submission ready for review',
      detail: row.module_title || row.training_title || row.assignment_name || pretty(row.status || 'Submitted'),
      page: 'TrainerCenter?section=compliance',
      urgent: false,
    })),
    ...recentCompletions.slice(0, 3).map(row => ({
      id: `completion-${row.id}`,
      person: row.student_name || operationalName(row, directory, { fallback: 'Trainee' }),
      title: 'Completed class / record review',
      detail: row.module_title || row.training_title || row.course_name || 'Verify completion and certificate record',
      page: 'TrainerCenter?section=classes',
      urgent: false,
    })),
  ];

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">{error && <div role="alert" className="rounded-xl border border-red-700 p-4 text-red-200">Training Records Could Not Be Loaded. <button className="underline" onClick={()=>refetch()}>Retry Training Records</button></div>}
        <section className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-[#21163d] via-[#101526] to-[#070d17] p-6 shadow-2xl md:p-8">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-violet-300"><GraduationCap className="h-4 w-4"/>Training Operations</div><h2 className="mt-2 text-3xl font-black md:text-4xl">Training Command Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Certification expirations, student completions, submitted work, course activity and compliance tasks in one operational queue.</p></div><div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING TRAINING DATA' : incomplete ? 'DATA NEEDS RETRY' : `${taskQueue.length} TASKS WAITING`}</div></div>
        </section>

        <button type="button" disabled={isFetching} onClick={()=>refetch()} className="min-h-11 rounded border border-violet-500 px-4">{isFetching?'Refreshing training…':'Refresh training work'}</button>
        {!!data.failures?.length && <p role="alert" className="rounded-xl border border-amber-500/40 p-4 text-amber-200">Training data is incomplete: {data.failures.join(', ')} could not refresh. Previously loaded items may be shown. Refresh training work to retry.</p>}
        <div>{taskFeedback&&<p role="status" className="rounded-xl border border-cyan-700 p-3 text-sm text-cyan-100">{taskFeedback}</p>}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[['Officer Certifications',officerCertificates.length,BookOpen,'Saved on officer profiles'],['Open Assignments',pendingAssignments.length,ClipboardCheck,'Assignments not yet completed'],['Submissions to Review',pendingSubmissions.length,AlertTriangle,'Student/officer work awaiting trainer'],['Expiring Certifications',certificationTodos.length,ShieldCheck,'Certification alerts requiring review'],['Recent Completions',recentCompletions.length,Award,'Classes completed in the last 14 days']].map(([label,value,Icon,detail]) => <div key={label} className="bps-kpi-card rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><div className="bps-kpi-icon bg-violet-500/10 text-violet-300"><Icon className="h-5 w-5"/></div><span className="bps-kpi-value text-3xl font-black">{isLoading || incomplete ? '—' : value}</span><div className="bps-kpi-label text-sm font-black">{label}</div><div className="bps-kpi-detail text-xs text-slate-500">{detail}</div></div>)}</div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Pending Actions</div><h3 className="mt-1 text-xl font-black">Trainer work queue</h3></div><AlertTriangle className="h-5 w-5 text-amber-300"/></div><div className="mt-4 space-y-2">{taskQueue.length ? taskQueue.map(item => <div key={item.id} className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${item.urgent ? 'border-red-500/40 bg-red-950/20' : 'border-slate-800 bg-[#0d1a2a]'}`}><div className="min-w-0 flex-1"><div className="text-sm font-bold">{item.person}</div><div className={`text-xs font-black ${item.urgent ? 'text-red-300' : 'text-violet-200'}`}>{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div></div><Link to={trainingDestination(item.page)} className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-200 hover:bg-violet-500/20">OPEN TASK</Link>{item.taskId && <button type="button" disabled={!!taskWorking} onClick={() => finishCertificationTask(item.taskId)} className="shrink-0 rounded-lg border border-emerald-600/40 bg-emerald-700/20 px-3 py-2 text-xs font-black text-emerald-200">{taskWorking===item.taskId?'CHECKING…':'MARK REVIEWED'}</button>}</div>) : <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-800/60 p-7 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4"/>{isLoading ? 'Loading Training Records…' : incomplete ? 'Queue incomplete. Refresh training work above.' : 'No Trainer Actions Are Waiting.'}</div>}</div></section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-violet-300">Recent Activity</div><h3 className="mt-1 text-xl font-black">Latest submissions</h3></div><Activity className="h-5 w-5 text-violet-300"/></div><div className="mt-4 space-y-2">{submissions.slice(0,6).map((row,index) => <div key={row.id || index} className="rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="text-sm font-bold">{row.student_name || operationalName(row, directory, { fallback: 'Trainee' })}</div><div className="text-xs text-slate-500">{row.module_title || row.training_title || row.assignment_name || 'Training submission'}</div><div className="mt-1 text-[10px] font-black uppercase text-violet-300">{pretty(row.status || 'submitted')}</div></div>)}{!isLoading && !incomplete && !submissions.length && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No recent submissions.</div>}</div></section>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{actions.map(({label,detail,icon:Icon,page}) => <Link key={label} to={trainingDestination(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-violet-500/40 hover:bg-[#17152b]"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-violet-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-violet-300"/></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}
