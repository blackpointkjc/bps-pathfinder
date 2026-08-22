import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PullToRefresh from "../components/PullToRefresh";
import { motion } from "framer-motion";
import { 
  Clock, 
  CalendarClock, 
  Calendar, 
  FileText, 
  AlertTriangle, 
  Wrench, 
  Timer, 
  MessageCircle, 
  Megaphone,
  UserX,
  DoorOpen,
  DollarSign,
  Shield,
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Briefcase,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  MapPin,
  Sparkles,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { createPageUrl } from "@/utils";
import { format, parseISO } from "date-fns";
import QuickActionCard from "../components/dashboard/QuickActionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useNavigate } from "react-router-dom";
import { listDirectoryUsers } from '@/lib/appDirectory';

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Dashboard({ embedded = false }) {
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries();
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: directoryProfile } = useQuery({
    queryKey: ['dashboardDirectoryProfile', user?.email],
    queryFn: async () => {
      const rows = await listDirectoryUsers();
      const email = String(user?.email || '').trim().toLowerCase();
      return rows.find(row => String(row.email || '').trim().toLowerCase() === email) || null;
    },
    enabled: !!user?.email,
    staleTime: 15000,
  });

  const profile = directoryProfile || user;

  const { data: myReviewData = { reviews: [] } } = useQuery({
    queryKey: ['dashboardPerformanceReviews', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('manageOfficerPerformanceReviews', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const myPerformanceReviews = myReviewData.reviews || [];
  const reviewResponseRequired = myPerformanceReviews.find(review =>
    String(review.workflow_stage || '') === 'officer_pending' && !review.officer_acknowledged
  );

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const email = String(user.email).trim().toLowerCase();
      const entries = await base44.entities.TimeEntry.list('-created_date', 500);
      const userEntries = entries.filter(e => String(e.officer_email || '').trim().toLowerCase() === email);
      return userEntries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
    refetchInterval: 15000,
  });

  const { data: todaySchedule } = useQuery({
    queryKey: ['todaySchedule', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const today = format(new Date(), 'yyyy-MM-dd');
      const email = String(user.email).trim().toLowerCase();
      const schedules = await base44.entities.Schedule.list('shift_date', 500);
      return schedules.find(s =>
        s.shift_date === today &&
        String(s.officer_email || '').trim().toLowerCase() === email &&
        s.archived !== true &&
        s.is_open !== true
      ) || null;
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['pendingRequests'],
    queryFn: async () => {
      if (!user?.email) return null;
      const requests = await base44.entities.TimeOffRequest.filter({
        created_by_id: user.id,
        status: 'pending'
      });
      return requests.length;
    },
    enabled: !!user?.id,
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      return periods;
    },
  });

  const getCurrentPayrollPeriod = () => {
    if (!payrollPeriods) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    return payrollPeriods.find(p => p.start_date <= today && p.end_date >= today);
  };

  const currentPeriod = getCurrentPayrollPeriod();

  const { data: currentPeriodHours } = useQuery({
    queryKey: ['currentPeriodHours', user?.email, currentPeriod?.id],
    queryFn: async () => {
      if (!user?.email || !currentPeriod) return { totalHours: 0, regularHours: 0, overtimeHours: 0 };
      
      const email = String(user.email).trim().toLowerCase();
      const entries = await base44.entities.TimeEntry.list('-clock_in', 1000);
      const completedEntries = entries.filter(e => e.clock_out && String(e.officer_email || '').trim().toLowerCase() === email);
      
      const getPayrollWeekStart = (clockInTime) => {
        const dt = new Date(clockInTime);
        const dayOfWeek = dt.getDay();
        const daysSinceFriday = (dayOfWeek + 2) % 7;
        const weekStart = new Date(dt);
        weekStart.setDate(weekStart.getDate() - daysSinceFriday);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
      };

      const periodStartDate = new Date(currentPeriod.start_date + 'T00:00:00');
      const periodEndDate = new Date(currentPeriod.end_date + 'T23:59:59');

      const periodEntries = completedEntries.filter(entry => {
        const clockInTime = new Date(entry.clock_in);
        return clockInTime >= periodStartDate && clockInTime <= periodEndDate;
      });

      const weeklyHours = {};
      periodEntries.forEach(entry => {
        const clockInTime = new Date(entry.clock_in);
        const clockOutTime = new Date(entry.clock_out);
        const weekStart = getPayrollWeekStart(clockInTime);
        const weekKey = weekStart.toISOString();
        if (!weeklyHours[weekKey]) weeklyHours[weekKey] = 0;
        const breakMs = (entry.break_periods || []).reduce((total, period) => {
          const breakStart = period?.start ? new Date(period.start).getTime() : NaN;
          const breakEnd = period?.end ? new Date(period.end).getTime() : NaN;
          return total + (Number.isFinite(breakStart) && Number.isFinite(breakEnd) && breakEnd > breakStart ? breakEnd - breakStart : 0);
        }, 0);
        const hours = Math.max(0, (clockOutTime.getTime() - clockInTime.getTime() - breakMs) / (1000 * 60 * 60));
        weeklyHours[weekKey] += hours;
      });

      let totalRegularHours = 0;
      let totalOvertimeHours = 0;
      Object.values(weeklyHours).forEach(weekHours => {
        if (weekHours > 40) {
          totalRegularHours += 40;
          totalOvertimeHours += (weekHours - 40);
        } else {
          totalRegularHours += weekHours;
        }
      });

      return {
        totalHours: totalRegularHours + totalOvertimeHours,
        regularHours: totalRegularHours,
        overtimeHours: totalOvertimeHours
      };
    },
    enabled: !!user?.email && !!currentPeriod,
  });

  const navigate = useNavigate();
  const isClient = user?.additional_roles?.includes('client');
  if (isClient) {
    navigate(createPageUrl("ClientDashboard"), { replace: true });
    return null;
  }

  const getDisplayName = () => {
    const first = String(profile?.first_name || '').trim();
    if (first) return first;
    const full = String(profile?.full_name || '').trim();
    if (full) return full.split(/\s+/)[0];
    const emailName = String(profile?.email || user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return emailName ? emailName.replace(/\b\w/g, c => c.toUpperCase()) : 'Officer';
  };

  const allQuickActions = [
    { id: "time_clock", title: "Time Clock", description: "Clock in/out", icon: Clock, color: "from-blue-500 to-blue-600", url: createPageUrl("TimeClock"), category: "main" },
    { id: "schedule", title: "My Schedule", description: "View shifts", icon: Calendar, color: "from-violet-500 to-purple-600", url: createPageUrl("Schedule"), category: "main" },
    { id: "my_performance", title: "My Performance", description: "View analytics", icon: ClipboardList, color: "from-emerald-500 to-green-600", url: createPageUrl("MyPerformanceAnalytics"), category: "main" },
    { id: "my_reviews", title: "Reviews & Feedback", description: reviewResponseRequired ? "Response required" : "View evaluations", icon: ClipboardCheck, color: reviewResponseRequired ? "from-amber-500 to-orange-600" : "from-indigo-500 to-violet-600", url: createPageUrl("OfficerPerformanceReviews"), category: "main" },
    { id: "open_shifts", title: "Open Shifts", description: "Bid on shifts", icon: Briefcase, color: "from-amber-500 to-orange-600", url: createPageUrl("OpenShifts"), category: "schedule" },
    { id: "time_requests", title: "Time Off", description: "Request PTO", icon: CalendarClock, color: "from-teal-500 to-cyan-600", url: createPageUrl("TimeRequests"), category: "schedule" },
    { id: "payroll_dates", title: "Payroll", description: "View pay schedule", icon: DollarSign, color: "from-emerald-500 to-green-600", url: createPageUrl("PayrollDates"), category: "schedule" },
    { id: "daily_activity", title: "Daily Activity", description: "Submit report", icon: FileText, color: "from-blue-500 to-indigo-600", url: createPageUrl("DailyActivityReports"), category: "reports" },
    { id: "incident", title: "Incident", description: "Report incident", icon: AlertTriangle, color: "from-red-500 to-rose-600", url: createPageUrl("IncidentReports"), category: "reports" },
    { id: "trespass", title: "Trespass", description: "Issue notice", icon: UserX, color: "from-rose-600 to-red-700", url: createPageUrl("TrespassingNotices"), category: "reports" },
    { id: "maintenance", title: "Maintenance", description: "Report issue", icon: Wrench, color: "from-slate-500 to-slate-600", url: createPageUrl("MaintenanceReports"), category: "reports" },
    { id: "open_door", title: "Open Door", description: "Report door", icon: DoorOpen, color: "from-yellow-500 to-amber-600", url: createPageUrl("OpenDoorReports"), category: "reports" },
    { id: "criminal", title: "Criminal", description: "File complaint", icon: Shield, color: "from-slate-600 to-slate-700", url: createPageUrl("CriminalComplaints"), category: "reports" },
    { id: "confidential", title: "Confidential", description: "Private report", icon: ShieldCheck, color: "from-purple-600 to-violet-700", url: createPageUrl("ConfidentialReport"), category: "reports" },
    { id: "team_chat", title: "Team Chat", description: "Message team", icon: MessageCircle, color: "from-cyan-500 to-blue-600", url: createPageUrl("TeamChat"), category: "communication" },
    { id: "announcements", title: "Announcements", description: "View updates", icon: Megaphone, color: "from-indigo-500 to-blue-600", url: createPageUrl("Announcements"), category: "communication" },
    { id: "training", title: "Training", description: "View courses", icon: GraduationCap, color: "from-pink-500 to-rose-600", url: createPageUrl("OfficerTraining"), category: "resources" },
    { id: "post_orders", title: "Post Orders", description: "Site protocols", icon: BookOpen, color: "from-blue-600 to-indigo-700", url: createPageUrl("PostOrders"), category: "resources" },
    { id: "rank_duties", title: "Rank Duties", description: "View responsibilities", icon: Shield, color: "from-slate-500 to-slate-600", url: createPageUrl("RankDuties"), category: "resources" },
    { id: "qr_patrol", title: "QR Patrol", description: "Scan checkpoints", icon: MapPin, color: "from-teal-500 to-emerald-600", url: createPageUrl("QRPatrolScan"), category: "main" },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className={`relative overflow-hidden bg-slate-950 ${embedded ? 'min-h-0' : 'min-h-screen'}`}>
      {/* Cinematic animated gradient mesh background */}
      {!embedded && <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/20 blur-[120px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }} />
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full bg-emerald-600/15 blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
      </div>}
      {/* Subtle grid overlay */}
      {!embedded && <div 
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />}

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={`relative mx-auto max-w-[1600px] space-y-5 md:space-y-6 ${embedded ? 'p-4 md:p-5' : 'p-4 md:p-6 lg:p-8'}`}
      >
        {/* Cinematic Hero */}
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-slate-800/50 p-5 backdrop-blur-xl md:p-7">
          {/* Glow accents */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-violet-500/20 blur-3xl" />
          
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative hidden shrink-0 md:flex">
                <div className="absolute inset-0 rounded-2xl bg-blue-500/25 blur-xl" />
                <img src={LOGO_URL} alt="Black Point Protection" className="relative h-14 w-14 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-blue-400">{format(new Date(), 'EEEE')}</span>
                </div>
                <h1 className="break-words text-3xl font-bold tracking-tight text-white md:text-4xl">
                  Welcome back, <span className="text-blue-300">{getDisplayName()}</span>
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                  {profile?.rank && <span>{profile.rank}</span>}
                  {profile?.unit_number && <span>• Unit {profile.unit_number}</span>}
                  {profile?.division && <span>• {profile.division}</span>}
                </div>
                <p className="text-sm md:text-base text-slate-400 mt-2">
                  {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('pathfinder:open-mobile-tools'))}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-600/25 lg:hidden"
            >
              <LayoutDashboard className="mr-2 h-5 w-5" />
              Browse All Tools
              <ChevronRight className="ml-2 h-5 w-5" />
            </button>
            <div className="hidden lg:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="group bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-300 rounded-xl px-5 py-2.5 border border-white/10">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  All Tools
                  <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 max-h-[60vh] overflow-y-auto md:max-h-[70vh] bg-slate-900/95 backdrop-blur-xl border-white/10 text-slate-200" align="end">
                <DropdownMenuLabel className="text-slate-400">Quick Actions</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-slate-500">Schedule & Time</DropdownMenuLabel>
                  {allQuickActions.filter(a => a.category === "schedule" || a.category === "main").map(action => (
                    <DropdownMenuItem key={action.id} asChild className="hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                      <Link to={action.url} className="flex items-center gap-2">
                        <action.icon className="w-4 h-4 text-blue-400" />
                        {action.title}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-slate-500">Reports</DropdownMenuLabel>
                  {allQuickActions.filter(a => a.category === "reports").map(action => (
                    <DropdownMenuItem key={action.id} asChild className="hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                      <Link to={action.url} className="flex items-center gap-2">
                        <action.icon className="w-4 h-4 text-blue-400" />
                        {action.title}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-slate-500">Communication</DropdownMenuLabel>
                  {allQuickActions.filter(a => a.category === "communication").map(action => (
                    <DropdownMenuItem key={action.id} asChild className="hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                      <Link to={action.url} className="flex items-center gap-2">
                        <action.icon className="w-4 h-4 text-blue-400" />
                        {action.title}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-slate-500">Resources</DropdownMenuLabel>
                  {allQuickActions.filter(a => a.category === "resources").map(action => (
                    <DropdownMenuItem key={action.id} asChild className="hover:bg-white/10 focus:bg-white/10 cursor-pointer">
                      <Link to={action.url} className="flex items-center gap-2">
                        <action.icon className="w-4 h-4 text-blue-400" />
                        {action.title}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </motion.div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Duty Status */}
          <motion.div variants={itemVariants}>
            <div className={`relative overflow-hidden rounded-2xl border p-5 md:p-6 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${
              activeEntry 
                ? 'border-red-500/30 bg-gradient-to-br from-red-950/60 to-rose-900/20' 
                : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-green-900/20'
            }`}>
              <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl ${activeEntry ? 'bg-red-500/20' : 'bg-emerald-500/20'}`} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Timer className={`w-4 h-4 ${activeEntry ? 'text-red-400' : 'text-emerald-400'}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Status</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${activeEntry ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'}`} />
                  <span className="text-2xl md:text-3xl font-bold text-white">
                    {activeEntry ? 'On Duty' : 'Off Duty'}
                  </span>
                </div>
                {activeEntry && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm text-slate-300 font-medium">
                      Since {activeEntry.clock_in && activeEntry.clock_in !== '' ? format(new Date(activeEntry.clock_in), 'h:mm a') : 'N/A'}
                    </p>
                    <p className="text-sm text-slate-400 font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {activeEntry.location}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Today's Schedule */}
          <motion.div variants={itemVariants}>
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/60 to-indigo-900/20 backdrop-blur-xl p-5 md:p-6 transition-all duration-300 hover:scale-[1.02]">
              <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-violet-500/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today's Schedule</span>
                </div>
                {todaySchedule ? (
                  <div>
                    <p className="text-2xl md:text-3xl font-bold text-white">
                      {todaySchedule.start_time}
                      <span className="text-slate-500 text-xl"> – {todaySchedule.end_time}</span>
                    </p>
                    <p className="text-sm text-slate-300 mt-2 font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {todaySchedule.location}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg md:text-xl text-slate-400 font-medium">No shift scheduled</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Pending Requests */}
          <motion.div variants={itemVariants}>
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/60 to-orange-900/20 backdrop-blur-xl p-5 md:p-6 transition-all duration-300 hover:scale-[1.02]">
              <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-amber-500/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarClock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Requests</span>
                </div>
                <p className="text-4xl md:text-5xl font-bold text-white">
                  {pendingRequests || 0}
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">Time off requests</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Payroll Period Card */}
        {currentPeriod && (
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/60 to-green-900/20 backdrop-blur-xl p-5 md:p-6">
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="relative flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <DollarSign className="w-7 h-7 md:w-8 md:h-8 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-lg md:text-xl">Current Payroll Period: {currentPeriod.period_name}</p>
                  <p className="text-xs md:text-sm text-slate-400">
                    {currentPeriod.start_date && currentPeriod.end_date ? `${format(parseISO(currentPeriod.start_date), 'MMM d')} - ${format(parseISO(currentPeriod.end_date), 'MMM d, yyyy')}` : 'N/A'}
                  </p>
                  {currentPeriod.deposit_date && currentPeriod.deposit_date !== '' && (
                    <p className="text-xs md:text-sm text-emerald-400 font-bold mt-1 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Direct Deposit: {format(parseISO(currentPeriod.deposit_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              {currentPeriodHours && (
                <div className="bg-slate-900/50 rounded-xl p-4 border border-emerald-500/20 backdrop-blur-sm">
                  <p className="text-[10px] md:text-xs text-emerald-400 font-bold mb-1.5 uppercase tracking-wider">Hours This Period</p>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div>
                      <p className="text-2xl md:text-3xl font-bold text-white">{currentPeriodHours.totalHours.toFixed(1)}h</p>
                      <p className="text-[10px] md:text-xs text-slate-500">Total</p>
                    </div>
                    {currentPeriodHours.overtimeHours > 0 && (
                      <div className="border-l-2 border-emerald-500/30 pl-3 md:pl-4">
                        <p className="text-xl md:text-2xl font-bold text-orange-400">+{currentPeriodHours.overtimeHours.toFixed(1)}h</p>
                        <p className="text-[10px] md:text-xs text-orange-400">Overtime</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 rounded-full font-bold">✓ Active</Badge>
            </div>
          </motion.div>
        )}

        {reviewResponseRequired && (
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-950/90 to-orange-950/70 p-5 shadow-xl shadow-amber-950/30">
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 p-3"><ClipboardCheck className="h-7 w-7 text-amber-300" /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-amber-300">Action Required</p>
                  <h2 className="text-xl font-black text-white">Your performance review is ready</h2>
                  <p className="mt-1 text-sm text-amber-100">Review Joseph Sherrill's feedback, complete your self-rating, and sign electronically.</p>
                </div>
              </div>
              <Link to={createPageUrl("OfficerPerformanceReviews")} className="flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-amber-400 px-5 font-black text-slate-950 hover:bg-amber-300">
                Open Review <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </motion.div>
        )}

        {/* Today's Shift Banner */}
        {todaySchedule && (
          <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-950/50 to-indigo-950/30 backdrop-blur-xl p-4 md:p-5">
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-violet-500/15 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex-shrink-0">
                <Calendar className="h-4 w-4 md:h-5 md:w-5 text-violet-400" />
              </div>
              <div className="text-violet-100 text-sm md:text-base">
                <strong className="text-white">Today's Shift:</strong> {todaySchedule.location} • {todaySchedule.start_time} - {todaySchedule.end_time}
                {todaySchedule.special_instructions && (
                  <span className="block mt-1 text-xs md:text-sm text-violet-300">{todaySchedule.special_instructions}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-lg md:text-xl font-bold text-white">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {allQuickActions.filter(a => a.category === "main" || a.category === "schedule").slice(0, 8).map((action, idx) => (
              <motion.div
                key={action.id}
                variants={itemVariants}
                custom={idx}
              >
                <QuickActionCard {...action} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
    </PullToRefresh>
  );
}