import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Award, Clock, Star, Target } from "lucide-react";
import { format, parseISO, subMonths, differenceInMinutes } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OfficerPerformance() {
  const [selectedPeriod, setSelectedPeriod] = useState("30");
  const [generating, setGenerating] = useState(false);
  const [metrics, setMetrics] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: performanceData = {}, error: performanceError } = useQuery({
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
  const incidentReports = performanceData.incidents || [];
  const commendations = performanceData.commendations || [];
  const complaints = performanceData.complaints || [];
  const trainingModules = performanceData.trainingModules || [];
  const trainingCompletions = performanceData.trainingCompletions || [];
  const clientFeedback = performanceData.clientFeedback || [];

  const generatePerformanceReport = async () => {
    setGenerating(true);
    try {
      const periodStart = format(subMonths(new Date(), parseInt(selectedPeriod) / 30), 'yyyy-MM-dd');
      const periodEnd = format(new Date(), 'yyyy-MM-dd');

      const periodEntries = timeEntries?.filter(e => {
        if (!e.clock_in) return false;
        const clockIn = format(parseISO(e.clock_in), 'yyyy-MM-dd');
        return clockIn >= periodStart && clockIn <= periodEnd && e.clock_out;
      }) || [];

      const periodSchedules = schedules?.filter(s => 
        s.shift_date >= periodStart && s.shift_date <= periodEnd
      ) || [];

      const periodIncidents = incidentReports?.filter(i => {
        const iDate = format(parseISO(i.incident_date), 'yyyy-MM-dd');
        return iDate >= periodStart && iDate <= periodEnd && String(i.created_by_id || '') === String(user.id || '');
      }) || [];

      const periodCommendations = commendations?.filter(c => {
        const cDate = format(parseISO(c.commendation_date), 'yyyy-MM-dd');
        return cDate >= periodStart && cDate <= periodEnd;
      }) || [];

      const periodComplaints = complaints?.filter(c => {
        const cDate = format(parseISO(c.complaint_date), 'yyyy-MM-dd');
        return cDate >= periodStart && cDate <= periodEnd;
      }) || [];

      const periodFeedback = clientFeedback?.filter(f => {
        const fDate = format(parseISO(f.created_date), 'yyyy-MM-dd');
        return fDate >= periodStart && fDate <= periodEnd;
      }) || [];

      // Calculate punctuality
      let onTime = 0;
      let late = 0;
      periodEntries.forEach(entry => {
        const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
        const matchingSchedule = periodSchedules.find(s => s.shift_date === clockInDate);
        
        if (matchingSchedule) {
          const scheduledStart = matchingSchedule.start_time;
          const actualClockIn = format(parseISO(entry.clock_in), 'HH:mm');
          const scheduledMinutes = parseInt(scheduledStart.split(':')[0]) * 60 + parseInt(scheduledStart.split(':')[1]);
          const actualMinutes = parseInt(actualClockIn.split(':')[0]) * 60 + parseInt(actualClockIn.split(':')[1]);
          
          if (actualMinutes <= scheduledMinutes + 5) {
            onTime++;
          } else {
            late++;
          }
        }
      });

      const punctualityScore = (onTime + late) > 0 ? Math.round((onTime / (onTime + late)) * 100) : 100;

      // Calculate hours worked
      const hoursWorked = periodEntries.reduce((sum, e) => {
        const diff = differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in));
        return sum + (diff / 60);
      }, 0);

      // Calculate training completion
      const assignedTraining = trainingModules?.filter(m => 
        !m.assigned_officers || m.assigned_officers.includes(user.email)
      ) || [];
      const completedTraining = trainingCompletions?.filter(c => 
        c.completed && assignedTraining.some(m => m.id === c.training_module_id)
      ) || [];
      const trainingRate = assignedTraining.length > 0 
        ? Math.round((completedTraining.length / assignedTraining.length) * 100)
        : 100;

      // Calculate client feedback score
      const avgFeedback = periodFeedback.length > 0
        ? periodFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / periodFeedback.length
        : 0;

      // Calculate average response time (if available in incidents)
      const incidentsWithResponse = periodIncidents.filter(i => i.action_taken);
      const avgResponseTime = incidentsWithResponse.length;

      const aiAnalysis = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this security officer's performance data and provide insights.

OFFICER: ${user.first_name} ${user.last_name}
PERIOD: ${periodStart} to ${periodEnd} (${selectedPeriod} days)

METRICS:
- Punctuality Score: ${punctualityScore}% (${onTime} on-time, ${late} late)
- Hours Worked: ${hoursWorked.toFixed(1)}
- Shifts Completed: ${periodEntries.length}
- Incident Reports: ${periodIncidents.length}
- Commendations: ${periodCommendations.length}
- Complaints: ${periodComplaints.length}
- Training Completion Rate: ${trainingRate}%
- Client Feedback Score: ${avgFeedback.toFixed(1)}/5 (${periodFeedback.length} reviews)

Provide:
1. A 2-3 sentence performance summary
2. List 3-5 key strengths
3. List 2-4 areas for improvement with actionable suggestions
4. An overall performance score (0-100)`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            strengths: {
              type: "array",
              items: { type: "string" }
            },
            improvement_areas: {
              type: "array",
              items: { type: "string" }
            },
            overall_score: { type: "number" }
          }
        }
      });

      setMetrics({
        punctualityScore,
        hoursWorked: hoursWorked.toFixed(1),
        shiftsCompleted: periodEntries.length,
        incidentReports: periodIncidents.length,
        commendations: periodCommendations.length,
        complaints: periodComplaints.length,
        trainingRate,
        clientFeedbackScore: avgFeedback.toFixed(1),
        clientFeedbackCount: periodFeedback.length,
        ...aiAnalysis
      });

    } catch (error) {
      console.error('Performance analysis error:', error);
      alert('Failed to generate performance report');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-purple-600" />
            My Performance Dashboard
          </h1>
          <p className="text-slate-600">Track your performance metrics and identify areas for growth</p>
        </div>

        {performanceError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Performance records could not be loaded: {performanceError.message}</div>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Generate Performance Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Time Period</label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="60">Last 60 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                    <SelectItem value="180">Last 6 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={generatePerformanceReport}
                disabled={generating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {generating ? 'Analyzing...' : 'Generate Report'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {metrics && (
          <>
            <Card className="border-none shadow-lg bg-gradient-to-r from-purple-50 to-indigo-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-purple-900">Overall Performance Score</h3>
                    <p className="text-purple-700">AI-Generated Analysis</p>
                  </div>
                  <div className="text-5xl font-bold text-purple-600">
                    {metrics.overall_score}
                    <span className="text-2xl">/100</span>
                  </div>
                </div>
                <Progress value={metrics.overall_score} className="h-3" />
                <p className="mt-4 text-slate-700">{metrics.summary}</p>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="text-sm text-slate-600">Punctuality</p>
                      <p className="text-2xl font-bold text-slate-900">{metrics.punctualityScore}%</p>
                    </div>
                  </div>
                  <Progress value={metrics.punctualityScore} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Target className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-sm text-slate-600">Training</p>
                      <p className="text-2xl font-bold text-slate-900">{metrics.trainingRate}%</p>
                    </div>
                  </div>
                  <Progress value={metrics.trainingRate} className="h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Star className="w-8 h-8 text-amber-600" />
                    <div>
                      <p className="text-sm text-slate-600">Client Feedback</p>
                      <p className="text-2xl font-bold text-slate-900">{metrics.clientFeedbackScore}/5</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{metrics.clientFeedbackCount} reviews</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Award className="w-8 h-8 text-purple-600" />
                    <div>
                      <p className="text-sm text-slate-600">Recognition</p>
                      <p className="text-2xl font-bold text-slate-900">{metrics.commendations}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Commendations</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="border-2 border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-green-900 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {metrics.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-green-800">
                        <span className="text-green-600 mt-1">✓</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-2 border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-amber-900 flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {metrics.improvement_areas.map((area, i) => (
                      <li key={i} className="flex items-start gap-2 text-amber-800">
                        <span className="text-amber-600 mt-1">→</span>
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Detailed Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Hours Worked</p>
                    <p className="text-2xl font-bold text-slate-900">{metrics.hoursWorked}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Shifts Completed</p>
                    <p className="text-2xl font-bold text-slate-900">{metrics.shiftsCompleted}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Incident Reports</p>
                    <p className="text-2xl font-bold text-slate-900">{metrics.incidentReports}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}