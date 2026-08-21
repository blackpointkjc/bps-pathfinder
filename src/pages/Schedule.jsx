import { confirmInApp } from '@/lib/inAppDialog';
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, FileText, ChevronLeft, ChevronRight, Info, ExternalLink, RefreshCw, CalendarDays, Car, Users } from "lucide-react";
import { format, addDays, startOfDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import PullToRefresh from "../components/PullToRefresh";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export default function Schedule() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [selectedPayrollPeriod] = useState("all");

  const queryClient = useQueryClient(); // Initialize query client

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: scheduleData = {}, isLoading: schedulesLoading, error: scheduleError } = useQuery({
    queryKey: ['myScheduleData', user?.email],
    queryFn: async () => {
      const result = await base44.functions.invoke('getMyScheduleData', {});
      const payload = result?.data || result || {};
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
    const daySchedules = visibleSchedules.filter(s => s.shift_date === dateStr) || [];
    
    // Sort by time, treating early morning times (00-05) as late night (after 23:59)
    return daySchedules.sort((a, b) => {
      const timeA = parseInt(a.start_time.replace(':', ''));
      const timeB = parseInt(b.start_time.replace(':', ''));
      
      // Treat times 0000-0559 as "late night" (add 2400 to sort them after 2300)
      const sortTimeA = timeA < 600 ? timeA + 2400 : timeA;
      const sortTimeB = timeB < 600 ? timeB + 2400 : timeB;
      
      return sortTimeA - sortTimeB;
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
  };

  const getUserName = (email) => {
    const person = companyUsers.find(u => u.email === email);
    return person ? `${person.rank || 'Officer'} ${person.last_name || person.first_name || ''}`.trim() : email;
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="schedule-dark min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">My Schedule</h1>
            <p className="text-slate-400">Rolling five-day view · shifts, partners, and fleet assignments</p>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 text-sm text-slate-600 mt-2">
            <RefreshCw className="w-4 h-4" />
            <span>Live updates enabled</span>
          </div>
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
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-5">
          {weekDays.map((day) => {
            const daySchedules = getScheduleForDate(day);
            const ptoEntry = checkPTOForDate(day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

            return (
              <Card key={day.toString()} className={`w-[calc(100vw-2.5rem)] max-w-[430px] shrink-0 snap-start overflow-hidden border border-slate-800 bg-slate-900 shadow-xl sm:w-[82vw] md:w-auto md:max-w-none md:shrink ${isToday ? 'ring-2 ring-blue-500/70' : ''}`}>
                <CardHeader className={`${isToday ? 'bg-blue-950/40' : ptoEntry ? 'bg-green-950/30' : 'bg-slate-900'} border-b border-slate-800 px-4 py-3`}>
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
                <CardContent className="p-2.5 sm:min-h-[170px] xl:min-h-[190px]">
                  {ptoEntry ? (
                    <div className="rounded-lg border border-green-800/60 bg-green-950/20 py-6 text-center">
                      <p className="mb-2 text-lg font-bold text-green-300">✓ Time Off Approved</p>
                      <p className="text-sm font-semibold text-green-400">{ptoEntry.reason}</p>
                      {ptoEntry.admin_notes && (
                        <p className="mt-2 text-xs text-green-500">Admin Note: {ptoEntry.admin_notes}</p>
                      )}
                    </div>
                  ) : daySchedules.length > 0 ? (
                    <div className="space-y-4">
                      {daySchedules.map((schedule) => {
                        const isSplitShift = schedule.is_split_shift === true;
                        
                        return (
                          <div key={schedule.id} className={`rounded-xl border p-2.5 ${isSplitShift ? 'border-purple-700/60 bg-purple-950/20' : 'border-blue-700/50 bg-blue-950/20'}`}>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Clock className={`h-4 w-4 ${isSplitShift ? 'text-purple-400' : 'text-blue-400'}`} />
                                  <span className="text-sm font-black text-white xl:text-[13px]">{schedule.start_time}–{schedule.end_time}</span>
                                </div>
                                {isSplitShift && <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">SPLIT</span>}
                              </div>
                              <button onClick={() => openInMaps(schedule.location)} className="group flex w-full items-start gap-2 text-left">
                                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${isSplitShift ? 'text-purple-400' : 'text-blue-400'}`} />
                                <span className="min-w-0 break-words text-[11px] font-semibold leading-4 text-slate-200 group-hover:text-white">{schedule.location}</span>
                                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-600 group-hover:text-slate-300" />
                              </button>
                            </div>
                            {schedule.partner_officer_email && (
                              <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-2">
                                <Users className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                                <div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Partner</div><div className="truncate text-[11px] font-semibold text-white">{getUserName(schedule.partner_officer_email)}</div></div>
                              </div>
                            )}
                            {(() => {
                              const vehicle = vehicleAssignments.find(a =>
                                a.assignment_date === schedule.shift_date &&
                                (a.primary_officer_email === user?.email || a.partner_officer_email === user?.email) &&
                                (!a.start_time || a.start_time === schedule.start_time)
                              );
                              const isPartner = vehicle?.partner_officer_email === user?.email;
                              if (!vehicle) return null;
                              return (
                                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 px-2.5 py-2">
                                  <Car className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[9px] font-bold uppercase tracking-wide text-amber-400">Fleet Vehicle</div>
                                    <div className="truncate text-[12px] font-black text-amber-200">{vehicle.vehicle_label}</div>
                                    {vehicle.partner_officer_name && <div className="mt-0.5 truncate text-[9px] text-amber-300/80">Assigned with {isPartner ? vehicle.primary_officer_name : vehicle.partner_officer_name}</div>}
                                  </div>
                                </div>
                              );
                            })()}
                            {schedule.site_details && (
                              <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                                <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                                  <Info className="w-3 h-3" />
                                  Site Details
                                </p>
                                <p className="text-sm text-slate-700">{schedule.site_details}</p>
                              </div>
                            )}
                            {schedule.special_instructions && (
                              <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                                <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  Special Instructions
                                </p>
                                <p className="text-sm text-slate-700">{schedule.special_instructions}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-7 text-center">
                      <div className="text-[11px] font-medium text-slate-600">NO SHIFT</div>
                    </div>
                  )}
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