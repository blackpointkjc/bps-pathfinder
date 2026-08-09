import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { format, addDays, startOfWeek, addWeeks } from "date-fns";
import { Button } from "@/components/ui/button";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/c29aab32f_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

export default function ClientSchedule() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState("");

  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
  });


  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  useEffect(() => {
    if (clientLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(clientLocations[0]);
    }
  }, [clientLocations, selectedLocation]);

  const effectiveLocation = selectedLocation || clientLocations[0];

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['clientSchedules', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return [];
      const allSchedules = await base44.entities.Schedule.list('shift_date');
      return allSchedules.filter(s => {
        const schedLoc = s.location || '';
        return schedLoc === effectiveLocation || 
               schedLoc.startsWith(effectiveLocation + ':') || 
               schedLoc.startsWith(effectiveLocation + ' -') ||
               schedLoc.split(' - ')[0].trim() === effectiveLocation.trim();
      });
    },
    enabled: !!effectiveLocation,
    staleTime: 30000,
  });

  const officerEmails = useMemo(() => [...new Set((schedules || []).map(s => s.officer_email).filter(email => email && email !== 'OPEN'))], [schedules]);

  const { data: officerDirectory = [] } = useQuery({
    queryKey: ['clientOfficerDirectory', officerEmails.join('|')],
    queryFn: async () => {
      if (!officerEmails.length) return [];
      const result = await base44.functions.invoke('getClientOfficerDirectory', { officerEmails });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.officers || [];
    },
    enabled: officerEmails.length > 0,
    staleTime: 300000,
  });

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), currentWeekOffset);
  const weekEnd = addDays(weekStart, 6);

  const { data: weekStatus } = useQuery({
    queryKey: ['scheduleWeekStatus', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const statuses = await base44.entities.ScheduleWeekStatus.list();
      return statuses.find(s => s.week_start_date === format(weekStart, 'yyyy-MM-dd'));
    },
    enabled: !!user,
  });

  // Filter schedules to only show if week is marked as ready
  const visibleSchedules = useMemo(() => {
    if (!schedules || !weekStatus?.is_ready) return [];
    return schedules.filter(s => 
      s.shift_date >= format(weekStart, 'yyyy-MM-dd') && 
      s.shift_date <= format(weekEnd, 'yyyy-MM-dd')
    );
  }, [schedules, weekStatus, weekStart, weekEnd]);

  const weekDays = [];
  let currentDay = weekStart;
  while (currentDay <= weekEnd) {
    weekDays.push(currentDay);
    currentDay = addDays(currentDay, 1);
  }

  const getOfficerFullDisplay = (email) => {
    if (email === 'OPEN') return 'OPEN SHIFT';
    if (!email || !officerDirectory?.length) return 'Officer';
    const officer = officerDirectory.find(u => u.email === email);
    if (!officer) return 'Officer';
    return [officer.rank, officer.last_name].filter(Boolean).join(' ') || 'Officer';
  };

  const getOfficerRank = (email) => {
    if (!email || !officerDirectory?.length) return '';
    const officer = officerDirectory.find(u => u.email === email);
    return officer?.rank || '';
  };

  const getOfficerUnitNumber = (email) => {
    if (!email || !officerDirectory?.length) return '';
    const officer = officerDirectory.find(u => u.email === email);
    return officer?.unit_number || '';
  };

  const getScheduleForDate = useCallback((date) => {
    if (!visibleSchedules) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    const daySchedules = visibleSchedules.filter(s => s.shift_date === dateStr) || [];
    return daySchedules.sort((a, b) => {
      const timeA = a.start_time.replace(':', '');
      const timeB = b.start_time.replace(':', '');
      return timeA.localeCompare(timeB);
    });
  }, [visibleSchedules]);

  const groupByOfficer = () => {
    const grouped = {};
    weekDays.forEach(day => {
      const daySchedules = getScheduleForDate(day);
      daySchedules.forEach(schedule => {
        if (!grouped[schedule.officer_email]) {
          grouped[schedule.officer_email] = [];
        }
        grouped[schedule.officer_email].push({ ...schedule, date: day });
      });
    });
    return grouped;
  };

  const officerSchedules = groupByOfficer();
  const sortedOfficers = Object.keys(officerSchedules).sort((a, b) => {
    const unitA = getOfficerUnitNumber(a);
    const unitB = getOfficerUnitNumber(b);
    if (unitA && unitB) {
      const numA = parseInt(unitA);
      const numB = parseInt(unitB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
    }
    // Fallback to alphabetical sort using the full display name
    const nameA = getOfficerFullDisplay(a);
    const nameB = getOfficerFullDisplay(b);
    return nameA.localeCompare(nameB);
  });

  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection to assign a location to your account.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {clientLocations.length > 1 && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <MapPin className="w-8 h-8 text-purple-600" />
                <div className="flex-1">
                  <Label htmlFor="location-select" className="text-sm font-semibold text-purple-900 mb-2 block">
                    Select Location to View
                  </Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger id="location-select" className="bg-white">
                      <SelectValue placeholder="Select a location to view..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locName) => (
                        <SelectItem key={locName} value={locName}>
                          {locName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Site Schedule</h1>
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="w-5 h-5" />
            {effectiveLocation}
          </div>
        </div>

        <div className="flex items-center justify-between bg-gradient-to-r from-purple-100 to-blue-100 p-4 rounded-lg border-2 border-purple-400">
          <Button
            variant="outline"
            onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            className="bg-white"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous Week
          </Button>
          <div className="text-center">
            <p className="font-bold text-slate-900 text-lg">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </p>
            <p className="text-sm text-slate-600">Weekly Schedule (Read-Only)</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            className="bg-white"
          >
            Next Week
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {currentWeekOffset !== 0 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(0)}
              className="bg-blue-50 text-blue-700"
            >
              Return to Current Week
            </Button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg overflow-x-auto border-2 border-slate-300">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-purple-400 to-blue-400">
                <th className="border border-slate-400 p-3 text-left min-w-[220px] sticky left-0 bg-purple-400 z-10">
                    <div className="font-bold text-white">Officer / Unit</div>
                  </th>
                {weekDays.map((day) => (
                  <th key={day.toString()} className="border border-slate-400 p-3 text-center min-w-[120px]">
                    <div className="text-white font-bold">{format(day, 'EEE')}</div>
                    <div className="text-white text-[10px]">{format(day, 'M/d')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedOfficers.length === 0 && (
                <tr>
                  <td colSpan={weekDays.length + 1} className="p-8 text-center text-slate-500">
                    No shifts scheduled for this week
                  </td>
                </tr>
              )}
              {sortedOfficers.map((officerEmail, idx) => {
                const unitNumber = getOfficerUnitNumber(officerEmail);
                const officerDisplay = getOfficerFullDisplay(officerEmail);

                return (
                  <tr key={officerEmail} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-400 p-3 font-semibold sticky left-0 z-10" style={{backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc'}}>
                      <div className="flex items-center gap-2">
                        {unitNumber && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            #{unitNumber}
                          </span>
                        )}
                        <div className="text-slate-900">{officerDisplay}</div>
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const daySchedules = officerSchedules[officerEmail].filter(s => s.shift_date === dateStr);

                      return (
                        <td key={day.toString()} className="border border-slate-400 p-2">
                          {daySchedules.length > 0 ? (
                            <div className="space-y-1">
                              {daySchedules.map((schedule) => (
                                <div key={schedule.id} className="p-2 bg-purple-100 rounded text-[10px] font-semibold text-center text-purple-900">
                                  <div>{schedule.start_time}-{schedule.end_time}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-slate-300 text-[10px]">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> This schedule is read-only. You can view shifts assigned to your location but cannot make changes. Contact Black Point Protection for scheduling updates.
          </p>
        </div>
      </div>
    </div>
  );
}
