import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, FileText, ChevronLeft, ChevronRight, Info, ExternalLink, RefreshCw, CalendarDays, Printer, AlertCircle, Car, Users } from "lucide-react";
import { format, addDays, startOfDay, startOfWeek, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import PullToRefresh from "../components/PullToRefresh";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/142cfda7d_VirtusSecurity.jpeg";

export default function Schedule() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [selectedPayrollPeriod] = useState("all");

  const queryClient = useQueryClient(); // Initialize query client

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      return periods;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules', user?.email],
    queryFn: async () => {
      const allSchedules = await base44.entities.Schedule.list('-shift_date');
      return allSchedules.filter(s => s.officer_email === user?.email);
    },
    enabled: !!user,
    refetchInterval: 10000, // Refetch every 10 seconds to catch schedule updates
  });

  // Query all week statuses to check which weeks are ready
  const { data: allWeekStatuses } = useQuery({
    queryKey: ['allWeekStatuses'],
    queryFn: () => base44.entities.ScheduleWeekStatus.list(),
    enabled: !!user,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { data: activeFleetVehicles = [] } = useQuery({
    queryKey: ['activeFleetVehicles'],
    queryFn: async () => {
      const rows = await base44.entities.Vehicle.list('vehicle_id');
      return rows.filter(v => v.status === 'Active');
    },
    enabled: !!user,
  });

  const { data: companySchedules = [] } = useQuery({
    queryKey: ['companySchedulesForFleet'],
    queryFn: () => base44.entities.Schedule.list('-shift_date'),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: companyUsers = [] } = useQuery({
    queryKey: ['companyUsersForFleet'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user,
    staleTime: 60000,
  });

  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ['myVehicleAssignments', user?.email],
    queryFn: async () => {
      const rows = await base44.entities.VehicleAssignment.list('-assignment_date');
      return rows.filter(a => a.primary_officer_email === user?.email || a.partner_officer_email === user?.email);
    },
    enabled: !!user?.email,
    refetchInterval: 10000,
  });

  const { data: approvedPTO, isLoading: ptoLoading } = useQuery({
    queryKey: ['myApprovedPTO'],
    queryFn: async () => {
      const requests = await base44.entities.TimeOffRequest.filter({
        created_by: user?.email,
        status: 'approved'
      });
      return requests;
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute
  });

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
  const publicationWeekStart = startOfWeek(weekStart, { weekStartsOn: 0 });

  const { data: weekStatus } = useQuery({
    queryKey: ['scheduleWeekStatus', format(publicationWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const statuses = await base44.entities.ScheduleWeekStatus.list();
      return statuses.find(s => s.week_start_date === format(publicationWeekStart, 'yyyy-MM-dd'));
    },
    enabled: !!user,
  });

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
      
      await base44.entities.Schedule.update(shiftId, {
        officer_email: user?.email,
        is_open: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['openShifts'] });
      alert('Shift claimed successfully! Check your schedule.');
    },
  });

  const weekDays = React.useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const visibleSchedules = React.useMemo(() => {
    if (!schedules) return [];
    
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    // Always show schedules - the ready flag is just for announcement
    return schedules.filter(s => {
      return s.shift_date >= weekStartStr && s.shift_date <= weekEndStr;
    });
  }, [schedules, weekStart, weekEnd]);

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
    await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    await queryClient.invalidateQueries({ queryKey: ['myApprovedPTO'] });
    await queryClient.invalidateQueries({ queryKey: ['openShifts'] });
    await queryClient.invalidateQueries({ queryKey: ['myVehicleAssignments'] });
  };

  const getUserName = (email) => {
    const person = companyUsers.find(u => u.email === email);
    return person ? `${person.rank || 'Officer'} ${person.last_name || person.first_name || ''}`.trim() : email;
  };

  const assignFleetVehicleToShift = async (schedule, selectedVehicleId) => {
    if (!selectedVehicleId) return;
    const vehicle = activeFleetVehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;
    const partner = companySchedules.find(s =>
      s.id !== schedule.id &&
      s.shift_date === schedule.shift_date &&
      s.location === schedule.location &&
      s.start_time === schedule.start_time &&
      s.end_time === schedule.end_time &&
      s.officer_email && s.officer_email !== 'OPEN'
    );
    const existing = vehicleAssignments.find(a =>
      a.assignment_date === schedule.shift_date &&
      a.primary_officer_email === user?.email &&
      a.start_time === schedule.start_time
    );
    const payload = {
      assignment_date: schedule.shift_date,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      vehicle_id: vehicle.id,
      vehicle_label: vehicle.vehicle_id,
      primary_officer_email: user.email,
      primary_officer_name: getUserName(user.email),
      partner_officer_email: partner?.officer_email || '',
      partner_officer_name: partner ? getUserName(partner.officer_email) : '',
      location: schedule.location || '',
      status: 'scheduled',
      notes: existing?.notes || '',
      created_by_email: user.email
    };
    if (existing?.id) await base44.entities.VehicleAssignment.update(existing.id, payload);
    else await base44.entities.VehicleAssignment.create(payload);
    await queryClient.invalidateQueries({ queryKey: ['myVehicleAssignments'] });
  };

  const printSchedule = () => {
    const allShiftsForPeriod = weekDays.flatMap(day => {
      const daySchedules = getScheduleForDate(day);
      const ptoEntry = checkPTOForDate(day);
      if (ptoEntry) {
        return [{
          isPTO: true,
          date: day,
          reason: ptoEntry.reason,
          admin_notes: ptoEntry.admin_notes
        }];
      }
      return daySchedules.map(s => ({ ...s, date: day }));
    });

    const sortedPrintableSchedules = allShiftsForPeriod.sort((a, b) => {
      const dateA = a.date.getTime();
      const dateB = b.date.getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      if (!a.isPTO && !b.isPTO) {
        const timeA = parseInt(a.start_time.replace(':', ''));
        const timeB = parseInt(b.start_time.replace(':', ''));
        
        const sortTimeA = timeA < 600 ? timeA + 2400 : timeA;
        const sortTimeB = timeB < 600 ? timeB + 2400 : timeB;
        
        return sortTimeA - sortTimeB;
      }
      return 0;
    });

    const scheduleHTML = sortedPrintableSchedules.map(item => {
      if (item.isPTO) {
        return `
          <div class="shift-item pto-item">
            <div class="shift-date">${format(item.date, 'EEEE, MMMM d, yyyy')}</div>
            <div class="shift-details pto-details">
              <div class="detail-row"><strong>Time Off:</strong> ${item.reason}</div>
              ${item.admin_notes ? `<div class="detail-row"><strong>Admin Notes:</strong> ${item.admin_notes}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        // Check if this shift is explicitly marked as a split shift
        const isSplitShift = item.is_split_shift === true;
        
        return `
          <div class="shift-item ${isSplitShift ? 'split-shift-item' : ''}">
            <div class="shift-date">${format(item.date, 'EEEE, MMMM d, yyyy')}</div>
            <div class="shift-details">
              <div class="detail-row"><strong>Time:</strong> ${item.start_time} - ${item.end_time}${isSplitShift ? ' <span class="split-badge">(Split Shift)</span>' : ''}</div>
              <div class="detail-row"><strong>Location:</strong> ${item.location}</div>
              ${item.site_details ? `<div class="detail-row"><strong>Site Details:</strong> ${item.site_details}</div>` : ''}
              ${item.special_instructions ? `<div class="detail-row special"><strong>Special Instructions:</strong> ${item.special_instructions}</div>` : ''}
            </div>
          </div>
        `;
      }
    }).join('');

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>My Schedule - ${user?.full_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.4in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.3; color: #000; }
          .header { text-align: center; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 2px solid #000; page-break-after: avoid; }
          .logo { width: 50px; height: 50px; object-fit: contain; margin: 0 auto 6px; display: block; }
          .header h1 { font-size: 18pt; font-weight: bold; margin: 4px 0; }
          .header .officer { font-size: 11pt; margin: 2px 0; }
          .header .date-range { font-size: 9pt; color: #666; margin-top: 4px; }
          .notice { background: #fef3c7; padding: 10px; margin: 10px 0; border-left: 4px solid #f59e0b; font-size: 8pt; }
          .shift-item { margin: 8px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px; page-break-inside: avoid; background: #f9f9f9; }
          .pto-item { background: #e6ffe6; border-color: #88cc88; }
          .split-shift-item { background: #f3e8ff; border-color: #a855f7; border-width: 2px; }
          .shift-date { font-weight: bold; font-size: 10pt; margin-bottom: 4px; color: #1e40af; }
          .shift-details { padding-left: 8px; }
          .detail-row { margin: 3px 0; font-size: 9pt; }
          .detail-row strong { display: inline-block; width: 140px; color: #374151; }
          .split-badge { color: #7c3aed; font-weight: bold; }
          .special { background: #fef3c7; padding: 4px; margin-top: 4px; border-left: 3px solid #f59e0b; }
          .pto-details { color: #228b22; }
          .footer { margin-top: 15px; padding-top: 8px; border-top: 2px solid #000; text-align: center; font-size: 8pt; color: #666; }
          .page-header { display: none; }
          @media print {
            .shift-item { page-break-inside: avoid; }
            .page-header {
              display: block;
              position: running(header);
              text-align: center;
              padding: 8px 0;
              border-bottom: 1px solid #ccc;
              margin-bottom: 10px;
              font-size: 9pt;
              color: #333;
            }
            @page {
              @top-center { content: element(header); }
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${LOGO_URL}" alt="Black Point Protection" class="logo" />
          <h1>Officer Schedule</h1>
          <div class="officer">${user?.full_name}</div>
          <div class="date-range">
            ${format(weekStart, 'MMM d')} -
            ${format(weekEnd, 'MMM d, yyyy')}
          </div>
        </div>

        <div class="notice">
          <strong>⚠️ Split Shift Notice:</strong> Purple highlighted shifts are split shifts that require working multiple sites. 
          You are expected to work both sites on the shift starting from the date shown. These are marked by the scheduling team.
        </div>

        ${scheduleHTML || '<p style="text-align: center; padding: 20px; color: #999;">No shifts or time off scheduled for this period.</p>'}

        <div class="footer">
          <strong>BLACK POINT PROTECTION SERVICES</strong> | Richmond, VA<br/>
          Printed: ${format(new Date(), 'MMM d, yyyy h:mm a')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Publication status still follows the Sunday-based admin schedule week.
  const shouldShowWarning = React.useMemo(() => {
    if (weekStatus?.is_ready) return false;
    const twoDaysBeforeWeekStart = addDays(publicationWeekStart, -2);
    return new Date() >= twoDaysBeforeWeekStart;
  }, [weekStatus, publicationWeekStart]);

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
            <span>Updates every 10 seconds</span>
          </div>

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

        {shouldShowWarning && (
          <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 text-amber-400" />
              <div>
                <p className="font-bold text-amber-200">Schedule Not Yet Published</p>
                <p className="text-sm text-amber-300/80">
                  The schedule for this week is still being finalized. Check back later or contact your supervisor.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Open Shifts Section */}
        {openShifts && openShifts.length > 0 && weekStatus?.is_ready && (
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
                {openShifts.map((shift) => (
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
                        onClick={() => {
                          if (confirm(`Claim this shift on ${format(parseISO(shift.shift_date), 'MMM d, yyyy')} from ${shift.start_time} to ${shift.end_time} at ${shift.location}?`)) {
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
              <Card key={day.toString()} className={`w-[88vw] max-w-[420px] shrink-0 snap-start overflow-hidden border border-slate-800 bg-slate-900 shadow-xl md:w-auto md:max-w-none md:shrink ${isToday ? 'ring-2 ring-blue-500/70' : ''}`}>
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