import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Shield, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { format, addDays, startOfWeek, addWeeks } from "date-fns";
import { Button } from "@/components/ui/button";

const LOGO_URL = "/black-point-shield.webp";

export default function ClientSchedule() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);

  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
  });


  const clientLocations = [...new Set([
    ...(Array.isArray(user?.assigned_locations) ? user.assigned_locations : []),
    ...(Array.isArray(user?.assigned_sites) ? user.assigned_sites : []),
    ...(user?.assigned_location ? [user.assigned_location] : []),
  ].filter(Boolean))];

  const siteKey = (value) => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
  const assignedSiteKeys = useMemo(() => new Set(clientLocations.map(siteKey)), [clientLocations.join('|')]);
  const effectiveLocation = clientLocations.length > 1 ? 'All Assigned Sites' : clientLocations[0];

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['clientSchedules', clientLocations.join('|')],
    queryFn: async () => {
      if (!clientLocations.length) return [];
      const allSchedules = await base44.entities.Schedule.list('shift_date');
      return allSchedules.filter(s => assignedSiteKeys.has(siteKey(s.location)));
    },
    enabled: clientLocations.length > 0,
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
    <div className="client-schedule-page min-h-screen w-full min-w-0 overflow-x-hidden p-3 sm:p-4 md:p-6">
      <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5 sm:space-y-6">
        <div className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Site Operations</p>
          <h1 className="mb-2 mt-1 text-2xl font-bold text-white sm:text-3xl">Site Schedule</h1>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-slate-300">
            <MapPin className="w-5 h-5" />
            <span>{clientLocations.length > 1 ? `${clientLocations.length} Assigned Properties` : effectiveLocation}</span>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 sm:grid-cols-[auto_1fr_auto] sm:p-4">
          <Button
            variant="outline"
            onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700 sm:w-auto"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous Week
          </Button>
          <div className="min-w-0 text-center">
            <p className="text-lg font-bold text-white">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </p>
            <p className="text-sm text-slate-400">Weekly Schedule (Read-Only)</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            className="w-full border-slate-600 bg-slate-800 text-white hover:bg-slate-700 sm:w-auto"
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

        <div className="space-y-5">
          {clientLocations.map((site) => {
            const siteSchedules = visibleSchedules.filter(schedule => siteKey(schedule.location) === siteKey(site));
            return (
              <section key={site} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-400" /><h2 className="truncate text-base font-black text-white sm:text-lg">{site}</h2></div>
                    <p className="mt-1 text-xs text-slate-400">Published security coverage for this property</p>
                  </div>
                  <div className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300">{siteSchedules.length} shift{siteSchedules.length === 1 ? '' : 's'}</div>
                </div>
                <div className="grid gap-px bg-slate-700 sm:grid-cols-2 xl:grid-cols-7">
                  {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const daySchedules = siteSchedules.filter(schedule => schedule.shift_date === dateStr).sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
                    return (
                      <div key={`${site}-${dateStr}`} className="min-h-[118px] bg-slate-900 p-3">
                        <div className="mb-3 border-b border-slate-800 pb-2"><div className="text-[10px] font-black uppercase tracking-widest text-violet-300">{format(day, 'EEE')}</div><div className="text-sm font-bold text-white">{format(day, 'MMM d')}</div></div>
                        {daySchedules.length ? <div className="space-y-2">{daySchedules.map(schedule => <div key={schedule.id} className="rounded-lg border border-violet-800/60 bg-violet-950/40 p-2.5"><div className="text-sm font-black text-violet-100">{schedule.start_time} – {schedule.end_time}</div><div className="mt-1 text-xs font-medium text-slate-300">{getOfficerFullDisplay(schedule.officer_email)}</div>{getOfficerUnitNumber(schedule.officer_email) && <div className="mt-0.5 text-[10px] text-slate-500">Unit #{getOfficerUnitNumber(schedule.officer_email)}</div>}</div>)}</div> : <div className="py-4 text-center text-xs text-slate-600">No scheduled coverage</div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="hidden client-schedule-table w-full min-w-0 overflow-x-auto rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-xs text-slate-100 xl:min-w-0">
            <thead>
              <tr className="bg-slate-800">
                <th className="sticky left-0 z-10 w-[190px] border border-slate-600 bg-slate-800 p-3 text-left">
                    <div className="font-bold text-white">Officer / Unit</div>
                  </th>
                {weekDays.map((day) => (
                  <th key={day.toString()} className="border border-slate-600 bg-slate-800 p-2 text-center sm:p-3">
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
                  <tr key={officerEmail} className={idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/70'}>
                    <td className={`sticky left-0 z-10 border border-slate-600 p-3 font-semibold ${idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800'}`}> 
                      <div className="flex items-center gap-2">
                        {unitNumber && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            #{unitNumber}
                          </span>
                        )}
                        <div className="font-semibold text-white">{officerDisplay}</div>
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const daySchedules = officerSchedules[officerEmail].filter(s => s.shift_date === dateStr);

                      return (
                        <td key={day.toString()} className="min-w-0 border border-slate-600 bg-inherit p-1.5 sm:p-2">
                          {daySchedules.length > 0 ? (
                            <div className="space-y-1">
                              {daySchedules.map((schedule) => (
                                <div key={schedule.id} className="min-w-0 rounded border border-violet-700/60 bg-violet-950/70 p-2 text-center text-[10px] font-bold leading-4 text-violet-100">
                                  <div>{schedule.start_time}-{schedule.end_time}</div>
                                  {clientLocations.length > 1 && <div className="mt-1 text-[9px] font-medium text-violet-300">{String(schedule.location || '').split(' - ')[0].split(':')[0]}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-[10px] text-slate-500">—</div>
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

        <div className="rounded-lg border border-blue-800 bg-blue-950/40 p-4">
          <p className="text-sm text-blue-100">
            <strong>Note:</strong> This schedule is read-only. You can view shifts assigned to your location but cannot make changes. Contact Black Point Protection for scheduling updates.
          </p>
        </div>
      </div>
    </div>
  );
}
