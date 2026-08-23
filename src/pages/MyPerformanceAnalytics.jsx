import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  BarChart3, Clock, CheckCircle2, Award, Calendar, Star, AlertTriangle,
  MapPin, ChevronRight, GraduationCap, UserX
} from "lucide-react";
import { format, parseISO, addDays, startOfWeek, isToday, isTomorrow, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculatePunctuality, calculateBidStanding, calculateTrainingScore, calculateCallOutAttendance, calculateClientFeedback, calculateSupervisorRating, calculateRecognition, buildOverallPerformance } from '@/lib/performanceScoring';

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
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: performanceData = {}, isLoading: performanceLoading, error: performanceError } = useQuery({
    queryKey: ['myPerformanceData', user?.email],
    queryFn: async () => {
      const result = await base44.functions.invoke('getMyPerformanceData', {});
      let payload = result?.data || result || {};
      if (!Array.isArray(payload.timeEntries) && payload?.data && typeof payload.data === 'object') payload = payload.data;
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user?.email,
    staleTime: 60000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    // This backend joins many performance sources in one call. Refresh on page
    // entry/focus instead of re-running the full aggregation every 30 seconds.
    refetchInterval: false,
  });

  const timeEntries = performanceData.timeEntries || [];
  const schedules = performanceData.schedules || [];
  const myBids = performanceData.bids || [];
  const trainingCompletions = performanceData.trainingCompletions || [];
  const allTraining = performanceData.trainingModules || [];
  const myAssignments = performanceData.trainingAssignments || [];
  const myCallOuts = performanceData.callOuts || [];
  const myComplaints = performanceData.complaints || [];
  const myCommendations = performanceData.commendations || [];
  const myClientFeedback = performanceData.clientFeedback || [];
  const myPerformanceReviews = performanceData.performanceReviews || [];

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

  // Punctuality is calculated in Eastern Time and each punch is matched to the
  // correct scheduled shift window, not simply the first shift on the same date.
  const onTimeStats = React.useMemo(
    () => calculatePunctuality(timeEntries, schedules, currentMonthStart, currentMonthEnd, performanceData.incidents || [], user),
    [timeEntries, schedules, currentMonthStart, currentMonthEnd, performanceData.incidents, user]
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

  const clientFeedbackStats = useMemo(() => calculateClientFeedback(myClientFeedback, currentMonthStart, currentMonthEnd), [myClientFeedback, currentMonthStart, currentMonthEnd]);
  const supervisorRatingStats = useMemo(() => calculateSupervisorRating(myPerformanceReviews, currentMonthStart, currentMonthEnd), [myPerformanceReviews, currentMonthStart, currentMonthEnd]);
  const recognitionStats = useMemo(() => calculateRecognition(myCommendations, myClientFeedback, currentMonthStart, currentMonthEnd), [myCommendations, myClientFeedback, currentMonthStart, currentMonthEnd]);
  const callOutAttendance = useMemo(() => calculateCallOutAttendance(myCallOuts, schedules, currentMonthStart, currentMonthEnd), [myCallOuts, schedules, currentMonthStart, currentMonthEnd]);

  const overallPerformance = useMemo(() => buildOverallPerformance({
    punctuality: onTimeStats,
    trainingScore: trainingStats.total > 0 ? trainingStats.percentage : null,
    jobDuty: null,
    callOutAttendance,
    bidStanding: bidStats,
    clientFeedback: clientFeedbackStats,
    supervisorRating: supervisorRatingStats,
    recognition: recognitionStats,
  }), [onTimeStats, trainingStats, callOutAttendance, bidStats, clientFeedbackStats, supervisorRatingStats, recognitionStats]);

  const performanceFactors = useMemo(() => {
    const factors = [];

    if (onTimeStats.total > 0 && (onTimeStats.late > 0 || onTimeStats.missed > 0)) {
      const problemDetails = onTimeStats.details
        .filter(detail => ['late', 'missed', 'time_window_violation'].includes(detail.status))
        .map(detail => {
          if (detail.status === 'missed') return `${format(parseISO(detail.shift_date), 'MMM d')}: scheduled ${detail.scheduled_start}${detail.location ? ` at ${detail.location.split(':')[0]}` : ''} — no clock-in was recorded.`;
          const issues = [];
          if (detail.minutes_late > 5) issues.push(`${detail.minutes_late} min late arriving`);

          return `${format(parseISO(detail.shift_date), 'MMM d')}: ${issues.join('; ')}${detail.location ? ` at ${detail.location.split(':')[0]}` : ''}.`;
        });
      factors.push({
        metric: 'On-Time Arrival',
        value: `${onTimeStats.rate}%`,
        severity: 'negative',
        reason: `${onTimeStats.onTime} on-time arrival${onTimeStats.onTime === 1 ? '' : 's'}, ${onTimeStats.late} late arrival${onTimeStats.late === 1 ? '' : 's'}, and ${onTimeStats.missed || 0} missed/no-clock-in across ${onTimeStats.total} elapsed scheduled shift${onTimeStats.total === 1 ? '' : 's'}. Early clock-ins and late clock-outs are neutral for this metric.`, 
        details: problemDetails
      });
    } else if (onTimeStats.total > 0) {
      factors.push({
        metric: 'On-Time Arrival',
        value: '100%',
        severity: 'positive',
        reason: `All ${onTimeStats.total} matched scheduled shift${onTimeStats.total === 1 ? '' : 's'} met the 5-minute arrival grace period. Early clock-ins and late clock-outs do not reduce On-Time Arrival.`
      });
    }

    if (trainingStats.total > 0 && trainingStats.pending > 0) {
      factors.push({
        metric: 'Training Completion',
        value: `${trainingStats.percentage}%`,
        severity: 'negative',
        reason: `${trainingStats.pending} assigned training/compliance item${trainingStats.pending === 1 ? ' is' : 's are'} still pending. Complete or obtain approval for those items to reach 100%.`,
        details: trainingStats.pendingNames
      });
    } else if (trainingStats.total > 0) {
      factors.push({
        metric: 'Training Completion',
        value: '100%',
        severity: 'positive',
        reason: 'All assigned training and compliance items are complete.'
      });
    }

    if (bidStats.accepted > 0) {
      factors.push({
        metric: 'Bid Standing',
        value: `${bidStats.score}%`,
        severity: 'positive',
        reason: `${bidStats.accepted} bid${bidStats.accepted === 1 ? '' : 's'} resulted in an assigned shift. Pending bids and bids not selected by management do not affect your performance grade.`
      });
    }

    if (callOutAttendance.score != null) factors.push({
      metric: 'Call-Out Attendance',
      value: `${callOutAttendance.score}%`,
      severity: callOutAttendance.count > 0 ? 'negative' : 'positive',
      reason: callOutAttendance.count > 0
        ? `${callOutAttendance.count} officer call-out${callOutAttendance.count === 1 ? '' : 's'} across ${callOutAttendance.scheduled} elapsed scheduled shift${callOutAttendance.scheduled === 1 ? '' : 's'}. Sent-home and reassignment records do not lower this attendance score.`
        : `No officer call-outs across ${callOutAttendance.scheduled} elapsed scheduled shift${callOutAttendance.scheduled === 1 ? '' : 's'}.`
    });

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
  }, [onTimeStats, trainingStats, bidStats, myCallOuts, myComplaints, clientFeedbackStats, supervisorRatingStats, recognitionStats, callOutAttendance, currentMonthStart, currentMonthEnd]);

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
            <p className="text-xs text-blue-100">Performance uses actual attendance and documented evaluation records. DAR, incident-report, and QR requirements are not used as performance deductions. Metrics with no real record are omitted instead of being shown as a false score.</p>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm text-slate-600">
              {overallPerformance.categories.length > 0
                ? `${overallPerformance.categories.length} performance metric${overallPerformance.categories.length === 1 ? '' : 's'} currently contribute to this score.`
                : 'No performance metrics have enough data to calculate a grade yet.'}
            </p>
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
                {onTimeStats.total > 0 ? `${onTimeStats.onTime} compliant • ${onTimeStats.late} time violations • ${onTimeStats.missed || 0} missed • ${onTimeStats.total} elapsed shifts` : 'No elapsed scheduled shifts yet'}
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

          {trainingStats.total > 0 && (
            <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-violet-100">
              <CardContent className="p-3 sm:p-4">
                <Award className="w-6 h-6 text-purple-600 mb-2" />
                <p className="text-2xl font-bold text-purple-600 sm:text-3xl">{trainingStats.percentage}%</p>
                <p className="text-xs font-semibold text-slate-700">Training Completion</p>
                <p className="mt-1 text-[11px] text-slate-600">{trainingStats.completed} complete • {trainingStats.pending} pending • {trainingStats.total} assigned</p>
              </CardContent>
            </Card>
          )}

          {bidStats.score != null && (
            <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
              <CardContent className="p-3 sm:p-4">
                <Star className="w-6 h-6 text-amber-600 mb-2" />
                <p className="text-2xl font-bold text-amber-600 sm:text-3xl">{bidStats.score}%</p>
                <p className="text-xs font-semibold text-slate-700">Bid Standing</p>
                <p className="mt-1 text-[11px] text-slate-600">{bidStats.accepted} assigned shift bid{bidStats.accepted === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {callOutAttendance.score != null && (
            <Card className="border border-rose-200 bg-rose-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Call-Out Attendance</p>
                <p className="mt-1 text-2xl font-bold text-rose-900">{callOutAttendance.score}%</p>
                <p className="text-xs text-slate-600">{callOutAttendance.count > 0 ? `${callOutAttendance.count} officer call-out${callOutAttendance.count === 1 ? '' : 's'} across ${callOutAttendance.scheduled} elapsed scheduled shifts` : `0 call-outs across ${callOutAttendance.scheduled} elapsed scheduled shifts`}</p>
              </CardContent>
            </Card>
          )}
          {clientFeedbackStats.score != null && (
            <Card className="border border-blue-200 bg-blue-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Client Feedback</p>
                <p className="mt-1 text-2xl font-bold text-blue-900">{clientFeedbackStats.score}%</p>
                <p className="text-xs text-slate-600">{clientFeedbackStats.avgRating.toFixed(1)}/5 average from {clientFeedbackStats.count} rating{clientFeedbackStats.count === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
          )}
          {supervisorRatingStats.score != null && (
            <Card className="border border-violet-200 bg-violet-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Supervisor Rating</p>
                <p className="mt-1 text-2xl font-bold text-violet-900">{supervisorRatingStats.score}%</p>
                <p className="text-xs text-slate-600">{supervisorRatingStats.avgRating.toFixed(1)}/5 average from {supervisorRatingStats.count} review{supervisorRatingStats.count === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
          )}
          {recognitionStats.score != null && (
            <Card className="border border-emerald-200 bg-emerald-50 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Recognition</p>
                <p className="mt-1 text-2xl font-bold text-emerald-900">{recognitionStats.score}%</p>
                <p className="text-xs text-slate-600">{recognitionStats.commendations.length} commendation{recognitionStats.commendations.length === 1 ? '' : 's'} • {recognitionStats.positiveFeedback.length} positive client recognition</p>
              </CardContent>
            </Card>
          )}
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

        <div>
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
                        { name: 'Violation / Missed', value: onTimeStats.late + (onTimeStats.missed || 0) },
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
                  <span>Time violations: {onTimeStats.late} • Missed: {onTimeStats.missed || 0}</span>
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