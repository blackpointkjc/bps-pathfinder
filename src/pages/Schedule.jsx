import { confirmInApp } from '@/lib/inAppDialog';
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Car, Users, ShieldCheck } from "lucide-react";
import { format, addDays, startOfDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import PullToRefresh from "../components/PullToRefresh";
import { getCurrentDirectoryUser, listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { getOfficerPreviewRequest } from '@/utils/officerPreview';

const TIMELINE_HOUR_HEIGHT = 56;
const TIMELINE_HEIGHT = TIMELINE_HOUR_HEIGHT * 24;
const TIMELINE_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const minutesFromTime = value => {
  const [hours = 0, minutes = 0] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return Math.max(0, Math.min(1440, (hours * 60) + minutes));
};

const hourLabel = hour => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
};

const timelinePlacement = (schedule, carryover = false) => {
  const startMinutes = Math.min(1439, minutesFromTime(schedule.start_time));
  const rawEndMinutes = minutesFromTime(schedule.end_time);
  const crossesMidnight = rawEndMinutes <= startMinutes;
  if (carryover && crossesMidnight) {
    const visibleMinutes = Math.max(1, rawEndMinutes);
    return {
      top: 0,
      height: Math.max(38, (visibleMinutes / 60) * TIMELINE_HOUR_HEIGHT),
      crossesMidnight: false,
      carryover: true,
    };
  }
  const visibleEndMinutes = crossesMidnight ? 1440 : Math.min(1440, rawEndMinutes);
  const visibleMinutes = Math.max(1, visibleEndMinutes - startMinutes);
  return {
    top: (startMinutes / 60) * TIMELINE_HOUR_HEIGHT,
    height: Math.max(38, (visibleMinutes / 60) * TIMELINE_HOUR_HEIGHT),
    crossesMidnight,
    carryover: false,
  };
};

export default function Schedule() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [selectedPayrollPeriod] = useState("all");

  const queryClient = useQueryClient(); // Initialize query client

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: scheduleData = {}, isLoading: schedulesLoading, error: scheduleError } = useQuery({
    queryKey: ['myScheduleData', user?.email],
    queryFn: async () => {
      const result = await base44.functions.invoke('getMyScheduleData', getOfficerPreviewRequest());
      let payload = result?.data || result || {};
      if (!Array.isArray(payload.schedules) && payload?.data && typeof payload.data === 'object') payload = payload.data;
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user?.email,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const payrollPeriods = scheduleData.payrollPeriods || [];
  const schedules = scheduleData.schedules || [];
  const allWeekStatuses = scheduleData.weekStatuses || [];

  const { data: companyUsers = [] } = useQuery({
    queryKey: ['officerDirectory', 'scheduleFleet'],
    queryFn: async () => (await listOfficerDirectory('last_name', 1000)).filter(isOperationalOfficer),
    enabled: !!user,
    staleTime: 60000,
  });

  const vehicleAssignments = scheduleData.vehicleAssignments || [];
  const dutySupervisorAssignments = scheduleData.dutySupervisorAssignments || [];
  const scheduleLocations = scheduleData.locations || [];

  const intervalFor = (dateValue, startValue, endValue) => {
    const date = String(dateValue || '').slice(0, 10);
    const start = new Date(`${date}T${String(startValue || '00:00').slice(0,5)}:00`).getTime();
    let end = new Date(`${date}T${String(endValue || '00:00').slice(0,5)}:00`).getTime();
    if (end <= start) end += 24 * 60 * 60 * 1000;
    return [start, end];
  };
  const normalizeSite = value => String(value || '').split(':')[0].split(' - ')[0].trim().toLowerCase();
  const dutySupervisorForShift = shift => {
    const [shiftStart, shiftEnd] = intervalFor(shift.shift_date, shift.start_time, shift.end_time);
    return dutySupervisorAssignments.find(row => {
      if (String(row.status || '').toLowerCase() === 'cancelled') return false;
      const coverage = String(row.location || 'ALL');
      const locationMatches = coverage === 'ALL' || normalizeSite(coverage) === normalizeSite(shift.location);
      if (!locationMatches) return false;
      const [dutyStart, dutyEnd] = intervalFor(row.assignment_date, row.start_time, row.end_time);
      return dutyStart < shiftEnd && shiftStart < dutyEnd;
    });
  };
  const dedicatedSupervisorForShift = shift => {
    const location = scheduleLocations.find(row => normalizeSite(row.site_name) === normalizeSite(shift.location));
    const email = (location?.assigned_supervisors || [])[0];
    if (!email) return null;
    const person = companyUsers.find(row => String(row.email || '').toLowerCase() === String(email).toLowerCase());
    return { email, name: person ? `${person.rank || 'Supervisor'} ${person.last_name || person.first_name || ''}`.trim() : email, location: location?.site_name || shift.location };
  };

  useEffect(() => {
    if (!user?.email) return undefined;
    const unsubscribers = [];
    const subscribe = (entity, handler) => {
      try {
        const unsubscribe = entity.subscribe(handler);
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch (error) {
        console.warn('Schedule realtime subscription unavailable:', error?.message);
      }
    };

    subscribe(base44.entities.Schedule, () => {
      queryClient.invalidateQueries({ queryKey: ['myScheduleData', user.email] });
      queryClient.invalidateQueries({ queryKey: ['openShifts'] });
    });
    subscribe(base44.entities.ScheduleWeekStatus, () => {
      queryClient.invalidateQueries({ queryKey: ['myScheduleData', user.email] });
    });
    subscribe(base44.entities.VehicleAssignment, () => {
      queryClient.invalidateQueries({ queryKey: ['myScheduleData', user.email] });
    });
    subscribe(base44.entities.DutySupervisorAssignment, () => {
      queryClient.invalidateQueries({ queryKey: ['myScheduleData', user.email] });
    });

    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [user?.email, queryClient]);

  const approvedPTO = scheduleData.approvedPTO || [];
  const ptoLoading = schedulesLoading;

  const getCurrentPayrollPeriod = () => {
    if (!payrollPeriods) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    return payrollPeriods.find(p => p.start_date <= today && p.end_date >= today);
  };

  const currentPeriod = getCurrentPayrollPeriod();

  // Rolling five-day schedule window. Offset moves in five-day blocks.
  const today = startOfDay(new Date());
  const weekStart = addDays(today, currentWeekOffset * 5);
  const weekEnd = addDays(weekStart, 4);

  const { data: openShifts } = useQuery({
    queryKey: ['openShifts', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const allSchedules = await base44.entities.Schedule.filter(
        {
          is_open: true,
          officer_email: 'OPEN',
          shift_date: {
            gte: format(weekStart, 'yyyy-MM-dd'),
            lte: format(weekEnd, 'yyyy-MM-dd')
          }
        },
        'shift_date'
      );
      return allSchedules;
    },
    enabled: !!user,
  });

  const claimShiftMutation = useMutation({
    mutationFn: async (shiftId) => {
      const shift = openShifts?.find(s => s.id === shiftId);
      if (!shift) throw new Error('Shift not found');
      
      const result = await base44.functions.invoke('claimOpenShift', { shift_id: shiftId });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['openShifts'] });
      alert('Shift claimed successfully! Check your schedule.');
    },
  });

  const weekDays = React.useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const isDatePublished = React.useCallback((dateStr) => {
    if (!dateStr || !allWeekStatuses || !user?.email) return false;
    // ScheduleWeekStatus owns the actual publication window. Do not assume the
    // week starts on Sunday; payroll/schedule periods may start on another day.
    const status = allWeekStatuses.find(item =>
      item?.week_start_date && item?.week_end_date &&
      dateStr >= item.week_start_date && dateStr <= item.week_end_date
    );
    if (!status?.is_ready) return false;
    return !(status.unpublished_officer_emails || []).includes(user.email);
  }, [allWeekStatuses, user?.email]);

  const visibleSchedules = React.useMemo(() => {
    if (!schedules) return [];
    const windowStartStr = format(weekStart, 'yyyy-MM-dd');
    const windowEndStr = format(weekEnd, 'yyyy-MM-dd');
    return schedules.filter(s =>
      s.shift_date >= windowStartStr &&
      s.shift_date <= windowEndStr &&
      isDatePublished(s.shift_date)
    );
  }, [schedules, weekStart, weekEnd, isDatePublished]);

  const publishedOpenShifts = React.useMemo(() => {
    return (openShifts || []).filter(shift => isDatePublished(shift.shift_date));
  }, [openShifts, isDatePublished]);

  const getScheduleForDate = React.useCallback((date) => {
    if (!visibleSchedules) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    const previousDateStr = format(addDays(date, -1), 'yyyy-MM-dd');
    const sameDay = visibleSchedules.filter(s => s.shift_date === dateStr).map(s => ({ ...s, _carryover: false }));
    const carryovers = visibleSchedules
      .filter(s => s.shift_date === previousDateStr && minutesFromTime(s.end_time) <= minutesFromTime(s.start_time))
      .map(s => ({ ...s, _carryover: true, _display_date: dateStr }));
    return [...carryovers, ...sameDay].sort((a, b) => {
      if (a._carryover !== b._carryover) return a._carryover ? -1 : 1;
      return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });
  }, [visibleSchedules]);

  const checkPTOForDate = React.useCallback((date) => {
    if (!approvedPTO) return null;
    const dateStr = format(date, 'yyyy-MM-dd');
    return approvedPTO.find(pto => {
      const startDate = pto.start_date.split('T')[0];
      const endDate = pto.end_date.split('T')[0];
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [approvedPTO]);

  const openInMaps = (location) => {
    const address = location.includes(':')
      ? location.split(':')[1].trim()
      : location.includes(' - ')
      ? location.split(' - ')[1]
      : location;
    const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
    window.open(mapsUrl, '_blank');
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['myScheduleData', user?.email] });
    await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    await queryClient.invalidateQueries({ queryKey: ['myApprovedPTO'] });
    await queryClient.invalidateQueries({ queryKey: ['openShifts'] });
    await queryClient.invalidateQueries({ queryKey: ['myVehicleAssignments'] });
    await queryClient.invalidateQueries({ queryKey: ['dutySupervisorAssignments'] });
  };

  const getUserName = (email) => {
    const person = companyUsers.find(u => u.email === email);
    return person ? `${person.rank || 'Officer'} ${person.last_name || person.first_name || ''}`.trim() : email;
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="bps-command-page schedule-dark min-h-screen bg-[#080d16] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="text-[11px] font-black uppercase tracking-[.25em] text-cyan-300">Officer Scheduling</div><h1 className="mt-2 text-3xl font-black text-white md:text-4xl">My Schedule</h1><p className="mt-2 text-sm text-slate-400">Rolling five-day view · shifts, partners, fleet assignments, and duty supervisor coverage</p></div>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-xs font-bold text-emerald-300"><RefreshCw className="h-4 w-4"/><span>LIVE UPDATES ENABLED</span></div>
          </div>
        </section>
        {scheduleError && <div className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">Schedule data could not be loaded: {scheduleError.message}</div>}

        {currentPeriod && (
          <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-green-700" />
                <div>
                  <p className="font-bold text-emerald-200">Current Payroll Period: {currentPeriod.period_name}</p>
                  <p className="text-sm text-emerald-300">
                    {format(parseISO(currentPeriod.start_date), 'MMM d, yyyy')} - {format(parseISO(currentPeriod.end_date), 'MMM d, yyyy')} (14 days)
                  </p>
                  {currentPeriod.deposit_date && (
                    <p className="mt-1 text-xs text-emerald-400">
                      Direct Deposit: {format(parseISO(currentPeriod.deposit_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <Badge className="bg-green-600 text-white">Active Period</Badge>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm font-semibold text-white">Rolling 5-Day Schedule</div>
          <div className="text-xs text-slate-400">Today starts on the far left. Use the arrows to move backward or forward five days at a time.</div>
        </div>

        {(selectedPayrollPeriod === "all" || !selectedPayrollPeriod) && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Previous 5 Days</span><span className="sm:hidden">Previous</span>
            </Button>
            <div className="order-first text-center sm:order-none">
              <p className="font-bold text-white">
                {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-slate-400 sm:text-sm">
                5-day rolling schedule
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            >
              <span className="hidden sm:inline">Next 5 Days</span><span className="sm:hidden">Next</span>
              <ChevronRight className="ml-1 h-4 w-4 sm:ml-2" />
            </Button>
          </div>
        )}



        {(currentWeekOffset !== 0 && (selectedPayrollPeriod === "all" || !selectedPayrollPeriod)) && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(0)}
              className="bg-blue-50 text-blue-700"
            >
              Return to Today
            </Button>
          </div>
        )}


        {/* Open Shifts Section */}
        {publishedOpenShifts.length > 0 && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-6 h-6 text-green-600" />
                Available Open Shifts
              </CardTitle>
              <p className="text-sm text-slate-600">Claim shifts that work with your schedule</p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {publishedOpenShifts.map((shift) => (
                  <div key={shift.id} className="rounded-lg border border-green-800/60 bg-green-950/20 p-4 transition-all hover:border-green-600">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-green-600 text-white">OPEN SHIFT</Badge>
                          {shift.is_split_shift && (
                            <Badge className="bg-purple-600 text-white">Split Shift</Badge>
                          )}
                        </div>
                        <p className="font-bold text-white">
                          {format(parseISO(shift.shift_date), 'EEEE, MMM d, yyyy')}
                        </p>
                        <p className="text-slate-200">
                          <Clock className="mr-1 inline h-4 w-4" />
                          {shift.start_time} - {shift.end_time}
                        </p>
                        <p className="text-sm text-slate-400">
                          <MapPin className="mr-1 inline h-4 w-4" />
                          {shift.location}
                        </p>
                        {shift.special_instructions && (
                          <p className="text-sm text-blue-700 mt-2 bg-blue-50 p-2 rounded">
                            ℹ️ {shift.special_instructions}
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={async () => {
                          if (await confirmInApp(`Claim this shift on ${format(parseISO(shift.shift_date), 'MMM d, yyyy')} from ${shift.start_time} to ${shift.end_time} at ${shift.location}?`)) {
                            claimShiftMutation.mutate(shift.id);
                          }
                        }}
                        disabled={claimShiftMutation.isPending}
                        className="w-full bg-green-600 hover:bg-green-700 sm:ml-4 sm:w-auto"
                      >
                        {claimShiftMutation.isPending ? 'Claiming...' : 'Claim Shift'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(schedulesLoading || ptoLoading || !payrollPeriods) && (
          <div className="flex items-center justify-center gap-2 text-slate-500 py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading schedule...</span>
          </div>
        )}

        <div className="pb-2">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:grid md:grid-cols-5 md:overflow-visible">
            {weekDays.map((day) => {
              const daySchedules = getScheduleForDate(day);
              const ptoEntry = checkPTOForDate(day);
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              return (
                <Card key={day.toString()} className={`w-[calc(100vw-2.5rem)] max-w-[430px] shrink-0 snap-start overflow-hidden border border-slate-800 bg-slate-900 shadow-xl sm:w-[82vw] md:w-auto md:max-w-none md:shrink ${isToday ? 'ring-2 ring-blue-500/70' : ''}`}>
                  <CardHeader className={`${isToday ? 'bg-blue-950/40' : ptoEntry ? 'bg-green-950/30' : 'bg-slate-900'} border-b border-slate-800 px-3 py-3`}>
                    <CardTitle className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Calendar className={`h-4 w-4 ${isToday ? 'text-blue-400' : 'text-slate-500'}`} />
                          <span className="truncate text-sm font-black text-white">{format(day, 'EEE')}</span>
                          {isToday && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">TODAY</span>}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">{format(day, 'MMM d, yyyy')}</div>
                      </div>
                      {ptoEntry && <Badge className="bg-green-700 text-white">PTO</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="relative border-b border-slate-800 bg-[#08111d]" style={{ height: TIMELINE_HEIGHT }}>
                      {TIMELINE_HOURS.map(hour => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-slate-800/80"
                          style={{ top: hour * TIMELINE_HOUR_HEIGHT }}
                        >
                          <span className="absolute left-1 top-1 rounded bg-[#08111d]/95 px-1 text-[9px] font-bold text-slate-500">
                            {hourLabel(hour)}
                          </span>
                        </div>
                      ))}

                      {ptoEntry && (
                        <div className="absolute left-11 right-1 top-2 z-20 rounded-lg border border-green-700/60 bg-green-950/90 p-2 text-center shadow-lg">
                          <p className="text-xs font-black text-green-200">TIME OFF APPROVED</p>
                          <p className="mt-1 text-[10px] text-green-300">{ptoEntry.reason}</p>
                          {ptoEntry.admin_notes && <p className="mt-1 text-[9px] text-green-400">Admin: {ptoEntry.admin_notes}</p>}
                        </div>
                      )}

                      {!ptoEntry && daySchedules.length === 0 && (
                        <div className="absolute left-11 right-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/75 px-2 py-3 text-center text-[10px] font-bold text-slate-500" style={{ top: 8 * TIMELINE_HOUR_HEIGHT }}>
                          NO SHIFT
                        </div>
                      )}

                      {!ptoEntry && daySchedules.map(schedule => {
                        const placement = timelinePlacement(schedule, schedule._carryover === true);
                        const isSplitShift = schedule.is_split_shift === true || Boolean(schedule.linked_shift_id);
                        const duty = dutySupervisorForShift(schedule);
                        const dedicated = dedicatedSupervisorForShift(schedule);
                        const supervisorName = duty?.supervisor_name || (duty ? getUserName(duty.supervisor_email) : dedicated?.name);
                        const vehicle = vehicleAssignments.find(a =>
                          a.assignment_date === schedule.shift_date &&
                          (a.primary_officer_email === user?.email || a.partner_officer_email === user?.email) &&
                          (!a.start_time || a.start_time === schedule.start_time)
                        );
                        const detailTitle = [
                          `${schedule.start_time}–${schedule.end_time}${placement.crossesMidnight ? ' (continues next day)' : placement.carryover ? ' (continued from previous day)' : ''}`,
                          schedule.location,
                          schedule.partner_officer_email ? `Partner: ${getUserName(schedule.partner_officer_email)}` : '',
                          supervisorName ? `Supervisor: ${supervisorName}` : '',
                          vehicle?.vehicle_label ? `Vehicle: ${vehicle.vehicle_label}` : '',
                          schedule.site_details || '',
                          schedule.special_instructions || '',
                        ].filter(Boolean).join('\n');

                        return (
                          <div
                            key={schedule.id}
                            title={detailTitle}
                            className={`absolute left-11 right-1 z-10 overflow-hidden rounded-lg border p-2 shadow-lg ${isSplitShift ? 'border-purple-500/70 bg-purple-950/95' : 'border-blue-500/70 bg-blue-950/95'}`}
                            style={{ top: placement.top, height: placement.height }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-[11px] font-black text-white">{placement.carryover ? `12:00 AM–${schedule.end_time}` : `${schedule.start_time}–${schedule.end_time}`}</span>
                              {isSplitShift && <span className="rounded bg-purple-400/20 px-1 text-[8px] font-black text-purple-200">SPLIT</span>}
                            </div>
                            {placement.crossesMidnight && <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300">Continues next day</div>}
                            {placement.carryover && <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300">Continued from previous day</div>}
                            <button type="button" onClick={() => openInMaps(schedule.location)} className="mt-1 flex w-full items-start gap-1 text-left">
                              <MapPin className={`mt-0.5 h-3 w-3 shrink-0 ${isSplitShift ? 'text-purple-300' : 'text-blue-300'}`} />
                              <span className="line-clamp-2 text-[10px] font-semibold leading-3 text-slate-100">{schedule.location}</span>
                            </button>
                            {placement.height >= 92 && schedule.partner_officer_email && (
                              <div className="mt-1 flex items-center gap-1 truncate text-[9px] text-slate-300"><Users className="h-3 w-3 shrink-0 text-blue-300" />{getUserName(schedule.partner_officer_email)}</div>
                            )}
                            {placement.height >= 120 && supervisorName && (
                              <div className="mt-1 flex items-center gap-1 truncate text-[9px] text-cyan-200"><ShieldCheck className="h-3 w-3 shrink-0" />{supervisorName}</div>
                            )}
                            {placement.height >= 148 && vehicle?.vehicle_label && (
                              <div className="mt-1 flex items-center gap-1 truncate text-[9px] text-amber-200"><Car className="h-3 w-3 shrink-0" />{vehicle.vehicle_label}</div>
                            )}
                            {placement.height >= 210 && schedule.site_details && <p className="mt-2 line-clamp-3 border-t border-white/10 pt-1 text-[9px] leading-3 text-slate-300">{schedule.site_details}</p>}
                            {placement.height >= 270 && schedule.special_instructions && <p className="mt-1 line-clamp-3 text-[9px] leading-3 text-blue-200">{schedule.special_instructions}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}