import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, FileText, ChevronLeft, ChevronRight, Info, ExternalLink, RefreshCw, CalendarDays, Printer, AlertCircle, Car, Users } from "lucide-react";
import { format, addDays, startOfWeek, addWeeks, subWeeks, parseISO } from "date-fns";
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

  // Calculate display based on selected view
  let weekStartCalc, weekEndCalc;
  const today = new Date(); // Re-initialize today for date-fns calculations

  weekStartCalc = addWeeks(startOfWeek(today, { weekStartsOn: 0 }), currentWeekOffset);
  weekEndCalc = addDays(weekStartCalc, 6);

  const weekStart = weekStartCalc;
  const weekEnd = weekEndCalc;

  const { data: weekStatus } = useQuery({
    queryKey: ['scheduleWeekStatus', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const statuses = await base44.entities.ScheduleWeekStatus.list();
      return statuses.find(s => s.week_start_date === format(weekStart, 'yyyy-MM-dd'));
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

  const weekDays = React.useMemo(() => {
    const days = [];
    let currentDay = weekStart;
    while (currentDay <= weekEnd) {
      days.push(currentDay);
      currentDay = addDays(currentDay, 1);
    }
    return days;
  }, [weekStart, weekEnd]);

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

  // Check if we should show the warning banner (within 2 days of week start)
  const shouldShowWarning = React.useMemo(() => {
    if (weekStatus?.is_ready) return false;
    
    const today = new Date();
    const twoDaysBeforeWeekStart = addDays(weekStart, -2);
    
    return today >= twoDaysBeforeWeekStart;
  }, [weekStatus, weekStart]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Schedule</h1>
            <p className="text-slate-600">Your upcoming shifts and assignments</p>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 text-sm text-slate-600 mt-2">
            <RefreshCw className="w-4 h-4" />
            <span>Updates every 10 seconds</span>
          </div>

        {currentPeriod && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-green-700" />
                <div>
                  <p className="font-bold text-green-900">Current Payroll Period: {currentPeriod.period_name}</p>
                  <p className="text-sm text-green-700">
                    {format(parseISO(currentPeriod.start_date), 'MMM d, yyyy')} - {format(parseISO(currentPeriod.end_date), 'MMM d, yyyy')} (14 days)
                  </p>
                  {currentPeriod.deposit_date && (
                    <p className="text-xs text-green-600 mt-1">
                      Direct Deposit: {format(parseISO(currentPeriod.deposit_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <Badge className="bg-green-600 text-white">Active Period</Badge>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">Weekly Schedule View</div>
          <div className="text-xs text-slate-500">Sunday through Saturday. Use Previous Week and Next Week to move week by week.</div>
        </div>

        {(selectedPayrollPeriod === "all" || !selectedPayrollPeriod) && (
          <div className="flex items-center justify-between bg-slate-100 p-4 rounded-lg">
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous Week
            </Button>
            <div className="text-center">
              <p className="font-bold text-slate-900">
                Week of {format(weekStart, 'MMM d, yyyy')}
              </p>
              <p className="text-sm text-slate-600">
                {format(weekStart, 'MMM d')} to {format(weekEnd, 'MMM d, yyyy')} (7 days)
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
            >
              Next Week
              <ChevronRight className="w-4 h-4 ml-2" />
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
              Return to Current Week
            </Button>
          </div>
        )}

        {shouldShowWarning && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-700" />
              <div>
                <p className="font-bold text-yellow-900">Schedule Not Yet Published</p>
                <p className="text-sm text-yellow-700">
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
                  <div key={shift.id} className="bg-white p-4 rounded-lg border-2 border-green-200 hover:border-green-400 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-green-600 text-white">OPEN SHIFT</Badge>
                          {shift.is_split_shift && (
                            <Badge className="bg-purple-600 text-white">Split Shift</Badge>
                          )}
                        </div>
                        <p className="font-bold text-slate-900">
                          {format(parseISO(shift.shift_date), 'EEEE, MMM d, yyyy')}
                        </p>
                        <p className="text-slate-700">
                          <Clock className="w-4 h-4 inline mr-1" />
                          {shift.start_time} - {shift.end_time}
                        </p>
                        <p className="text-slate-600 text-sm">
                          <MapPin className="w-4 h-4 inline mr-1" />
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
                        className="bg-green-600 hover:bg-green-700 ml-4"
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

        <div className="grid gap-4">
          {weekDays.map((day) => {
            const daySchedules = getScheduleForDate(day);
            const ptoEntry = checkPTOForDate(day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

            return (
              <Card key={day.toString()} className={`border-none shadow-lg ${isToday ? 'ring-2 ring-blue-400' : ''}`}>
                <CardHeader className={`${isToday ? 'bg-gradient-to-r from-blue-50 to-purple-50' : ptoEntry ? 'bg-green-50' : 'bg-slate-50'}`}>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      <div>
                        <span className="text-slate-900">{format(day, 'EEEE')}</span>
                        {isToday && (
                          <span className="ml-2 text-sm font-normal text-blue-600">(Today)</span>
                        )}
                        {ptoEntry && (
                          <Badge className="ml-2 bg-green-600 text-white">
                            ✓ PTO Approved: {ptoEntry.reason}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-normal text-slate-600">
                      {format(day, 'MMM d, yyyy')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {ptoEntry ? (
                    <div className="text-center py-6 bg-green-50 rounded-lg border-2 border-green-200">
                      <p className="text-green-800 font-bold text-lg mb-2">✓ Time Off Approved</p>
                      <p className="text-sm text-green-700 font-semibold">{ptoEntry.reason}</p>
                      {ptoEntry.admin_notes && (
                        <p className="text-xs text-green-600 mt-2">Admin Note: {ptoEntry.admin_notes}</p>
                      )}
                    </div>
                  ) : daySchedules.length > 0 ? (
                    <div className="space-y-4">
                      {daySchedules.map((schedule) => {
                        const isSplitShift = schedule.is_split_shift === true;
                        
                        return (
                          <div key={schedule.id} className={`p-4 rounded-lg border ${isSplitShift ? 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-300' : 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200'}`}>
                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="flex items-center gap-3">
                                <Clock className={`w-5 h-5 ${isSplitShift ? 'text-purple-700' : 'text-blue-700'}`} />
                                <div>
                                  <p className={`text-sm font-medium ${isSplitShift ? 'text-purple-700' : 'text-blue-700'}`}>Shift Time</p>
                                  <p className={`text-lg font-bold ${isSplitShift ? 'text-purple-900' : 'text-blue-900'}`}>
                                    {schedule.start_time} to {schedule.end_time}
                                    {isSplitShift && <span className="ml-2 text-xs font-bold text-purple-700">(Split Shift)</span>}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <MapPin className={`w-5 h-5 ${isSplitShift ? 'text-purple-700' : 'text-blue-700'}`} />
                                <div className="flex-1">
                                  <p className={`text-sm font-medium ${isSplitShift ? 'text-purple-700' : 'text-blue-700'}`}>Location</p>
                                  <button
                                    onClick={() => openInMaps(schedule.location)}
                                    className={`text-lg font-bold ${isSplitShift ? 'text-purple-900 hover:text-purple-700' : 'text-blue-900 hover:text-blue-700'} underline decoration-dotted flex items-center gap-1 group`}
                                  >
                                    {schedule.location}
                                    <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            {(() => {
                              const vehicle = vehicleAssignments.find(a =>
                                a.assignment_date === schedule.shift_date &&
                                (a.primary_officer_email === user?.email || a.partner_officer_email === user?.email) &&
                                (!a.start_time || a.start_time === schedule.start_time)
                              );
                              if (!vehicle) return null;
                              const isPartner = vehicle.partner_officer_email === user?.email;
                              return (
                                <div className="mt-4 rounded-lg border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-3">
                                  <div className="flex items-center gap-2 text-sm font-bold text-amber-900"><Car className="h-4 w-4" />Assigned Fleet Vehicle</div>
                                  <div className="mt-1 text-lg font-black text-amber-950">{vehicle.vehicle_label}</div>
                                  {vehicle.partner_officer_name && <div className="mt-1 flex items-center gap-1 text-xs text-amber-800"><Users className="h-3 w-3" />Partner: {isPartner ? vehicle.primary_officer_name : vehicle.partner_officer_name}</div>}
                                  {vehicle.notes && <div className="mt-1 text-xs text-amber-700">{vehicle.notes}</div>}
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
                    <p className="text-center text-slate-500 py-6">No shifts scheduled</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}