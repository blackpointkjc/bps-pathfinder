import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, Users, Clock, AlertTriangle, 
  CheckCircle2, Award, Shield, Send, Loader2, MailCheck, X
} from "lucide-react";
import { format, parseISO, differenceInMinutes, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import MissingReportsCheck from "../components/MissingReportsCheck";
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { calculatePunctuality, calculateBidStanding, calculateTrainingScore, calculateCallOutAttendance, calculateClientFeedback, calculateSupervisorRating, calculateRecognition, calculateJobDutyCompliance, buildOverallPerformance } from '@/lib/performanceScoring';
import { toast } from 'sonner';

const emailKey = (value) => String(value || '').trim().toLowerCase();
const isPunctualityLeaderboardOfficer = (officer) => {
  const roles = new Set((officer?.additional_roles || []).map(role => String(role).trim().toLowerCase()));
  if (officer?.is_supervisor === true || roles.has('supervisor')) return false;
  return roles.has('officer') || String(officer?.role || '').trim().toLowerCase() === 'officer';
};

function breakMinutes(entry) {
  return (entry?.break_periods || []).reduce((total, period) => {
    const start = period?.start ? new Date(period.start).getTime() : NaN;
    const end = period?.end ? new Date(period.end).getTime() : NaN;
    return total + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : 0);
  }, 0);
}

export default function AdminAnalytics() {
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summarySending, setSummarySending] = useState(false);
  const [summaryResult, setSummaryResult] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const sendCompanySummaryNow = async () => {
    setSummarySending(true);
    setSummaryResult(null);
    try {
      const result = await base44.functions.invoke('sendDailyCompanySummary', { action: 'send_now' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      setSummaryResult(payload);
      if (payload.email_sent) {
        toast.success(`Company summary sent from management@blackpointkjc.com to ${payload.recipient_count || 0} active company member${payload.recipient_count === 1 ? '' : 's'}.`);
      } else {
        toast.warning('In-app summaries were created, but the management@blackpointkjc.com Outlook delivery needs attention.');
      }
    } catch (error) {
      toast.error(error?.message || 'Company summary could not be sent.');
      setSummaryResult({ success: false, email_sent: false, error: error?.message || 'Delivery failed.' });
    } finally {
      setSummarySending(false);
    }
  };

  const { data: analyticsData = {}, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['companyAnalyticsData'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getCompanyAnalyticsData', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const allUsers = analyticsData.users || [];
  const divisions = analyticsData.divisions || [];
  const timeEntries = analyticsData.timeEntries || [];
  const schedules = analyticsData.schedules || [];
  const allBids = analyticsData.bids || [];
  const trainingCompletions = analyticsData.trainingCompletions || [];
  const trainingAssignments = analyticsData.trainingAssignments || [];
  const allTraining = (analyticsData.trainingModules || []).filter(module => module.active !== false);
  const allQrScans = analyticsData.qrScans || [];
  const allQrCheckpoints = analyticsData.qrCheckpoints || [];
  const incidentReports = analyticsData.incidentReports || [];
  const callsForService = analyticsData.callsForService || [];
  const dispatchCalls = analyticsData.dispatchCalls || [];
  const allCommendations = analyticsData.commendations || [];
  const allComplaints = analyticsData.complaints || [];
  const allDailyActivityReports = analyticsData.dailyActivityReports || [];
  const allCallOuts = analyticsData.callOuts || [];
  const allDutyRules = analyticsData.dutyRules || [];
  const allLocations = analyticsData.locations || [];
  const allClientFeedback = analyticsData.clientFeedback || [];
  const allPerformanceReviews = analyticsData.performanceReviews || [];

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    // Company officer rankings must contain actual operational officers only.
    // A dispatch/HR/accounting/support account is not promoted into the officer
    // leaderboard merely because an old time, schedule, or training row exists.
    const active = allUsers.filter(isOperationalOfficer);
    if (selectedDivision === 'all') return active;
    return active.filter(u => String(u.division || '') === String(selectedDivision));
  }, [allUsers, selectedDivision]);

  const currentMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const companyOnTimeStats = useMemo(() => {
    // Company-wide On-Time Rate must include every operational officer in the
    // selected company/division. The separate leaderboard can exclude supervisors,
    // but that exclusion must never zero-out the company KPI.
    const byOfficer = filteredUsers.map(officer => {
      const key = emailKey(officer.email);
      const stats = calculatePunctuality(
        timeEntries.filter(entry => emailKey(entry.officer_email) === key),
        schedules.filter(schedule => emailKey(schedule.officer_email) === key),
        currentMonthStart,
        currentMonthEnd,
        incidentReports,
        officer
      );
      return { name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email, email: officer.email, ...stats };
    }).filter(item => item.total > 0).sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const totalOnTime = byOfficer.reduce((sum, item) => sum + item.onTime, 0);
    const totalEntries = byOfficer.reduce((sum, item) => sum + item.total, 0);
    const leaderboard = byOfficer.filter(item => {
      const officer = filteredUsers.find(user => emailKey(user.email) === emailKey(item.email));
      return officer && isPunctualityLeaderboardOfficer(officer);
    }).slice(0, 3);
    return { rate: totalEntries ? Math.round((totalOnTime / totalEntries) * 100) : null, byOfficer, leaderboard };
  }, [timeEntries, schedules, incidentReports, filteredUsers, currentMonthStart, currentMonthEnd]);

  const hoursBreakdown = useMemo(() => {
    if (!timeEntries || !filteredUsers) return [];

    // Use current month instead of payroll period
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerHours = {};

    filteredUsers.forEach(officer => {
      officerHours[emailKey(officer.email)] = { 
        name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
        regular: 0,
        overtime: 0,
        weeks: {}
      };
    });

    // Calculate hours from actual completed time entries, deducting recorded breaks.
    timeEntries.forEach(entry => {
      const key = emailKey(entry.officer_email);
      if (!entry.clock_in || !entry.clock_out || !officerHours[key]) return;
      
      const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      if (clockInDate < monthStart || clockInDate > monthEnd) return;

      const clockIn = parseISO(entry.clock_in);
      const clockOut = parseISO(entry.clock_out);
      const hours = Math.max(0, (differenceInMinutes(clockOut, clockIn) - breakMinutes(entry)) / 60);

      // Calculate week key (Friday start)
      const date = parseISO(clockInDate);
      const dayOfWeek = date.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      const weekKey = format(weekStart, 'yyyy-MM-dd');

      if (!officerHours[key].weeks[weekKey]) {
        officerHours[key].weeks[weekKey] = 0;
      }
      officerHours[key].weeks[weekKey] += hours;
    });

    // Calculate regular and overtime per week
    Object.keys(officerHours).forEach(email => {
      Object.values(officerHours[email].weeks).forEach(weekHours => {
        if (weekHours > 40) {
          officerHours[email].regular += 40;
          officerHours[email].overtime += weekHours - 40;
        } else {
          officerHours[email].regular += weekHours;
        }
      });
    });

    return Object.entries(officerHours)
      .map(([email, data]) => ({
        name: data.name,
        email,
        regular: Math.round(data.regular * 10) / 10,
        overtime: Math.round(data.overtime * 10) / 10,
        total: Math.round((data.regular + data.overtime) * 10) / 10
      }))
      .filter(o => o.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [timeEntries, filteredUsers]);

  const trainingByOfficer = useMemo(() => {
    if (!trainingCompletions || !allTraining || !filteredUsers) return [];

    // Get all required training modules
    const requiredTraining = allTraining.filter(t => t.required);

    return filteredUsers
      .map(officer => {
        // Check assigned training based on email, division, or rank
        const assignedTraining = allTraining.filter(t => 
          (t.assigned_to || []).some(email => emailKey(email) === emailKey(officer.email)) ||
          (t.assigned_divisions || []).includes(officer.division) ||
          (t.assigned_ranks || []).includes(officer.rank) ||
          t.required
        );

        // If no training is assigned to this officer, they still need to do required training
        const trainingToCheck = assignedTraining.length > 0 ? assignedTraining : requiredTraining;

        if (trainingToCheck.length === 0) return null;

        const completedIds = trainingCompletions
          .filter(tc => emailKey(tc.officer_email) === emailKey(officer.email) && tc.completed)
          .map(tc => tc.training_module_id);
        
        const completed = trainingToCheck.filter(t => completedIds.includes(t.id)).length;
        const percentage = trainingToCheck.length > 0 ? Math.round((completed / trainingToCheck.length) * 100) : 100;

        return {
          name: `${officer.first_name} ${officer.last_name}`,
          email: officer.email,
          completed,
          total: trainingToCheck.length,
          percentage,
          pending: trainingToCheck.filter(t => !completedIds.includes(t.id)).map(t => t.title)
        };
      })
      .filter(o => o !== null && o.total > 0 && o.percentage < 100)
      .sort((a, b) => a.percentage - b.percentage);
  }, [trainingCompletions, allTraining, filteredUsers]);

  const overallByOfficer = useMemo(() => filteredUsers.map(officer => {
    const key = emailKey(officer.email);
    const officerTimeEntries = timeEntries.filter(item => emailKey(item.officer_email) === key);
    const officerSchedules = schedules.filter(item => emailKey(item.officer_email) === key);
    const officerBids = allBids.filter(item => emailKey(item.officer_email) === key);
    const officerCompletions = trainingCompletions.filter(item => emailKey(item.officer_email) === key);
    const officerAssignments = trainingAssignments.filter(item => emailKey(item.officer_email) === key);
    const officerFeedback = allClientFeedback.filter(item => emailKey(item.officer_email) === key);
    const officerReviews = allPerformanceReviews.filter(item => emailKey(item.officer_email) === key);
    const officerCommendations = allCommendations.filter(item => emailKey(item.officer_email) === key);

    const punctuality = calculatePunctuality(officerTimeEntries, officerSchedules, currentMonthStart, currentMonthEnd, incidentReports, officer);
    const training = calculateTrainingScore(officer, allTraining, officerCompletions, officerAssignments);
    const bidStanding = calculateBidStanding(officerBids, currentMonthStart, currentMonthEnd);
    const clientFeedback = calculateClientFeedback(officerFeedback, currentMonthStart, currentMonthEnd);
    const supervisorRating = calculateSupervisorRating(officerReviews, currentMonthStart, currentMonthEnd);
    const recognition = calculateRecognition(officerCommendations, officerFeedback, currentMonthStart, currentMonthEnd);
    const officerCallOuts = allCallOuts.filter(item => emailKey(item.officer_email) === key);
    const callOutAttendance = calculateCallOutAttendance(officerCallOuts, officerSchedules, currentMonthStart, currentMonthEnd);
    const jobDuty = calculateJobDutyCompliance({
      officer,
      timeEntries: officerTimeEntries,
      dailyReports: allDailyActivityReports,
      incidentReports,
      dispatchCalls,
      callOuts: allCallOuts,
      qrScans: allQrScans,
      allTimeEntries: timeEntries,
      qrCheckpoints: allQrCheckpoints,
      dutyRules: allDutyRules,
      locations: allLocations,
      monthStart: currentMonthStart,
      monthEnd: currentMonthEnd,
    });
    const overall = buildOverallPerformance({ punctuality, trainingScore: training.total > 0 ? training.percentage : null, jobDuty, callOutAttendance, bidStanding, clientFeedback, supervisorRating, recognition });

    return {
      email: officer.email,
      name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
      overall,
      punctuality,
      training,
      bidStanding,
      clientFeedback,
      supervisorRating,
      recognition,
      callOutAttendance,
      jobDuty,
    };
  }).sort((a, b) => (b.overall.score ?? -1) - (a.overall.score ?? -1)), [filteredUsers, timeEntries, schedules, allBids, trainingCompletions, trainingAssignments, allTraining, allClientFeedback, allPerformanceReviews, allCommendations, incidentReports, dispatchCalls, allCallOuts, allDailyActivityReports, allQrScans, allQrCheckpoints, allDutyRules, allLocations, currentMonthStart, currentMonthEnd]);

  const companyOverallScore = useMemo(() => {
    const scored = overallByOfficer.filter(item => item.overall.score != null);
    return scored.length ? Math.round(scored.reduce((sum, item) => sum + item.overall.score, 0) / scored.length) : null;
  }, [overallByOfficer]);

  const responseTimeStats = useMemo(() => {
    const responseTimes = dispatchCalls
      .filter(call => call.time_received && call.time_on_scene)
      .map(call => differenceInMinutes(parseISO(call.time_on_scene), parseISO(call.time_received)))
      .filter(minutes => Number.isFinite(minutes) && minutes >= 0 && minutes <= 240);

    const avg = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, minutes) => sum + minutes, 0) / responseTimes.length)
      : 0;

    return { avg, total: responseTimes.length };
  }, [dispatchCalls]);

  const commendationStats = useMemo(() => {
    if (!allCommendations || !filteredUsers) return { byOfficer: [], total: 0 };

    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerCommendations = {};

    filteredUsers.forEach(officer => {
      officerCommendations[emailKey(officer.email)] = {
        name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
        count: 0,
        points: 0
      };
    });

    allCommendations.forEach(comm => {
      const key = emailKey(comm.officer_email);
      if (!officerCommendations[key]) return;
      const commDate = format(parseISO(comm.commendation_date), 'yyyy-MM-dd');
      if (commDate >= monthStart && commDate <= monthEnd) {
        officerCommendations[key].count++;
        officerCommendations[key].points += comm.points_awarded || 1;
      }
    });

    const byOfficer = Object.entries(officerCommendations)
      .filter(([_, stats]) => stats.count > 0)
      .map(([email, stats]) => ({ email, ...stats }))
      .sort((a, b) => b.points - a.points);

    return { byOfficer, total: byOfficer.reduce((sum, o) => sum + o.count, 0) };
  }, [allCommendations, filteredUsers]);

  const complaintStats = useMemo(() => {
    if (!allComplaints || !filteredUsers) return { byOfficer: [], total: 0, pending: 0 };

    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerComplaints = {};

    filteredUsers.forEach(officer => {
      officerComplaints[emailKey(officer.email)] = {
        name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
        count: 0,
        sustained: 0
      };
    });

    let pending = 0;

    allComplaints.forEach(comp => {
      const key = emailKey(comp.officer_email);
      if (!officerComplaints[key]) return;
      const compDate = format(parseISO(comp.complaint_date), 'yyyy-MM-dd');
      if (compDate >= monthStart && compDate <= monthEnd) {
        officerComplaints[key].count++;
        if (comp.investigation_status === 'sustained') {
          officerComplaints[key].sustained++;
        }
        if (comp.investigation_status === 'pending' || comp.investigation_status === 'under_investigation') {
          pending++;
        }
      }
    });

    const byOfficer = Object.entries(officerComplaints)
      .filter(([_, stats]) => stats.count > 0)
      .map(([email, stats]) => ({ email, ...stats }))
      .sort((a, b) => b.count - a.count);

    return { byOfficer, total: byOfficer.reduce((sum, o) => sum + o.count, 0), pending };
  }, [allComplaints, filteredUsers]);

  if (!user || analyticsLoading) {
    return <div className="min-h-screen bg-slate-950 p-8 text-slate-300">Loading company analytics…</div>;
  }

  if (analyticsError) {
    return <div className="min-h-screen bg-slate-950 p-8 text-red-300">Company analytics could not load: {analyticsError.message}</div>;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-white">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Company Analytics
            </h1>
            <p className="text-slate-400">Performance metrics across all officers</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => { setSummaryResult(null); setShowSummaryDialog(true); }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-black text-slate-950 shadow-lg shadow-amber-950/20 transition hover:from-amber-400 hover:to-yellow-400 sm:flex-none"
            >
              <Send className="h-4 w-4" />
              Send Company Summary
            </button>
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
              <SelectTrigger className="min-h-11 flex-1 border-slate-700 bg-slate-900 sm:w-48 sm:flex-none">
                <SelectValue placeholder="All Divisions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions?.map(d => (
                  <SelectItem key={d.id} value={d.division_name}>{d.division_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{companyOnTimeStats.rate != null ? `${companyOnTimeStats.rate}%` : '—'}</p>
              <p className="text-xs text-slate-400">On-Time Rate</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <BarChart3 className="w-6 h-6 text-cyan-500 mb-2" />
              <p className="text-2xl font-bold text-cyan-400">{companyOverallScore != null ? `${companyOverallScore}%` : '—'}</p>
              <p className="text-xs text-slate-400">Overall Performance</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <Users className="w-6 h-6 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-blue-600">{filteredUsers.length}</p>
              <p className="text-xs text-slate-400">Active Officers</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <Award className="w-6 h-6 text-purple-600 mb-2" />
              <p className="text-2xl font-bold text-purple-600">
                {trainingByOfficer.length}
              </p>
              <p className="text-xs text-slate-400">Need Training</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <Clock className="w-6 h-6 text-amber-600 mb-2" />
              <p className="text-2xl font-bold text-amber-600">{responseTimeStats.avg || 0}m</p>
              <p className="text-xs text-slate-400">Avg Response</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <AlertTriangle className="w-6 h-6 text-red-600 mb-2" />
              <p className="text-2xl font-bold text-red-600">
                {(hoursBreakdown?.reduce((sum, o) => sum + (o.overtime || 0), 0) || 0).toFixed(1)}h
              </p>
              <p className="text-xs text-slate-400">Total OT</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <Award className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{commendationStats.total || 0}</p>
              <p className="text-xs text-slate-400">Commendations</p>
            </CardContent>
          </Card>
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <AlertTriangle className="w-6 h-6 text-rose-600 mb-2" />
              <p className="text-2xl font-bold text-rose-600">{complaintStats.total || 0}</p>
              <p className="text-xs text-slate-400">Complaints</p>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Officer Overall Performance — Current Month
            </CardTitle>
            <p className="text-xs text-slate-400">Uses the same scoring engine as Officer My Performance. A metric with no real record is omitted and the remaining configured weights are normalized; missing data is never displayed as a made-up 100%.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overallByOfficer.map(officer => (
                <div key={officer.email} className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{officer.name}</p>
                      <p className="text-xs text-slate-400">{officer.email}</p>
                    </div>
                    <Badge className={officer.overall.score == null ? 'bg-slate-600' : officer.overall.score >= 90 ? 'bg-green-600' : officer.overall.score >= 75 ? 'bg-amber-600' : 'bg-red-600'}>
                      {officer.overall.score != null ? `${officer.overall.score}%` : 'Not scored'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {officer.overall.categories.map(category => (
                      <span key={category.label} className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                        {category.label}: <strong>{category.score}%</strong>
                      </span>
                    ))}
                    {officer.overall.categories.length === 0 && <span className="text-xs text-slate-500">No scoreable records this month.</span>}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">DAR:</span> {officer.jobDuty.dailyActivity.score != null ? `${officer.jobDuty.dailyActivity.score}%` : '—'} <span className="text-slate-500">({officer.jobDuty.dailyActivity.completed}/{officer.jobDuty.dailyActivity.required})</span>
                    </div>
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">Incident:</span> {officer.jobDuty.incidentReports.score != null ? `${officer.jobDuty.incidentReports.score}%` : '—'} <span className="text-slate-500">({officer.jobDuty.incidentReports.completed}/{officer.jobDuty.incidentReports.required})</span>
                    </div>
                    <div className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-2 text-xs text-slate-300">
                      <span className="font-bold text-white">QR:</span> {officer.jobDuty.qrCompliance.score != null ? `${officer.jobDuty.qrCompliance.score}%` : '—'} <span className="text-slate-500">({officer.jobDuty.qrCompliance.completed}/{officer.jobDuty.qrCompliance.required})</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                    {officer.callOutAttendance.score != null && <span>Call-Out Attendance: {officer.callOutAttendance.score}% ({officer.callOutAttendance.count} call-out{officer.callOutAttendance.count === 1 ? '' : 's'})</span>}
                    {officer.bidStanding.score != null && <span>Bid Standing: {officer.bidStanding.score}% ({officer.bidStanding.accepted} assigned bid{officer.bidStanding.accepted === 1 ? '' : 's'})</span>}
                    {officer.clientFeedback.score != null && <span>Client Feedback: {officer.clientFeedback.score}% ({officer.clientFeedback.avgRating.toFixed(1)}/5)</span>}
                    {officer.recognition.score != null && <span>Recognition: {officer.recognition.count} record{officer.recognition.count === 1 ? '' : 's'}</span>}
                    {officer.supervisorRating.score != null && <span>Supervisor Rating: {officer.supervisorRating.score}%</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle>Hours by Officer (Current Month - {format(new Date(), 'MMMM yyyy')})</CardTitle>
          </CardHeader>
          <CardContent>
            {hoursBreakdown.length > 0 ? (
              <div className="min-w-0 overflow-x-auto">
              <div className="min-w-[620px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hoursBreakdown.slice(0, 15)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="regular" stackId="a" fill="#3b82f6" name="Regular" />
                  <Bar dataKey="overtime" stackId="a" fill="#ef4444" name="Overtime" />
                </BarChart>
              </ResponsiveContainer>
              </div>
              </div>
            ) : (
              <p className="text-center text-slate-300 py-8">No data available</p>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Punctuality Leaderboard (Current Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {companyOnTimeStats.leaderboard && companyOnTimeStats.leaderboard.length > 0 ? companyOnTimeStats.leaderboard.map((officer, idx) => (
                  <div key={officer.email} className="flex items-center justify-between p-2 border border-slate-700 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-300'
                      }`}>{idx + 1}</span>
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                    </div>
                    <Badge className={`${officer.rate >= 90 ? 'bg-green-600' : officer.rate >= 75 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                      {officer.rate}%
                    </Badge>
                  </div>
                )) : (
                  <p className="text-center text-slate-300 py-4">No eligible non-supervisor officers have elapsed scheduled shifts this month.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-green-600" />
                Top Commendations (Current Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {commendationStats.byOfficer.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {commendationStats.byOfficer.slice(0, 10).map((officer, idx) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-emerald-800 bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-300'
                        }`}>{idx + 1}</span>
                        <span className="text-sm font-medium text-white">{officer.name}</span>
                      </div>
                      <Badge className="bg-green-600 text-white">
                        {officer.count} ({officer.points} pts)
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-300 py-8">No commendations this month</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-600" />
                Officers Needing Training
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trainingByOfficer.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-600" />
                  <p className="text-slate-300">All officers up to date!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {trainingByOfficer.slice(0, 10).map((officer) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-slate-700 bg-slate-800 rounded-lg">
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${officer.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${officer.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300 w-16">{officer.completed}/{officer.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Complaints Status (Current Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {complaintStats.byOfficer.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {complaintStats.byOfficer.slice(0, 10).map((officer) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 border border-red-900 bg-slate-800 rounded-lg">
                      <span className="text-sm font-medium text-white">{officer.name}</span>
                      <Badge className={officer.sustained > 0 ? 'bg-red-600' : 'bg-amber-600'}>
                        {officer.count} ({officer.sustained} sustained)
                      </Badge>
                    </div>
                  ))}
                  {complaintStats.pending > 0 && (
                    <div className="mt-3 p-2 bg-amber-100 rounded border border-amber-300">
                      <p className="text-xs font-bold text-amber-900">{complaintStats.pending} pending investigation</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-slate-300 py-8">No complaints this month</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden border border-slate-800 bg-slate-900 text-white shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Officers Missing Shift Reports (Current Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MissingReportsCheck 
              schedules={schedules}
              allUsers={allUsers}
              filteredUsers={filteredUsers}
            />
          </CardContent>
        </Card>
      </div>

      {showSummaryDialog && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => !summarySending && setShowSummaryDialog(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="company-summary-dialog-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/40 bg-[#0b1522] shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-[#111d2d] to-[#0b1522] p-5">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-300"><MailCheck className="h-5 w-5" /></div>
                <div>
                  <h2 id="company-summary-dialog-title" className="text-lg font-black text-white">Send Company Summary</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">The automated version sends every day at 8:00 AM Eastern.</p>
                </div>
              </div>
              <button type="button" disabled={summarySending} onClick={() => setShowSummaryDialog(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5">
              {!summaryResult ? (
                <>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-sm leading-relaxed text-slate-300">
                    <p className="font-bold text-white">This sends one Black Point HTML email and one in-app notification to every active internal company member.</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-400">
                      <li>• Company-wide aggregate performance snapshot only</li>
                      <li>• Active operational team count as a company total</li>
                      <li>• The recipient’s complete personal list of missing DARs, report corrections, training, modules, and certification items</li>
                      <li>• No other officer’s name, individual score, ranking position, or missing items are shown</li>
                      <li>• Email is sent from management@blackpointkjc.com through the shared Outlook connection</li>
                    </ul>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" disabled={summarySending} onClick={() => setShowSummaryDialog(false)} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Cancel</button>
                    <button type="button" disabled={summarySending} onClick={sendCompanySummaryNow} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-70">
                      {summarySending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send Now</>}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`rounded-xl border p-4 ${summaryResult.email_sent ? 'border-emerald-600/40 bg-emerald-950/25' : 'border-amber-600/40 bg-amber-950/25'}`}>
                    <div className="flex items-center gap-2 font-black text-white">
                      {summaryResult.email_sent ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                      {summaryResult.email_sent ? 'Company summary delivered' : summaryResult.in_app_delivered ? 'In-app summary delivered' : 'Delivery needs attention'}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div className="rounded-lg bg-black/20 p-3"><div className="text-slate-500">Active recipients</div><div className="mt-1 text-lg font-black text-white">{summaryResult.recipient_count || 0}</div></div>
                      <div className="rounded-lg bg-black/20 p-3"><div className="text-slate-500">Missing items listed</div><div className="mt-1 text-lg font-black text-white">{summaryResult.missing_item_count || 0}</div></div>
                    </div>
                    {summaryResult.email_error && <p className="mt-3 text-xs leading-relaxed text-amber-200">{summaryResult.email_error}</p>}
                    {summaryResult.error && <p className="mt-3 text-xs leading-relaxed text-red-200">{summaryResult.error}</p>}
                    <p className="mt-3 text-[11px] text-slate-500">Email sender: {summaryResult.email_sender || 'management@blackpointkjc.com'} • In-app delivery remains separate from email.</p>
                  </div>
                  <button type="button" onClick={() => setShowSummaryDialog(false)} className="ml-auto flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-5 text-sm font-bold text-white hover:bg-slate-800">Done</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}