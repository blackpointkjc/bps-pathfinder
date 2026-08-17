import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, Users, Clock, AlertTriangle, 
  CheckCircle2, Award, Shield
} from "lucide-react";
import { format, parseISO, differenceInMinutes, startOfWeek, addDays, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import MissingReportsCheck from "../components/MissingReportsCheck";
import { isOperationalOfficer, isInternalMember } from '@/lib/directoryUtils';
import { calculatePunctuality, calculateBidStanding, calculateTrainingScore, calculateQrPatrol, calculateClientFeedback, calculateSupervisorRating, calculateRecognition, buildOverallPerformance } from '@/lib/performanceScoring';

const emailKey = (value) => String(value || '').trim().toLowerCase();

function breakMinutes(entry) {
  return (entry?.break_periods || []).reduce((total, period) => {
    const start = period?.start ? new Date(period.start).getTime() : NaN;
    const end = period?.end ? new Date(period.end).getTime() : NaN;
    return total + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : 0);
  }, 0);
}

export default function AdminAnalytics() {
  const [selectedDivision, setSelectedDivision] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

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
  const allClientFeedback = analyticsData.clientFeedback || [];
  const allPerformanceReviews = analyticsData.performanceReviews || [];

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    const workEmails = new Set([
      ...timeEntries.map(row => emailKey(row.officer_email)),
      ...schedules.map(row => emailKey(row.officer_email)),
      ...trainingCompletions.map(row => emailKey(row.officer_email)),
    ].filter(Boolean));
    const active = allUsers.filter(userRow => isOperationalOfficer(userRow) || (isInternalMember(userRow) && workEmails.has(emailKey(userRow.email))));
    if (selectedDivision === 'all') return active;
    return active.filter(u => String(u.division || '') === String(selectedDivision));
  }, [allUsers, timeEntries, schedules, trainingCompletions, selectedDivision]);

  const currentMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const companyOnTimeStats = useMemo(() => {
    const byOfficer = filteredUsers.map(officer => {
      const key = emailKey(officer.email);
      const stats = calculatePunctuality(
        timeEntries.filter(entry => emailKey(entry.officer_email) === key),
        schedules.filter(schedule => emailKey(schedule.officer_email) === key),
        currentMonthStart,
        currentMonthEnd
      );
      return { name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email, email: officer.email, ...stats };
    }).filter(item => item.total > 0).sort((a, b) => (b.rate || 0) - (a.rate || 0));
    const totalOnTime = byOfficer.reduce((sum, item) => sum + item.onTime, 0);
    const totalEntries = byOfficer.reduce((sum, item) => sum + item.total, 0);
    return { rate: totalEntries ? Math.round((totalOnTime / totalEntries) * 100) : 0, byOfficer };
  }, [timeEntries, schedules, filteredUsers, currentMonthStart, currentMonthEnd]);

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
    const officerScans = allQrScans.filter(item => emailKey(item.officer_email) === key);
    const officerFeedback = allClientFeedback.filter(item => emailKey(item.officer_email) === key);
    const officerReviews = allPerformanceReviews.filter(item => emailKey(item.officer_email) === key);
    const officerCommendations = allCommendations.filter(item => emailKey(item.officer_email) === key);

    const punctuality = calculatePunctuality(officerTimeEntries, officerSchedules, currentMonthStart, currentMonthEnd);
    const training = calculateTrainingScore(officer, allTraining, officerCompletions, officerAssignments);
    const qr = calculateQrPatrol(officerTimeEntries, officerScans, allQrCheckpoints, currentMonthStart, currentMonthEnd);
    const bidStanding = calculateBidStanding(officerBids, currentMonthStart, currentMonthEnd);
    const clientFeedback = calculateClientFeedback(officerFeedback, currentMonthStart, currentMonthEnd);
    const supervisorRating = calculateSupervisorRating(officerReviews, currentMonthStart, currentMonthEnd);
    const recognition = calculateRecognition(officerCommendations, officerFeedback, currentMonthStart, currentMonthEnd);
    const overall = buildOverallPerformance({ punctuality, trainingScore: training.percentage, qrScore: qr.score, bidStanding, clientFeedback, supervisorRating, recognition });

    return {
      email: officer.email,
      name: `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.full_name || officer.email,
      overall,
      punctuality,
      training,
      qr,
      bidStanding,
      clientFeedback,
      supervisorRating,
      recognition,
    };
  }).sort((a, b) => (b.overall.score ?? -1) - (a.overall.score ?? -1)), [filteredUsers, timeEntries, schedules, allBids, trainingCompletions, trainingAssignments, allTraining, allQrScans, allQrCheckpoints, allClientFeedback, allPerformanceReviews, allCommendations, currentMonthStart, currentMonthEnd]);

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
          <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger className="w-48">
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{companyOnTimeStats.rate || 0}%</p>
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
            <p className="text-xs text-slate-400">Same scoring engine as the officer My Performance page. Categories with no records are excluded instead of counted as zero.</p>
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
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                    <span>Bid Standing: {officer.bidStanding.score != null ? `${officer.bidStanding.score}%` : 'Not scored'} ({officer.bidStanding.accepted} accepted, {officer.bidStanding.pending} pending, {officer.bidStanding.rejected} rejected)</span>
                    <span>Client Feedback: {officer.clientFeedback.score != null ? `${officer.clientFeedback.score}% (${officer.clientFeedback.avgRating.toFixed(1)}/5)` : 'No ratings'}</span>
                    <span>Recognition: {officer.recognition.count} record{officer.recognition.count === 1 ? '' : 's'} • Supervisor Rating: {officer.supervisorRating.score != null ? `${officer.supervisorRating.score}%` : 'No review'}</span>
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
                {companyOnTimeStats.byOfficer && companyOnTimeStats.byOfficer.length > 0 ? companyOnTimeStats.byOfficer.slice(0, 10).map((officer, idx) => (
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
                  <p className="text-center text-slate-300 py-4">No time entries for current month</p>
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
              Officers Missing Shift Reports (Current Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MissingReportsCheck 
              schedules={schedules}
              allUsers={allUsers}
              filteredUsers={filteredUsers}
              weekStart={startOfWeek(new Date(), { weekStartsOn: 0 })}
              weekEnd={addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 6)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}