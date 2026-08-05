import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Trash2 } from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, addDays } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function MissingReportsCheck({ schedules, allUsers, filteredUsers, weekStart, weekEnd }) {
  const queryClient = useQueryClient();
  const [missingReports, setMissingReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Use provided week range or default to current week
  const currentWeekStart = weekStart || startOfWeek(new Date(), { weekStartsOn: 0 });
  const currentWeekEnd = weekEnd || endOfWeek(new Date(), { weekStartsOn: 0 });

  const { data: dailyActivityReports, refetch: refetchReports } = useQuery({
    queryKey: ['allDailyActivityReports'],
    queryFn: () => base44.entities.DailyActivityReport.list('-report_date'),
  });

  useEffect(() => {
    const checkMissingReports = async () => {
      if (!schedules || !filteredUsers || !dailyActivityReports) {
        setLoading(false);
        return;
      }

      const missing = [];
      const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
      const weekEndStr = format(currentWeekEnd, 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');

      for (const officer of filteredUsers) {
        const officerSchedules = schedules.filter(s => 
          s.officer_email === officer.email && 
          s.shift_date >= weekStartStr &&
          s.shift_date <= weekEndStr &&
          s.shift_date < today // Only past shifts
        );

        for (const shift of officerSchedules) {
          const hasReport = dailyActivityReports.some(r => 
            r.created_by === officer.email &&
            r.report_date === shift.shift_date &&
            r.location?.includes(shift.location.split(':')[0])
          );

          if (!hasReport) {
            missing.push({
              id: `${officer.email}-${shift.shift_date}-${shift.location}`,
              officer: `${officer.first_name} ${officer.last_name}`,
              email: officer.email,
              date: shift.shift_date,
              location: shift.location.split(':')[0],
              time: `${shift.start_time}-${shift.end_time}`
            });
          }
        }
      }

      missing.sort((a, b) => b.date.localeCompare(a.date));
      setMissingReports(missing);
      setLoading(false);
    };

    checkMissingReports();
  }, [schedules, filteredUsers, dailyActivityReports, currentWeekStart, currentWeekEnd]);

  const clearMissingReport = (reportId) => {
    setMissingReports(prev => prev.filter(r => r.id !== reportId));
  };

  const clearAllMissing = () => {
    if (confirm('Clear all missing report alerts for this week? This only hides them from view - it does not create reports.')) {
      setMissingReports([]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (missingReports.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 mx-auto mb-3 text-green-500" />
        <p className="text-green-700 font-semibold">✓ All officers have submitted reports</p>
        <p className="text-sm text-slate-500">No missing reports for this week</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Week of {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}
        </p>
        <Button variant="outline" size="sm" onClick={clearAllMissing} className="text-red-600 hover:bg-red-50">
          <Trash2 className="w-3 h-3 mr-1" /> Clear All
        </Button>
      </div>
      <ScrollArea className="h-64">
        <div className="space-y-2 p-1">
          {missingReports.map((item) => (
            <div key={item.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-red-900">{item.officer}</p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-600">{format(parseISO(item.date), 'MMM d')}</Badge>
                  <button onClick={() => clearMissingReport(item.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-red-700">{item.location} • {item.time}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}