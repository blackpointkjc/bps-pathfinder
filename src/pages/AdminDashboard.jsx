import { listDirectoryUsers } from '@/lib/appDirectory';
import { buildDirectoryIndex, operationalName } from '@/lib/operationalDisplay';
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, FileText, AlertTriangle, Shield, Calendar, MapPin, Megaphone, GraduationCap, ClipboardList, Briefcase, CalendarClock, BookOpen, UserCheck, ShieldCheck, LayoutDashboard } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const workQueueTaskUrl = task => {
  const params = new URLSearchParams();
  if (task?.source_id) params.set(task.page === 'ManageTimeEntries' ? 'entry_id' : 'record_id', String(task.source_id));
  if (task?.id) params.set('queue_task', String(task.id));
  if (task?.kind) params.set('queue_kind', String(task.kind));
  const query = params.toString();
  return `${createPageUrl(task?.page || 'AdminDashboard')}${query ? `?${query}` : ''}`;
};

const ADMIN_QUEUE_KINDS = new Set([
  'missing_report', 'availability', 'access', 'report_review', 'expense',
  'shift_bid', 'special_coverage', 'weekly_schedule',
]);

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const completeTask = useMutation({
    mutationFn: async task => {
      const result = await base44.functions.invoke('getRoleWorkQueue', {
        action: 'complete',
        task_key: task.id,
        title: task.title,
        person: task.person,
        kind: task.kind,
        source_id: task.source_id,
        queue_role: 'admin',
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: (_payload, task) => {
      queryClient.setQueryData(['adminDashboardWorkQueue'], current => {
        if (!current) return current;
        const tasks = (current.tasks || []).filter(item => item.id !== task.id);
        return {
          ...current,
          tasks,
          counts: { ...(current.counts || {}), total: tasks.length },
          recently_completed: [
            { id: task.id, task_key: task.id, title: task.title, completed_at: new Date().toISOString() },
            ...(current.recently_completed || []).filter(item => item.id !== task.id),
          ],
        };
      });
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['adminDashboardActiveUsers'],
    queryFn: async () => {
      const users = await listDirectoryUsers();
      return (Array.isArray(users) ? users : []).filter(u => !u?.termination_date);
    },
    enabled: user?.role === 'admin',
    initialData: [],
  });

  const { data: todayEntries = [] } = useQuery({
    queryKey: ['todayTimeEntries'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const today = format(new Date(), 'yyyy-MM-dd');
      return (Array.isArray(entries) ? entries : []).filter(e => 
        format(new Date(e.clock_in), 'yyyy-MM-dd') === today
      );
    },
    enabled: user?.role === 'admin',
    initialData: [],
  });

  const { data: activeOfficers = 0 } = useQuery({
    queryKey: ['activeOfficers'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const active = (Array.isArray(entries) ? entries : []).filter(e => !e?.clock_out);
      return active.length;
    },
    enabled: user?.role === 'admin',
    initialData: 0,
  });

  const { data: adminWork = { tasks: [], counts: {} }, error: adminWorkError, isFetching: adminWorkRefreshing, refetch: refetchAdminWork } = useQuery({
    queryKey: ['adminDashboardWorkQueue'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getRoleWorkQueue', { queue_role: 'admin' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      const currentTasks = (payload.tasks || []).filter(task => ADMIN_QUEUE_KINDS.has(task.kind));
      const previous = queryClient.getQueryData(['adminDashboardWorkQueue']) || {};
      if (payload.load_errors?.length && previous.tasks?.length) {
        const retainedTasks = (previous.tasks || []).filter(task => ADMIN_QUEUE_KINDS.has(task.kind));
        const mergedTasks = [...currentTasks, ...retainedTasks]
          .filter((task, index, rows) => rows.findIndex(item => item.id === task.id) === index);
        return {
          ...payload,
          tasks: mergedTasks,
          counts: { ...(previous.counts || {}), total: mergedTasks.length },
          retaining_last_confirmed_tasks: true,
        };
      }
      return { ...payload, tasks: currentTasks, counts: { ...(payload.counts || {}), total: currentTasks.length } };
    },
    enabled: user?.role === 'admin',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 60 * 1000,
  });

  const directory = buildDirectoryIndex(allUsers || []);
  const getOfficerName = (ref) => operationalName(typeof ref === 'object' ? ref : { officer_email: ref }, directory, { fallback: 'Officer' });
  const adminTasks = adminWork.tasks || [];
  const pendingRequests = adminWork.counts?.total || 0;

  const adminTools = [
    // Dashboard & Analytics
    { id: "dashboard", title: "Admin Dashboard", icon: Shield, url: createPageUrl("AdminDashboard"), category: "main" },
    { id: "analytics", title: "Company Analytics", icon: ClipboardList, url: createPageUrl("AdminAnalytics"), category: "main" },
    // Team Management
    { id: "ranks", title: "Rank Structure", icon: Users, url: createPageUrl("RankStructure"), category: "team" },
    { id: "directory", title: "Division Directory", icon: Users, url: createPageUrl("DivisionDirectory"), category: "team" },
    { id: "certs", title: "Certification Alerts", icon: AlertTriangle, url: createPageUrl("AdminCertificationAlerts"), category: "team" },
    { id: "training", title: "Training", icon: GraduationCap, url: createPageUrl("AdminTraining"), category: "team" },
    // Reports
    { id: "all_reports", title: "All Reports", icon: ClipboardList, url: createPageUrl("AdminReports"), category: "reports" },
    { id: "supervisor_reports", title: "Supervisor Reports", icon: UserCheck, url: createPageUrl("AdminSupervisorReports"), category: "reports" },
    { id: "confidential", title: "Confidential Reports", icon: ShieldCheck, url: createPageUrl("AdminConfidentialReports"), category: "reports" },
    // Scheduling
    { id: "time_entries", title: "Manage Time Entries", icon: Clock, url: createPageUrl("ManageTimeEntries"), category: "scheduling" },
    { id: "scheduling", title: "Scheduling", icon: Calendar, url: createPageUrl("AdminScheduling"), category: "scheduling" },
    { id: "shift_bids", title: "Shift Bids", icon: Briefcase, url: createPageUrl("AdminShiftBids"), category: "scheduling" },
    { id: "officer_mgmt", title: "Officer Management", icon: CalendarClock, url: createPageUrl("AdminOfficerManagement"), category: "scheduling" },
    { id: "tracker", title: "Location Tracker", icon: MapPin, url: createPageUrl("AdminLocationTracker"), category: "scheduling" },
    // Communication
    { id: "announcements", title: "Announcements", icon: Megaphone, url: createPageUrl("AdminAnnouncements"), category: "communication" },
    { id: "post_orders", title: "Post Orders", icon: BookOpen, url: createPageUrl("AdminPostOrders"), category: "communication" },
  ];

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070d17] p-3 pb-24 text-white sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5 sm:space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#10233b] via-[#0b1726] to-[#07101c] p-5 shadow-2xl sm:p-6 md:p-8">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10"><Shield className="h-6 w-6 text-cyan-300" /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">Master Administration</div>
              <h1 className="mt-1 text-3xl font-black leading-tight text-white md:text-4xl">Admin Command Dashboard</h1>
              <p className="mt-1 text-sm text-slate-400 sm:text-base">Live staffing, activity, requests and administration status in one view.</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="w-full justify-center border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 sm:w-auto">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                All Admin Tools
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 border-slate-700 bg-[#0b1725] text-slate-100">
              <DropdownMenuLabel>Admin Tools</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-500">Team Management</DropdownMenuLabel>
                {adminTools.filter(t => t.category === "team").map(tool => (
                  <DropdownMenuItem key={tool.id} asChild>
                    <Link to={tool.url} className="flex items-center gap-2">
                      <tool.icon className="w-4 h-4" />
                      {tool.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-500">Reports</DropdownMenuLabel>
                {adminTools.filter(t => t.category === "reports").map(tool => (
                  <DropdownMenuItem key={tool.id} asChild>
                    <Link to={tool.url} className="flex items-center gap-2">
                      <tool.icon className="w-4 h-4" />
                      {tool.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-500">Scheduling</DropdownMenuLabel>
                {adminTools.filter(t => t.category === "scheduling").map(tool => (
                  <DropdownMenuItem key={tool.id} asChild>
                    <Link to={tool.url} className="flex items-center gap-2">
                      <tool.icon className="w-4 h-4" />
                      {tool.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-slate-500">Communication</DropdownMenuLabel>
                {adminTools.filter(t => t.category === "communication").map(tool => (
                  <DropdownMenuItem key={tool.id} asChild>
                    <Link to={tool.url} className="flex items-center gap-2">
                      <tool.icon className="w-4 h-4" />
                      {tool.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-6">
          <Card className="border border-blue-500/30 bg-[#0d2033] text-white shadow-lg">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <Users className="w-4 h-4 text-blue-600" />
                Total Officers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="text-3xl font-black text-white sm:text-4xl">{allUsers?.length || 0}</div>
              <p className="mt-1 text-sm font-medium text-blue-200">
                {allUsers?.filter(u => u.role === 'admin').length || 0} admins
              </p>
            </CardContent>
          </Card>

          <Card className="border border-emerald-500/30 bg-[#0d2033] text-white shadow-lg">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <Clock className="w-4 h-4 text-green-600" />
                Officers On Duty
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="text-3xl font-black text-white sm:text-4xl">{activeOfficers || 0}</div>
              <p className="mt-1 text-sm text-emerald-200">Currently active</p>
            </CardContent>
          </Card>

          <Card className="border border-purple-500/30 bg-[#0d2033] text-white shadow-lg">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <FileText className="w-4 h-4 text-purple-600" />
                Today's Entries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="text-3xl font-black text-white sm:text-4xl">{todayEntries?.length || 0}</div>
              <p className="mt-1 text-sm text-purple-200">Clock in/out today</p>
            </CardContent>
          </Card>

          <Card className="border border-amber-500/30 bg-[#0d2033] text-white shadow-lg">
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-white">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Pending Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="text-3xl font-black text-white sm:text-4xl">{pendingRequests || 0}</div>
              <p className="mt-1 text-sm text-amber-200">Reports, requests, availability and weekly scheduling</p>
            </CardContent>
          </Card>
        </div>

        <section className="rounded-2xl border border-amber-500/20 bg-[#0a1421] p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Pending Actions</div><h2 className="mt-1 text-xl font-black text-white">Administrative work queue</h2><p className="mt-1 text-xs text-slate-500">These are live Pathfinder records that need an administrative decision or weekly action.</p></div><button type="button" onClick={() => refetchAdminWork()} disabled={adminWorkRefreshing} className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"><AlertTriangle className="h-4 w-4"/>{adminWorkRefreshing ? 'CHECKING…' : 'REFRESH TASKS'}</button></div>
          <div className="mt-4 grid gap-2 xl:grid-cols-2">
            {!!adminWork.load_errors?.length && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 xl:col-span-2">Partial queue data: {adminWork.load_errors.join(', ')} could not be loaded. Available tasks are still shown below.</div>}
            {adminWorkError ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 xl:col-span-2">Administrative work queue could not load: {adminWorkError.message}</div> : adminTasks.length ? adminTasks.slice(0,16).map(task => <div key={task.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-black text-white">{task.title}</div><div className="mt-0.5 text-xs font-bold text-cyan-200">{task.person}</div><div className="mt-1 truncate text-xs text-slate-500">{task.detail}</div></div><div className="flex shrink-0 flex-wrap gap-2"><Link to={workQueueTaskUrl(task)} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-black text-amber-200 hover:bg-amber-500/20">OPEN TASK</Link><button type="button" onClick={() => completeTask.mutate(task)} disabled={completeTask.isPending} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">MARK DONE</button></div></div>) : <div className="rounded-xl border border-dashed border-emerald-800/60 p-7 text-center text-sm text-emerald-300 xl:col-span-2">No administrative actions are waiting right now.</div>}
            {!!adminWork.recently_completed?.length && <details className="mt-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3 xl:col-span-2"><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-400">Recently completed ({adminWork.recently_completed.length})</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{adminWork.recently_completed.slice(0,8).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs"><span className="font-bold text-slate-300">{item.title || item.task_key}</span><span className="text-emerald-300">{item.completed_at ? new Date(item.completed_at).toLocaleString() : 'Completed'}</span></div>)}</div></details>}
            {completeTask.error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 xl:col-span-2">{completeTask.error.message}</div>}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Today's Workforce Activity</div><h2 className="mt-1 text-xl font-black text-white">Clock activity and staffing movement</h2></div>
              <Clock className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="mt-4 space-y-2">
              {(todayEntries || []).slice(0, 7).map(entry => (
                <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3">
                  <div className="min-w-0"><div className="truncate text-sm font-bold text-white">{getOfficerName(entry.officer_email)}</div><div className="truncate text-xs text-cyan-300">{entry.location || 'Location not listed'}</div></div>
                  <div className="shrink-0 text-right text-xs text-slate-400"><div>{entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : '—'}</div><div className={entry.clock_out ? 'text-slate-500' : 'font-bold text-emerald-300'}>{entry.clock_out ? `Out ${format(new Date(entry.clock_out), 'h:mm a')}` : 'ON DUTY'}</div></div>
                </div>
              ))}
              {!(todayEntries || []).length && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No time activity has been recorded today.</div>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5 shadow-lg">
            <div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Command Shortcuts</div><h2 className="mt-1 text-xl font-black text-white">Most-used administration tools</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {adminTools.filter(tool => ['analytics','scheduling','tracker','all_reports','announcements'].includes(tool.id)).map(tool => <Link key={tool.id} to={tool.url} className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 transition hover:border-cyan-500/40 hover:bg-[#102238]"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><tool.icon className="h-4 w-4"/></div><span className="min-w-0 flex-1 text-sm font-bold text-white">{tool.title}</span><span className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300">→</span></Link>)}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}