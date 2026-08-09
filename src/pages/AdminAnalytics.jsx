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
import { isOperationalOfficer } from '@/lib/directoryUtils';

export default function AdminAnalytics() {
  const [selectedDivision, setSelectedDivision] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    refetchInterval: 30000,
  });

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => base44.entities.Division.list('name'),
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['allTimeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in'),
    refetchInterval: 30000,
  });

  const { data: schedules } = useQuery({
    queryKey: ['allSchedules'],
    queryFn: () => base44.entities.Schedule.list('-shift_date'),
    refetchInterval: 30000,
  });

  const { data: trainingCompletions } = useQuery({
    queryKey: ['allTrainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list(),
  });

  const { data: allTraining } = useQuery({
    queryKey: ['allTrainingModules'],
    queryFn: () => base44.entities.TrainingModule.filter({ active: true }),
  });

  const { data: incidentReports } = useQuery({
    queryKey: ['allIncidents'],
    queryFn: () => base44.entities.IncidentReport.list('-incident_date'),
  });

  const { data: callsForService } = useQuery({
    queryKey: ['allCalls'],
    queryFn: () => base44.entities.CallForService.list('-call_time'),
  });

  const { data: allCommendations } = useQuery({
    queryKey: ['allCommendations'],
    queryFn: () => base44.entities.Commendation.list('-commendation_date'),
  });

  const { data: allComplaints } = useQuery({
    queryKey: ['allComplaints'],
    queryFn: () => base44.entities.Complaint.list('-complaint_date'),
  });

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    const active = allUsers.filter(isOperationalOfficer);
    if (selectedDivision === 'all') return active;
    return active.filter(u => u.division === selectedDivision);
  }, [allUsers, selectedDivision]);

  const companyOnTimeStats = useMemo(() => {
    if (!timeEntries || !schedules || !filteredUsers) return { rate: 0, byOfficer: [] };

    // Use current month instead of payroll period
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerStats = {};

    filteredUsers.forEach(officer => {
      officerStats[officer.email] = { name: `${officer.first_name} ${officer.last_name}`, onTime: 0, late: 0, total: 0 };
    });

    timeEntries.forEach(entry => {
      if (!entry.clock_in || !officerStats[entry.officer_email]) return;
      
      const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      
      // Filter to current month
      if (clockInDate < monthStart || clockInDate > monthEnd) return;
      
      const matchingSchedule = schedules.find(s => 
        s.shift_date === clockInDate && s.officer_email === entry.officer_email
      );
      
      if (matchingSchedule) {
        const scheduledStart = matchingSchedule.start_time;
        const actualClockIn = format(parseISO(entry.clock_in), 'HH:mm');
        
        const scheduledMinutes = parseInt(scheduledStart.split(':')[0]) * 60 + parseInt(scheduledStart.split(':')[1]);
        const actualMinutes = parseInt(actualClockIn.split(':')[0]) * 60 + parseInt(actualClockIn.split(':')[1]);
        
        officerStats[entry.officer_email].total++;
        if (actualMinutes <= scheduledMinutes + 5) {
          officerStats[entry.officer_email].onTime++;
        } else {
          officerStats[entry.officer_email].late++;
        }
      }
    });

    const byOfficer = Object.entries(officerStats)
      .filter(([_, stats]) => stats.total > 0)
      .map(([email, stats]) => ({
        name: stats.name,
        email,
        rate: Math.round((stats.onTime / stats.total) * 100),
        onTime: stats.onTime,
        late: stats.late,
        total: stats.total
      }))
      .sort((a, b) => b.rate - a.rate);

    const totalOnTime = byOfficer.reduce((sum, o) => sum + o.onTime, 0);
    const totalEntries = byOfficer.reduce((sum, o) => sum + o.total, 0);
    const rate = totalEntries > 0 ? Math.round((totalOnTime / totalEntries) * 100) : 0;

    return { rate, byOfficer };
  }, [timeEntries, schedules, filteredUsers]);

  const hoursBreakdown = useMemo(() => {
    if (!timeEntries || !filteredUsers) return [];

    // Use current month instead of payroll period
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerHours = {};

    filteredUsers.forEach(officer => {
      officerHours[officer.email] = { 
        name: `${officer.first_name} ${officer.last_name}`,
        regular: 0,
        overtime: 0,
        weeks: {}
      };
    });

    // Calculate hours from actual time entries, not schedules
    timeEntries.forEach(entry => {
      if (!entry.clock_in || !entry.clock_out || !officerHours[entry.officer_email]) return;
      
      const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
      if (clockInDate < monthStart || clockInDate > monthEnd) return;

      const clockIn = parseISO(entry.clock_in);
      const clockOut = parseISO(entry.clock_out);
      const hours = differenceInMinutes(clockOut, clockIn) / 60;

      // Calculate week key (Friday start)
      const date = parseISO(clockInDate);
      const dayOfWeek = date.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      const weekKey = format(weekStart, 'yyyy-MM-dd');

      if (!officerHours[entry.officer_email].weeks[weekKey]) {
        officerHours[entry.officer_email].weeks[weekKey] = 0;
      }
      officerHours[entry.officer_email].weeks[weekKey] += hours;
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
          t.assigned_to?.includes(officer.email) || 
          t.assigned_divisions?.includes(officer.division) ||
          t.assigned_ranks?.includes(officer.rank) ||
          t.required // Include all required training
        );

        // If no training is assigned to this officer, they still need to do required training
        const trainingToCheck = assignedTraining.length > 0 ? assignedTraining : requiredTraining;

        if (trainingToCheck.length === 0) return null;

        const completedIds = trainingCompletions
          .filter(tc => tc.officer_email === officer.email && tc.completed)
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

  const responseTimeStats = useMemo(() => {
    if (!callsForService || !incidentReports) return { avg: 0 };

    const responseTimes = [];

    callsForService.forEach(call => {
      if (!call.call_time) return;
      
      const matchingIncident = incidentReports.find(ir => {
        if (!ir.created_date) return false;
        const callTime = parseISO(call.call_time);
        const incidentTime = parseISO(ir.created_date);
        const diffMins = differenceInMinutes(incidentTime, callTime);
        return diffMins >= 0 && diffMins <= 120 && ir.location?.includes(call.address?.split(',')[0]);
      });

      if (matchingIncident) {
        const minutes = differenceInMinutes(parseISO(matchingIncident.created_date), parseISO(call.call_time));
        responseTimes.push(minutes);
      }
    });

    const avg = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, r) => sum + r, 0) / responseTimes.length)
      : 0;

    return { avg };
  }, [callsForService, incidentReports]);

  const commendationStats = useMemo(() => {
    if (!allCommendations || !filteredUsers) return { byOfficer: [], total: 0 };

    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const officerCommendations = {};

    filteredUsers.forEach(officer => {
      officerCommendations[officer.email] = {
        name: `${officer.first_name} ${officer.last_name}`,
        count: 0,
        points: 0
      };
    });

    allCommendations.forEach(comm => {
      if (!officerCommendations[comm.officer_email]) return;
      const commDate = format(parseISO(comm.commendation_date), 'yyyy-MM-dd');
      if (commDate >= monthStart && commDate <= monthEnd) {
        officerCommendations[comm.officer_email].count++;
        officerCommendations[comm.officer_email].points += comm.points_awarded || 1;
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
      officerComplaints[officer.email] = {
        name: `${officer.first_name} ${officer.last_name}`,
        count: 0,
        sustained: 0
      };
    });

    let pending = 0;

    allComplaints.forEach(comp => {
      if (!officerComplaints[comp.officer_email]) return;
      const compDate = format(parseISO(comp.complaint_date), 'yyyy-MM-dd');
      if (compDate >= monthStart && compDate <= monthEnd) {
        officerComplaints[comp.officer_email].count++;
        if (comp.investigation_status === 'sustained') {
          officerComplaints[comp.officer_email].sustained++;
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

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900">Admin Access Required</h2>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Card className="min-w-0 border border-slate-800 bg-slate-900 text-white shadow-lg">
            <CardContent className="p-4">
              <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-green-600">{companyOnTimeStats.rate || 0}%</p>
              <p className="text-xs text-slate-400">On-Time Rate</p>
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
              <p className="text-center text-slate-500 py-8">No data available</p>
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
                  <div key={officer.email} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>{idx + 1}</span>
                      <span className="text-sm font-medium text-black">{officer.name}</span>
                    </div>
                    <Badge className={`${officer.rate >= 90 ? 'bg-green-600' : officer.rate >= 75 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                      {officer.rate}%
                    </Badge>
                  </div>
                )) : (
                  <p className="text-center text-slate-500 py-4">No time entries for current month</p>
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
                    <div key={officer.email} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>{idx + 1}</span>
                        <span className="text-sm font-medium">{officer.name}</span>
                      </div>
                      <Badge className="bg-green-600 text-white">
                        {officer.count} ({officer.points} pts)
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-8">No commendations this month</p>
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
                  <p className="text-slate-600">All officers up to date!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {trainingByOfficer.slice(0, 10).map((officer) => (
                    <div key={officer.email} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <span className="text-sm font-medium">{officer.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${officer.percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${officer.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 w-16">{officer.completed}/{officer.total}</span>
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
                    <div key={officer.email} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                      <span className="text-sm font-medium">{officer.name}</span>
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
                <p className="text-center text-slate-500 py-8">No complaints this month</p>
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