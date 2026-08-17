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
import { calculatePunctuality, calculateBidStanding, calculateTrainingScore, calculateQrPatrol, calculateClientFeedback, calculateSupervisorRating, calculateRecognition, buildOverallPerformance } from '@/lib/performanceScoring';

const emailKey = (value) => String(value || '').trim().toLowerCase();

function breakMinutes(entry) {
  return (entry?.break_periods || []).reduce((total, period) => {
    const start = period?.start ? new Date(period.start).getTime() : NaN;
    const end = period?.end ? new Date(period.end).getTime() : NaN;
    return total + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : 0);
  }, 0);
}

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
  const myComplaints = performanceData.complaints || [];
  const myCommendations = performanceData.commendations || [];
  const myClientFeedback = performanceData.clientFeedback || [];
  const myPerformanceReviews = performanceData.performanceReviews || [];
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

  // Punctuality is calculated in Eastern Time and each punch is matched to the
  // correct scheduled shift window, not simply the first shift on the same date.
  const onTimeStats = React.useMemo(
    () => calculatePunctuality(timeEntries, schedules, currentMonthStart, currentMonthEnd),
    [timeEntries, schedules, currentMonthStart, currentMonthEnd]
  );

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
      const grossMinutes = (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 60000;
      const hours = Math.max(0, (grossMinutes - breakMinutes(entry)) / 60);

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

  const trainingStats = React.useMemo(
    () => calculateTrainingScore(user, allTraining, trainingCompletions, myAssignments),
    [user, allTraining, trainingCompletions, myAssignments]
  );

  // Bid Standing: unanswered/pending bids are neutral, not failures. Only rejected
  // bids reduce the percentage; withdrawn bids are excluded from the score.
  const bidStats = React.useMemo(
    () => calculateBidStanding(myBids, currentMonthStart, currentMonthEnd),
    [myBids, currentMonthStart, currentMonthEnd]
  );

  const qrPatrolStats = useMemo(
    () => calculateQrPatrol(timeEntries, qrScanEvents, allCheckpoints, currentMonthStart, currentMonthEnd),
    [timeEntries, qrScanEvents, allCheckpoints, currentMonthStart, currentMonthEnd]
  );
  const qrPatrolRate = qrPatrolStats.score;
  const clientFeedbackStats = useMemo(() => calculateClientFeedback(myClientFeedback, currentMonthStart, currentMonthEnd), [myClientFeedback, currentMonthStart, currentMonthEnd]);
  const supervisorRatingStats = useMemo(() => calculateSupervisorRating(myPerformanceReviews, currentMonthStart, currentMonthEnd), [myPerformanceReviews, currentMonthStart, currentMonthEnd]);
  const recognitionStats = useMemo(() => calculateRecognition(myCommendations, myClientFeedback, currentMonthStart, currentMonthEnd), [myCommendations, myClientFeedback, currentMonthStart, currentMonthEnd]);

  const overallPerformance = useMemo(() => buildOverallPerformance({
    punctuality: onTimeStats,
    trainingScore: trainingStats.total > 0 ? trainingStats.percentage : null,
    qrScore: qrPatrolRate,
    bidStanding: bidStats,
    clientFeedback: clientFeedbackStats,
    supervisorRating: supervisorRatingStats,
    recognition: recognitionStats,
  }), [onTimeStats, trainingStats, qrPatrolRate, bidStats, clientFeedbackStats, supervisorRatingStats, recognitionStats]);

  const performanceFactors = useMemo(() => {
    const factors = [];

    if (onTimeStats.total === 0) {
      factors.push({
        metric: 'On-Time Arrival',
        value: 'Not scored yet',
        severity: 'neutral',
        reason: 'No clock-in has been matched to a scheduled shift this month. This is not a deduction; there is simply no punctuality event to score yet.'
      });
    } else if (onTimeStats.late > 0) {
      const lateDetails = onTimeStats.details
        .filter(detail => detail.status === 'late')
        .map(detail => `${format(parseISO(detail.shift_date), 'MMM d')}: scheduled ${detail.scheduled_start}, clocked in ${detail.actual_clock_in} (${detail.minutes_late} min late)${detail.location ? ` at ${detail.location.split(':')[0]}` : ''}`);
      factors.push({
        metric: 'On-Time Arrival',
        value: `${onTimeStats.rate}%`,
        severity: 'negative',
        reason: `${onTimeStats.late} of ${onTimeStats.total} matched shift${onTimeStats.total === 1 ? '' : 's'} were clocked in more than 5 minutes after the scheduled start time.`,
        details: lateDetails
      });
    } else {
      factors.push({
        metric: 'On-Time Arrival',
        value: '100%',
        severity: 'positive',
        reason: `All ${onTimeStats.total} matched scheduled shift${onTimeStats.total === 1 ? '' : 's'} were on time within the 5-minute grace period.`
      });
    }

    if (trainingStats.total === 0) {
      factors.push({
        metric: 'Training Completion',
        value: 'Not scored yet',
        severity: 'neutral',
        reason: 'No training or compliance items are currently assigned, so this category is excluded from the overall score.'
      });
    } else if (trainingStats.pending > 0) {
      factors.push({
        metric: 'Training Completion',
        value: `${trainingStats.percentage}%`,
        severity: 'negative',
        reason: `${trainingStats.pending} assigned training/compliance item${trainingStats.pending === 1 ? ' is' : 's are'} still pending. Complete or obtain approval for those items to reach 100%.`,
        details: trainingStats.pendingNames
      });
    } else {
      factors.push({
        metric: 'Training Completion',
        value: '100%',
        severity: 'positive',
        reason: 'All assigned training and compliance items are complete.'
      });
    }

    if (qrPatrolStats.missedRounds > 0) {
      factors.push({
        metric: 'QR Patrol',
        value: `${qrPatrolRate}%`,
        severity: 'negative',
        reason: `${qrPatrolStats.missedRounds} required patrol round${qrPatrolStats.missedRounds === 1 ? ' was' : 's were'} missed out of ${qrPatrolStats.completedRounds + qrPatrolStats.missedRounds} evaluated rounds.`,
        details: [`${qrPatrolStats.completedRounds} completed round${qrPatrolStats.completedRounds === 1 ? '' : 's'}`, `${qrPatrolStats.missedRounds} missed round${qrPatrolStats.missedRounds === 1 ? '' : 's'}`]
      });
    } else if (qrPatrolStats.completedRounds > 0) {
      factors.push({
        metric: 'QR Patrol',
        value: 'No misses',
        severity: 'positive',
        reason: `All ${qrPatrolStats.completedRounds} evaluated patrol round${qrPatrolStats.completedRounds === 1 ? '' : 's'} were completed.`
      });
    }

    if (bidStats.rejected > 0) {
      const rejectedBidDetails = (myBids || []).filter(b => b.status === 'rejected').map(b => `${format(parseISO(b.created_date), 'MMM d')}: priority ${b.bid_priority || 1} bid was rejected`);
      factors.push({
        metric: 'Bid Standing',
        value: `${bidStats.score}%`,
        severity: 'negative',
        reason: `${bidStats.rejected} bid${bidStats.rejected === 1 ? ' was' : 's were'} rejected. Accepted and still-pending bids remain in good standing; unanswered bids are not treated as failures.`, 
        details: rejectedBidDetails
      });
    } else if (bidStats.accepted > 0) {
      factors.push({
        metric: 'Bid Standing',
        value: `${bidStats.score}%`,
        severity: 'positive',
        reason: `${bidStats.accepted} accepted and ${bidStats.pending} pending bid${bidStats.scoredTotal === 1 ? '' : 's'} are in good standing. Pending bids do not count against you.`
      });
    } else {
      factors.push({
        metric: 'Bid Standing',
        value: bidStats.score != null ? `${bidStats.score}%` : 'Not scored yet',
        severity: bidStats.score != null ? 'positive' : 'neutral',
        reason: bidStats.pending > 0 ? `${bidStats.pending} bid${bidStats.pending === 1 ? ' is' : 's are'} still pending. Because management has not answered them, they remain neutral/good standing and do not lower the score.` : 'No shift bids were submitted this month, so this category is not included in the overall score.'
      });
    }

    const monthlyCallOuts = (myCallOuts || []).filter(item => {
      const raw = item.call_out_date || item.created_date;
      if (!raw) return false;
      const date = format(parseISO(raw), 'yyyy-MM-dd');
      return date >= currentMonthStart && date <= currentMonthEnd;
    });
    if (monthlyCallOuts.length > 0) {
      factors.push({
        metric: 'Attendance Record',
        value: `${monthlyCallOuts.length} call-out${monthlyCallOuts.length === 1 ? '' : 's'}`,
        severity: 'negative',
        reason: `${monthlyCallOuts.length} attendance/call-out record${monthlyCallOuts.length === 1 ? ' is' : 's are'} recorded this month and shown as a performance factor.`
      });
    }

    const sustainedThisMonth = (myComplaints || []).filter(item => {
      if (item.exclude_from_performance_review === true || item.investigation_status !== 'sustained') return false;
      const raw = item.complaint_date || item.created_date;
      if (!raw) return false;
      const date = format(parseISO(raw), 'yyyy-MM-dd');
      return date >= currentMonthStart && date <= currentMonthEnd;
    });
    if (sustainedThisMonth.length > 0) {
      factors.push({
        metric: 'Complaint Record',
        value: `${sustainedThisMonth.length} sustained`,
        severity: 'negative',
        reason: `${sustainedThisMonth.length} sustained complaint${sustainedThisMonth.length === 1 ? ' is' : 's are'} included in performance review this month. Pending, unfounded, exonerated, or excluded complaints are not shown here as deductions.`
      });
    }

    if (clientFeedbackStats.count > 0) {
      factors.push({ metric: 'Client Feedback', value: `${clientFeedbackStats.score}%`, severity: clientFeedbackStats.score >= 80 ? 'positive' : 'negative', reason: `${clientFeedbackStats.count} client rating${clientFeedbackStats.count === 1 ? '' : 's'} average ${clientFeedbackStats.avgRating.toFixed(1)} of 5 stars.`, details: clientFeedbackStats.items.map(item => `${item.shift_date || 'Shift'} at ${String(item.location || '').split(':')[0]}: ${Number(item.rating).toFixed(1)}/5${item.comments ? ` — ${item.comments}` : ''}`) });
    }
    if (supervisorRatingStats.count > 0) {
      factors.push({ metric: 'Supervisor Rating', value: `${supervisorRatingStats.score}%`, severity: supervisorRatingStats.score >= 80 ? 'positive' : 'negative', reason: `${supervisorRatingStats.count} supervisor performance review${supervisorRatingStats.count === 1 ? '' : 's'} average ${supervisorRatingStats.avgRating.toFixed(1)} of 5.`, details: supervisorRatingStats.items.map(item => `${item.review_date}: ${Number(item.overall_rating).toFixed(1)}/5${item.reviewer_name ? ` by ${item.reviewer_name}` : ''}`) });
    }
    if (recognitionStats.count > 0) {
      factors.push({ metric: 'Recognition', value: 'Positive', severity: 'positive', reason: `${recognitionStats.count} commendation/positive client recognition record${recognitionStats.count === 1 ? '' : 's'} this month. Recognition contributes positively to the overall score; having none does not lower it.`, details: [...recognitionStats.commendations.map(item => `${item.commendation_type?.replaceAll('_', ' ') || 'Commendation'}: ${item.description}`), ...recognitionStats.positiveFeedback.map(item => `Client feedback ${Number(item.rating || 0).toFixed(1)}/5 at ${String(item.location || '').split(':')[0]}`)] });
    }

    return factors;
  }, [onTimeStats, trainingStats, qrPatrolStats, qrPatrolRate, bidStats, myBids, myCallOuts, myComplaints, allTraining, trainingCompletions, myAssignments, user, clientFeedbackStats, supervisorRatingStats, recognitionStats, currentMonthStart, currentMonthEnd]);

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
    const [sh = 0, sm = 0] = String(start || '00:00').split(':').map(Number);
    const [eh = 0, em = 0] = String(end || '00:00').split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) endMinutes += 1440;
    return Math.max(0, (endMinutes - startMinutes) / 60);
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

        {performanceLoading && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Loading your performance records…</div>
        )}
        {performanceError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Performance data could not be loaded: {performanceError.message}</div>
        )}
        {!performanceLoading && !performanceError && performanceData.meta && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Loaded {performanceData.meta.timeEntries || 0} time entries, {performanceData.meta.schedules || 0} schedules, {performanceData.meta.trainingAssignments || 0} training assignments, and {performanceData.meta.qrScans || 0} QR scans for your account.
          </div>
        )}

        <Card className="overflow-hidden border border-blue-200 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Overall Performance Score</span>
              <span className="text-4xl font-black">{overallPerformance.score !== null ? `${overallPerformance.score}%` : '—'}</span>
            </CardTitle>
            <p className="text-xs text-blue-100">Equal average of every scored category that currently has enough data. Categories with no scored events are excluded instead of being counted as 0%.</p>
          </CardHeader>
          <CardContent className="p-4">
            {overallPerformance.categories.length > 0 ? (
              <div className="space-y-2">
                {overallPerformance.categories.map(category => (
                  <div key={category.label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-700">{category.label}</span>
                    <span className="font-bold text-slate-900">{category.score}%</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-slate-500">Formula: ({overallPerformance.categories.map(category => `${category.score}%`).join(' + ')}) ÷ {overallPerformance.categories.length} = {overallPerformance.score}%</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No scored performance categories have enough data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-3 sm:p-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600 sm:text-3xl">{onTimeStats.total > 0 ? `${onTimeStats.rate}%` : '—'}</p>
              <p className="text-xs font-semibold text-slate-700">On-Time Arrival</p>
              <p className="mt-1 text-[11px] text-slate-600">
                {onTimeStats.total > 0 ? `${onTimeStats.onTime} on time • ${onTimeStats.late} late • ${onTimeStats.total} matched shifts` : 'No matched scheduled clock-ins yet'}
              </p>
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
              <p className="text-2xl font-bold text-purple-600 sm:text-3xl">{trainingStats.percentage != null ? `${trainingStats.percentage}%` : '—'}</p>
              <p className="text-xs font-semibold text-slate-700">Training Completion</p>
              <p className="mt-1 text-[11px] text-slate-600">{trainingStats.total > 0 ? `${trainingStats.completed} complete • ${trainingStats.pending} pending • ${trainingStats.total} assigned` : 'Not scored — nothing assigned'}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
            <CardContent className="p-3 sm:p-4">
              <Star className="w-6 h-6 text-amber-600 mb-2" />
              <p className="text-2xl font-bold text-amber-600 sm:text-3xl">{bidStats.score != null ? `${bidStats.score}%` : '—'}</p>
              <p className="text-xs font-semibold text-slate-700">Bid Standing</p>
              <p className="mt-1 text-[11px] text-slate-600">{bidStats.accepted} accepted • {bidStats.pending} pending • {bidStats.rejected} rejected</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border border-blue-200 bg-blue-50 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Client Feedback</p>
              <p className="mt-1 text-2xl font-bold text-blue-900">{clientFeedbackStats.score != null ? `${clientFeedbackStats.score}%` : '—'}</p>
              <p className="text-xs text-slate-600">{clientFeedbackStats.count > 0 ? `${clientFeedbackStats.avgRating.toFixed(1)}/5 average from ${clientFeedbackStats.count} rating${clientFeedbackStats.count === 1 ? '' : 's'}` : 'No client ratings this month'}</p>
            </CardContent>
          </Card>
          <Card className="border border-violet-200 bg-violet-50 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Supervisor Rating</p>
              <p className="mt-1 text-2xl font-bold text-violet-900">{supervisorRatingStats.score != null ? `${supervisorRatingStats.score}%` : '—'}</p>
              <p className="text-xs text-slate-600">{supervisorRatingStats.count > 0 ? `${supervisorRatingStats.avgRating.toFixed(1)}/5 average from ${supervisorRatingStats.count} review${supervisorRatingStats.count === 1 ? '' : 's'}` : 'No supervisor review this month'}</p>
            </CardContent>
          </Card>
          <Card className="border border-emerald-200 bg-emerald-50 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Recognition</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{recognitionStats.count}</p>
              <p className="text-xs text-slate-600">{recognitionStats.count > 0 ? `${recognitionStats.commendations.length} commendation${recognitionStats.commendations.length === 1 ? '' : 's'} • ${recognitionStats.positiveFeedback.length} positive client recognition` : 'No recognition records this month — no penalty'}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border border-slate-200 shadow-lg">
          <CardHeader className="bg-slate-900 text-white">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                What’s Affecting My Performance?
              </span>
              <Badge className="bg-blue-600 text-white">Exact reasons</Badge>
            </CardTitle>
            <p className="text-xs text-slate-300">These are the records that explain each performance metric. New shift notices, messages, announcements, and routine alerts do not lower your performance numbers.</p>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {performanceFactors.map((factor, index) => (
              <div key={`${factor.metric}-${index}`} className={`rounded-lg border p-3 ${factor.severity === 'negative' ? 'border-red-200 bg-red-50' : factor.severity === 'positive' ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{factor.metric}</p>
                  <Badge className={factor.severity === 'negative' ? 'bg-red-600 text-white' : factor.severity === 'positive' ? 'bg-green-600 text-white' : 'bg-slate-600 text-white'}>{factor.value}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-700">{factor.reason}</p>
                {factor.details?.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                    {factor.details.map((detail, detailIndex) => (
                      <p key={detailIndex} className="text-xs font-medium text-slate-700">• {detail}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

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
                  <Badge className="ml-2 bg-slate-600 text-white">Informational only</Badge>
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
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-slate-400">{format(parseISO(n.created_date), 'MMM d, h:mm a')}</p>
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">No performance impact</span>
                            </div>
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