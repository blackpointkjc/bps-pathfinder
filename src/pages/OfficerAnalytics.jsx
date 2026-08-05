import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, TrendingUp, AlertTriangle, 
  CheckCircle2, Moon, Award, BarChart3, Calendar
} from "lucide-react";
import { format, parseISO, differenceInMinutes, startOfMonth, endOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function OfficerAnalytics() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: () => base44.entities.PayrollPeriod.list('-start_date'),
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['myTimeEntries', user?.email],
    queryFn: () => base44.entities.TimeEntry.filter({ officer_email: user?.email }, '-clock_in'),
    enabled: !!user?.email,
  });

  const { data: schedules } = useQuery({
    queryKey: ['mySchedules', user?.email],
    queryFn: () => base44.entities.Schedule.filter({ officer_email: user?.email }, '-shift_date'),
    enabled: !!user?.email,
  });

  const { data: trainingCompletions } = useQuery({
    queryKey: ['myTraining', user?.email],
    queryFn: () => base44.entities.TrainingCompletion.filter({ officer_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: allTraining } = useQuery({
    queryKey: ['allTrainingModules'],
    queryFn: () => base44.entities.TrainingModule.filter({ active: true }),
  });

  // Get current month boundaries for monthly reset
  const currentMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const onTimeStats = useMemo(() => {
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
      const matchingSchedule = schedules.find(s => s.shift_date === clockInDate);
      
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

    const total = onTime + late;
    const rate = total > 0 ? Math.round((onTime / total) * 100) : 100;

    return { rate, onTime, late, total };
  }, [timeEntries, schedules, currentMonthStart, currentMonthEnd]);

  const hoursStats = useMemo(() => {
    if (!timeEntries || !schedules) return { regular: 0, overtime: 0, total: 0, weeklyBreakdown: [] };

    let totalHours = 0;
    const weeklyHours = {};

    // Filter to current month only - use schedules instead of time entries for more accuracy
    const monthlySchedules = schedules.filter(s => 
      s.shift_date >= currentMonthStart && s.shift_date <= currentMonthEnd
    );

    monthlySchedules.forEach(schedule => {
      const start = parseInt(schedule.start_time.replace(':', ''));
      const end = parseInt(schedule.end_time.replace(':', ''));
      const hours = end < start ? ((2400 - start) + end) / 100 : (end - start) / 100;
      totalHours += hours;

      const date = parseISO(schedule.shift_date);
      const dayOfWeek = date.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      const weekKey = format(weekStart, 'MMM d');

      if (!weeklyHours[weekKey]) weeklyHours[weekKey] = 0;
      weeklyHours[weekKey] += hours;
    });

    let regular = 0;
    let overtime = 0;

    Object.values(weeklyHours).forEach(weekHours => {
      if (weekHours > 40) {
        regular += 40;
        overtime += weekHours - 40;
      } else {
        regular += weekHours;
      }
    });

    const weeklyBreakdown = Object.entries(weeklyHours).map(([week, hours]) => ({
      week,
      hours: Math.round(hours * 10) / 10,
      overtime: Math.max(0, hours - 40)
    }));

    return { regular: Math.round(regular * 10) / 10, overtime: Math.round(overtime * 10) / 10, total: Math.round(totalHours * 10) / 10, weeklyBreakdown };
  }, [schedules, currentMonthStart, currentMonthEnd]);

  const shiftStats = useMemo(() => {
    if (!schedules) return { splitShifts: 0, overnightShifts: 0, totalShifts: 0 };

    let splitShifts = 0;
    let overnightShifts = 0;

    schedules.forEach(schedule => {
      if (schedule.is_split_shift) splitShifts++;
      
      const endHour = parseInt(schedule.end_time?.split(':')[0] || 0);
      const startHour = parseInt(schedule.start_time?.split(':')[0] || 0);
      
      if (endHour < startHour || (startHour >= 22 || endHour <= 6)) {
        overnightShifts++;
      }
    });

    return { splitShifts, overnightShifts, totalShifts: schedules.length };
  }, [schedules]);

  const trainingStats = useMemo(() => {
    if (!trainingCompletions || !allTraining) return { completed: 0, pending: 0, percentage: 0 };

    const assignedTraining = allTraining.filter(t => 
      t.assigned_to?.includes(user?.email) || 
      t.assigned_divisions?.includes(user?.division) ||
      t.assigned_ranks?.includes(user?.rank)
    );

    const completedIds = trainingCompletions.filter(tc => tc.completed).map(tc => tc.training_module_id);
    const completed = assignedTraining.filter(t => completedIds.includes(t.id)).length;
    const pending = assignedTraining.length - completed;
    const percentage = assignedTraining.length > 0 ? Math.round((completed / assignedTraining.length) * 100) : 100;

    return { completed, pending, percentage };
  }, [trainingCompletions, allTraining, user]);

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            My Performance Analytics
          </h1>
          <p className="text-slate-600">Track your performance metrics and statistics</p>
          <Badge className="bg-blue-100 text-blue-800 mt-2">
            <Calendar className="w-3 h-3 mr-1" />
            {format(new Date(), 'MMMM yyyy')} (Resets Monthly)
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <span className={`text-3xl font-bold ${onTimeStats.rate >= 90 ? 'text-green-600' : onTimeStats.rate >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                  {onTimeStats.rate}%
                </span>
              </div>
              <p className="text-sm font-medium text-slate-700">On-Time Arrival</p>
              <p className="text-xs text-slate-500">{onTimeStats.onTime} on-time / {onTimeStats.total} total</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-indigo-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 text-blue-600" />
                <span className="text-3xl font-bold text-blue-600">{hoursStats.total}h</span>
              </div>
              <p className="text-sm font-medium text-slate-700">Hours This Month</p>
              <p className="text-xs text-slate-500">{hoursStats.regular}h regular / {hoursStats.overtime}h OT</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-violet-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Moon className="w-8 h-8 text-purple-600" />
                <span className="text-3xl font-bold text-purple-600">{shiftStats.overnightShifts}</span>
              </div>
              <p className="text-sm font-medium text-slate-700">Overnight Shifts</p>
              <p className="text-xs text-slate-500">{shiftStats.splitShifts} split shifts</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Award className="w-8 h-8 text-amber-600" />
                <span className={`text-3xl font-bold ${trainingStats.percentage === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                  {trainingStats.percentage}%
                </span>
              </div>
              <p className="text-sm font-medium text-slate-700">Training Complete</p>
              <p className="text-xs text-slate-500">{trainingStats.pending} modules pending</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Weekly Hours Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hoursStats.weeklyBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hoursStats.weeklyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#3b82f6" name="Hours Worked" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-500 py-8">No time entries for current period</p>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Shift Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-700">Total Scheduled Shifts</span>
                  <Badge className="bg-blue-600 text-white">{shiftStats.totalShifts}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <span className="text-slate-700">Overnight Shifts</span>
                  <Badge className="bg-purple-600 text-white">{shiftStats.overnightShifts}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <span className="text-slate-700">Split Shifts</span>
                  <Badge className="bg-amber-600 text-white">{shiftStats.splitShifts}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Punctuality Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-slate-700">On-Time Arrivals</span>
                  <Badge className="bg-green-600 text-white">{onTimeStats.onTime}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <span className="text-slate-700">Late Arrivals</span>
                  <Badge className={`${onTimeStats.late > 0 ? 'bg-red-600' : 'bg-slate-400'} text-white`}>{onTimeStats.late}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <span className="text-slate-700">Average Performance</span>
                  <Badge className={`${onTimeStats.rate >= 90 ? 'bg-green-600' : onTimeStats.rate >= 75 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                    {onTimeStats.rate >= 90 ? 'Excellent' : onTimeStats.rate >= 75 ? 'Good' : 'Needs Improvement'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}