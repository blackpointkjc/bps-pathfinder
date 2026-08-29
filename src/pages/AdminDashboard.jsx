import { listDirectoryUsers } from '@/lib/appDirectory';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
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

export default function AdminDashboard() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['adminDashboardActiveUsers'],
    queryFn: async () => {
      const users = await listDirectoryUsers();
      return users.filter(u => !u.termination_date);
    },
    enabled: user?.role === 'admin',
  });

  const { data: todayEntries } = useQuery({
    queryKey: ['todayTimeEntries'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const today = format(new Date(), 'yyyy-MM-dd');
      return entries.filter(e => 
        format(new Date(e.clock_in), 'yyyy-MM-dd') === today
      );
    },
    enabled: user?.role === 'admin',
  });

  const { data: activeOfficers } = useQuery({
    queryKey: ['activeOfficers'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const active = entries.filter(e => !e.clock_out);
      return active.length;
    },
    enabled: user?.role === 'admin',
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['allPendingRequests'],
    queryFn: async () => {
      const requests = await base44.entities.TimeOffRequest.filter({ status: 'pending' });
      return requests.length;
    },
    enabled: user?.role === 'admin',
  });

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

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
                Pending Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="text-3xl font-black text-white sm:text-4xl">{pendingRequests || 0}</div>
              <p className="mt-1 text-sm text-amber-200">Awaiting approval</p>
            </CardContent>
          </Card>
        </div>


      </div>
    </div>
  );
}