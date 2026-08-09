import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  BarChart3, Clock, CheckCircle2, Award, Calendar, Star, AlertTriangle,
  Bell, MapPin, ChevronRight, GraduationCap, UserX
} from "lucide-react";
import { format, parseISO, addDays, startOfWeek, isToday, isTomorrow, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function MyPerformanceAnalytics() {
  // Define month boundaries first — used in query keys below
  const currentMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthName = format(new Date(), 'MMMM yyyy');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: performanceData = {}, isLoading: performanceLoading, error: performanceError } = useQuery({
    queryKey: ['myPerformanceData', user?.email],
    queryFn: async () => {
      const result = await base44.functions.invoke('getMyPerformanceData', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user?.email,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const timeEntries = performanceData.timeEntries || [];
  const schedules = performanceData.schedules || [];
  const myBids = performanceData.bids || [];
  const trainingCompletions = performanceData.trainingCompletions || [];
  const allTraining = performanceData.trainingModules || [];
  const myAssignments = performanceData.trainingAssignments || [];
  const notifications = performanceData.notifications || [];
  const myCallOuts = performanceData.callOuts || [];
  const qrScanEvents = performanceData.qrScanEvents || [];
  const allCheckpoints = performanceData.checkpoints || [];

  const thisWeekSchedule = React.useMemo(() => {
    if (!schedules) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = addDays(weekStart, 6);
    
    return schedules.filter(s => {
      const shiftDate = parseISO(s.shift_date);
      // Only include today and future shifts within this week
      return shiftDate >= today && shiftDate >= weekStart && shiftDate <= weekEnd;
    }).sort((a, b) => a.shift_date.localeCompare(b.shift_date));
  }, [schedules]);

  // Recent important notifications
  const recentNotifications = React.useMemo(() => {
    if (!notifications || !user?.email) return [];
    const myEmail = user.email.trim().toLowerCase();
    return notifications
      .filter(n => {
        const recipient = String(n.recipient_email || '').trim().toLowerCase();
        const isMine = recipient === myEmail;
        const isCompanyWide = ['all', 'company', 'company-wide', 'company_wide', '*'].includes(recipient)
          || n.type === 'company_broadcast'
          || n.audience === 'company';
        return !n.is_read && isMine && !isCompanyWide;
      })
      .slice(0, 5);
  }, [notifications, user?.email]);

  // Calculate on-time rate - MONTHLY RESET
  const onTimeStats = React.useMemo(() => {
    if (!timeEntries || !schedules) return { rate: 0, onTime: 0, late: 0, total: 0 };

    let onTime = 0;
    let late = 0;

    // Filter to current month only
    const monthlyEntries = timeEntries.filter(entry => {
      if (!entry.clock_in) return false;
      const entryDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      return entryDate >= currentMonthStart && entryDate <= currentMonthEnd;
    });

    monthlyEntries.forEach(entry => {
      if (!entry.clock_in) return;
      const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      const clockInTime = format(parseISO(entry.clock_in), 'HH:mm');
      
      const matchingSchedule = schedules.find(s => 
        s.shift_date === clockInDate && 
        s.officer_email === entry.officer_email
      );

      if (matchingSchedule) {
        const scheduledStart = matchingSchedule.start_time;
        
        const scheduledMinutes = parseInt(scheduledStart.split(':')[0]) * 60 + parseInt(scheduledStart.split(':')[1]);
        const actualMinutes = parseInt(clockInTime.split(':')[0]) * 60 + parseInt(clockInTime.split(':')[1]);
        
        // Allow 5 minute grace period
        if (actualMinutes <= scheduledMinutes + 5) {
          onTime++;
        } else {
          late++;
        }
      }
    });

    const total = onTime + late;
    const rate = total > 0 ? Math.round((onTime / total) * 100) : 100;

    return { rate, onTime, late, total };
  }, [timeEntries, schedules, currentMonthStart, currentMonthEnd]);

  // Calculate actual worked hours from completed time entries - MONTHLY RESET
  const hoursData = React.useMemo(() => {
    if (!timeEntries) return { regular: 0, overtime: 0, total: 0, weeklyData: [] };

    const weeklyHours = {};
    timeEntries.filter(entry => {
      if (!entry.clock_in || !entry.clock_out) return false;
      const date = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).forEach(entry => {
      const date = parseISO(entry.clock_in);
      const dayOfWeek = date.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      const hours = Math.max(0, (new Date(entry.clock_out) - new Date(entry.clock_in)) / 3600000 - Number(entry.lunch_duration || entry.lunch_minutes || 0) / 60);

      if (!weeklyHours[weekKey]) weeklyHours[weekKey] = 0;
      weeklyHours[weekKey] += hours;
    });

    let regular = 0, overtime = 0;
    const weeklyData = [];

    Object.entries(weeklyHours).forEach(([week, hours]) => {
      if (hours > 40) {
        regular += 40;
        overtime += hours - 40;
      } else {
        regular += hours;
      }
      weeklyData.push({ week: format(parseISO(week), 'MMM d'), hours: Math.round(hours * 10) / 10 });
    });

    return { regular: Math.round(regular * 10) / 10, overtime: Math.round(overtime * 10) / 10, total: Math.round((regular + overtime) * 10) / 10, weeklyData };
  }, [timeEntries, currentMonthStart, currentMonthEnd]);

  // Training completion
  const trainingStats = React.useMemo(() => {
    if (!allTraining || !user) return { completed: 0, total: 0, percentage: 0, pending: 0, complianceApproved: 0, compliancePending: 0 };

    const assignedTraining = allTraining.filter(t => 
      t.assigned_to?.includes(user.email) || 
      t.assigned_divisions?.includes(user.division) ||
      t.assigned_ranks?.includes(user.rank)
    );

    const completedIds = (trainingCompletions || []).filter(tc => tc.completed).map(tc => tc.training_module_id);
    const completed = assignedTraining.filter(t => completedIds.includes(t.id)).length;
    const total = assignedTraining.length;
    const pending = total - completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;

    const complianceApproved = (myAssignments || []).filter(a => a.status === 'approved').length;
    const compliancePending = (myAssignments || []).filter(a => !['approved'].includes(a.status)).length;

    return { completed, total, percentage, pending, complianceApproved, compliancePending };
  }, [allTraining, trainingCompletions, user, myAssignments]);

  // Bid history - MONTHLY RESET
  const bidStats = React.useMemo(() => {
    if (!myBids) return { total: 0, accepted: 0, rejected: 0, pending: 0, acceptanceRate: 0 };

    // Filter to current month only
    const monthlyBids = myBids.filter(b => {
      const bidDate = format(parseISO(b.created_date), 'yyyy-MM-dd');
      return bidDate >= currentMonthStart && bidDate <= currentMonthEnd;
    });

    const accepted = monthlyBids.filter(b => b.status === 'accepted').length;
    const rejected = monthlyBids.filter(b => b.status === 'rejected').length;
    const pending = monthlyBids.filter(b => b.status === 'pending').length;
    const total = monthlyBids.length;
    const acceptanceRate = (accepted + rejected) > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : 0;

    return { total, accepted, rejected, pending, acceptanceRate };
  }, [myBids, currentMonthStart, currentMonthEnd]);

  // QR Patrol stats for the current month - only count when clocked in
  const qrPatrolStats = useMemo(() => {
    if (!qrScanEvents || !allCheckpoints || !timeEntries) return { totalScans: 0, successScans: 0, missedRounds: 0, completedRounds: 0 };

    const monthlyScans = qrScanEvents.filter(s => s.scanned_date >= currentMonthStart && s.scanned_date <= currentMonthEnd);
    const totalScans = monthlyScans.length;
    const successScans = monthlyScans.filter(s => s.scan_status === 'success').length;

    // Create map of clock in/out times for quick lookup
    const clockInOutMap = {};
    timeEntries.forEach(entry => {
      if (entry.clock_in && entry.clock_out) {
        const date = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
        if (!clockInOutMap[date]) clockInOutMap[date] = [];
        clockInOutMap[date].push({
          start: new Date(entry.clock_in),
          end: new Date(entry.clock_out)
        });
      }
    });

    // Check if a scan time falls within any clock in/out period
    const isClockIn = (scanTime) => {
      const scanDate = format(parseISO(scanTime), 'yyyy-MM-dd');
      const periods = clockInOutMap[scanDate];
      if (!periods) return false;
      const scanDateTime = new Date(scanTime);
      return periods.some(p => scanDateTime >= p.start && scanDateTime <= p.end);
    };

    // Group by date to count rounds
    const byDate = {};
    for (const s of monthlyScans) {
      if (!isClockIn(s.scanned_at)) continue; // Skip if clocked out
      if (!byDate[s.scanned_date]) byDate[s.scanned_date] = [];
      byDate[s.scanned_date].push(s);
    }

    let completedRounds = 0;
    let missedRounds = 0;

    for (const [, scans] of Object.entries(byDate)) {
      if (scans.length === 0) continue;
      // Determine site from scans
      const site = scans[0]?.property_site;
      if (!site) continue;
      const siteCheckpoints = allCheckpoints.filter(cp => cp.property_site === site);
      if (siteCheckpoints.length === 0) continue;

      // Figure out shift start from earliest scan
      const earliest = new Date(Math.min(...scans.map(s => new Date(s.scanned_at).getTime())));
      let cursor = new Date(earliest);
      cursor.setMinutes(0, 0, 0); // align to hour

      const now = new Date();
      let safetyCount = 0;
      while (cursor <= now && safetyCount < 24) {
        safetyCount++;
        const windowEnd = new Date(cursor.getTime() + 30 * 60 * 1000);
        const windowScans = scans.filter(s => {
          const t = new Date(s.scanned_at);
          return t >= cursor && t <= windowEnd && s.scan_status === 'success';
        });
        const scannedIds = new Set(windowScans.map(s => s.checkpoint_id));
        const allDone = siteCheckpoints.every(cp => scannedIds.has(cp.id));
        if (allDone) completedRounds++;
        else if (new Date() > windowEnd) missedRounds++;
        cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
      }
    }

    return { totalScans, successScans, completedRounds, missedRounds };
  }, [qrScanEvents, allCheckpoints, timeEntries, currentMonthStart, currentMonthEnd]);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'shift_posted': return <Calendar className="w-4 h-4 text-blue-600" />;
      case 'bid_accepted': return <Star className="w-4 h-4 text-green-600" />;
      case 'bid_rejected': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'training_reminder': return <GraduationCap className="w-4 h-4 text-purple-600" />;
      default: return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  const calculateShiftHours = (start, end) => {
    const s = parseInt(start.replace(':', ''));
    const e = parseInt(end.replace(':', ''));
    return e < s ? ((2400 - s) + e) / 100 : (e - s) / 100;
  };

  return (
    <div className="min-h-screen overflow-x-hidden p-3 sm:p-4 md:p-5">
      <div className="mx-auto w-full min-w-0 space-y-4" style={{ maxWidth: '1180px' }}>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            My Performance Analytics
          </h1>
          <p className="text-slate-600">Track your performance metrics and upcoming schedule</p>
          <Badge className="bg-blue-100 text-blue-800 mt-2">
            <Calendar className="w-3 h-3 mr-1" />
            {currentMonthName} (Resets Monthly)
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-3 sm:p-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600 sm:text-3xl">{onTimeStats.rate}%</p>
              <p className="text-xs text-slate-600">On-Time Arrival</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-100">
            <CardContent className="p-3 sm:p-4">
              <Clock className="w-6 h-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-blue-600 sm:text-3xl">{hoursData.total}h</p>
              <p className="text-xs text-slate-600">Hours This Month</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-violet-100">
            <CardContent className="p-3 sm:p-4">
              <Award className="w-6 h-6 text-purple-600 mb-2" />
              <p className="text-2xl font-bold text-purple-600 sm:text-3xl">{trainingStats.pending}</p>
              <p className="text-xs text-slate-600">Training Pending</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
            <CardContent className="p-3 sm:p-4">
              <Star className="w-6 h-6 text-amber-600 mb-2" />
              <p className="text-2xl font-bold text-amber-600 sm:text-3xl">{bidStats.acceptanceRate}%</p>
              <p className="text-xs text-slate-600">Bid Acceptance Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* QR Patrol Stats */}
        {(qrPatrolStats.totalScans > 0 || qrPatrolStats.missedRounds > 0) && (
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-teal-600" />
                QR Patrol Performance — {currentMonthName}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-teal-50 rounded-lg">
                  <p className="text-2xl font-bold text-teal-700">{qrPatrolStats.totalScans}</p>
                  <p className="text-xs text-slate-600">Total Scans</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">{qrPatrolStats.successScans}</p>
                  <p className="text-xs text-slate-600">Successful</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">{qrPatrolStats.completedRounds}</p>
                  <p className="text-xs text-slate-600">Rounds Complete</p>
                </div>
                <div className={`p-3 rounded-lg ${qrPatrolStats.missedRounds > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <p className={`text-2xl font-bold ${qrPatrolStats.missedRounds > 0 ? 'text-red-600' : 'text-slate-400'}`}>{qrPatrolStats.missedRounds}</p>
                  <p className="text-xs text-slate-600">Rounds Missed</p>
                </div>
              </div>
              {qrPatrolStats.missedRounds > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {qrPatrolStats.missedRounds} patrol round{qrPatrolStats.missedRounds !== 1 ? 's' : ''} missed this month — ensure all checkpoints are scanned within the 30-min window each hour.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Notification Feed */}
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-50 to-pink-50">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-red-600" />
                  Recent Alerts
                </div>
                {recentNotifications.length > 0 && (
                  <Badge className="bg-red-600 text-white">{recentNotifications.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-56 sm:h-60">
                {recentNotifications.length > 0 ? (
                  <div className="p-4 space-y-3">
                    {recentNotifications.map(n => (
                      <div key={n.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          {getNotificationIcon(n.type)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{n.title}</p>
                            <p className="text-xs text-slate-600 line-clamp-2">{n.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {format(parseISO(n.created_date), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No new alerts</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Weekly Schedule View */}
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  This Week's Schedule
                </div>
                <Link 
                  to={createPageUrl("Schedule")}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-4 h-4" />
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-56 sm:h-60">
                {thisWeekSchedule.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {thisWeekSchedule.map((shift, idx) => {
                      const shiftDate = parseISO(shift.shift_date);
                      const isShiftToday = isToday(shiftDate);
                      const isShiftTomorrow = isTomorrow(shiftDate);
                      
                      return (
                        <div 
                          key={idx} 
                          className={`p-3 rounded-lg border ${
                            isShiftToday ? 'bg-blue-100 border-blue-300' : 
                            isShiftTomorrow ? 'bg-amber-50 border-amber-200' :
                            'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm flex items-center gap-2">
                                {format(shiftDate, 'EEE, MMM d')}
                                {isShiftToday && <Badge className="bg-blue-600 text-white text-xs">TODAY</Badge>}
                                {isShiftTomorrow && <Badge className="bg-amber-600 text-white text-xs">TOMORROW</Badge>}
                              </p>
                              <p className="text-xs text-slate-600">{shift.start_time} - {shift.end_time}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {calculateShiftHours(shift.start_time, shift.end_time).toFixed(1)}h
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {shift.location?.split(':')[0]}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No upcoming shifts this week</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Hours by Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hoursData.weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hoursData.weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-slate-500 py-8">No data for current period</p>
              )}
              <div className="mt-4 flex justify-around text-sm">
                <div className="text-center">
                  <p className="font-bold text-blue-600">{hoursData.regular}h</p>
                  <p className="text-slate-500">Regular</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-orange-600">{hoursData.overtime}h</p>
                  <p className="text-slate-500">Overtime</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Punctuality Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'On Time', value: onTimeStats.onTime },
                        { name: 'Late', value: onTimeStats.late },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-around text-sm mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>On Time: {onTimeStats.onTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>Late: {onTimeStats.late}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Call-Outs Section */}
        {myCallOuts && myCallOuts.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50">
              <CardTitle className="flex items-center gap-2">
                <UserX className="w-5 h-5 text-red-600" />
                Call-Outs & Attendance Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="space-y-3">
                {myCallOuts.map((callOut) => (
                  <div key={callOut.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={callOut.call_out_type === 'called_out' ? 'bg-red-600' : 'bg-amber-600'}>
                        {callOut.call_out_type === 'called_out' ? 'Called Out' : 'Sent Home'}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {format(parseISO(callOut.call_out_date), 'MMM d, yyyy')} at {callOut.call_out_time}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700"><strong>Reason:</strong> {callOut.reason}</p>
                    {callOut.location && (
                      <p className="text-xs text-slate-600 mt-1">Location: {callOut.location}</p>
                    )}
                    {callOut.affects_pto && (
                      <Badge variant="outline" className="border-purple-600 text-purple-600 text-xs mt-2">
                        No PTO Accrual
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Training Summary */}
        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-600" />
                Training & Compliance
              </div>
              <Link to={createPageUrl("OfficerTraining")} className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{trainingStats.completed}</p>
                <p className="text-xs text-slate-600">Modules Done</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">{trainingStats.pending}</p>
                <p className="text-xs text-slate-600">Modules Pending</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{trainingStats.complianceApproved}</p>
                <p className="text-xs text-slate-600">Certs Approved</p>
              </div>
              <div className={`p-3 rounded-lg ${trainingStats.compliancePending > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className={`text-2xl font-bold ${trainingStats.compliancePending > 0 ? 'text-red-600' : 'text-slate-400'}`}>{trainingStats.compliancePending}</p>
                <p className="text-xs text-slate-600">Certs Pending</p>
              </div>
            </div>
            {trainingStats.pending > 0 && (
              <Link to={createPageUrl("OfficerTraining")} className="mt-3 block w-full text-center text-sm bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors">
                Complete Pending Training →
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Bids Only - Training removed */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-600" />
              Shift Bid History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{bidStats.accepted}</p>
                  <p className="text-xs text-slate-600">Accepted</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{bidStats.rejected}</p>
                  <p className="text-xs text-slate-600">Rejected</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">{bidStats.pending}</p>
                  <p className="text-xs text-slate-600">Pending</p>
                </div>
              </div>
              {bidStats.total === 0 && (
                <p className="text-sm text-slate-500 text-center">No bids submitted yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {myBids && myBids.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Recent Bid Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {myBids.slice(0, 10).map(bid => (
                  <div key={bid.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium">{format(parseISO(bid.created_date), 'MMM d, yyyy')}</p>
                      <p className="text-sm text-slate-500">Priority: {bid.bid_priority}</p>
                    </div>
                    <Badge className={
                      bid.status === 'accepted' ? 'bg-green-600' : 
                      bid.status === 'rejected' ? 'bg-red-600' : 
                      'bg-amber-600'
                    }>
                      {bid.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}