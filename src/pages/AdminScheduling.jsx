import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Calendar, Trash2, ChevronLeft, ChevronRight, Plus, Printer, User, RefreshCw, CalendarDays, Pencil, AlertTriangle, X, Clock, DollarSign, CheckCircle, Wand2, TrendingUp, Users } from "lucide-react";
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, parseISO } from "date-fns";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MobileResponsiveDialog,
  MobileResponsiveDialogContent,
  MobileResponsiveDialogHeader,
  MobileResponsiveDialogTitle,
} from "../components/MobileResponsiveDialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import AISchedulingAssistant from "../components/scheduling/AISchedulingAssistant";
import AIPerformanceAnalyzer from "../components/scheduling/AIPerformanceAnalyzer";
import AIOpenShiftManager from "../components/scheduling/AIOpenShiftManager";
import LocationHourCard from "../components/scheduling/LocationHourCard";
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/857a5f1c1_UntitledProject3.png";

export default function AdminScheduling() {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [selectedOfficerForPrint, setSelectedOfficerForPrint] = useState("");
  const [printStartDate, setPrintStartDate] = useState("");
  const [printEndDate, setPrintEndDate] = useState("");
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [scheduleViewType, setScheduleViewType] = useState("weekly"); // weekly, biweekly, monthly
  const [showAddDialog, setShowAddDialog] = useState(false); // Renamed from showAddShiftDialog
  const [editingShift, setEditingShift] = useState(null); // NEW
  const [showEditDialog, setShowEditDialog] = useState(false); // NEW
  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState("all");
  const [generatingPeriods, setGeneratingPeriods] = useState(false);
  const [showAIImportDialog, setShowAIImportDialog] = useState(false); // New state for AI import dialog
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null); // New state for uploaded document URL
  const [uploadingDocument, setUploadingDocument] = useState(false); // New state for document upload status
  const [importingSchedule, setImportingSchedule] = useState(false); // New state for AI import status
  const [newShift, setNewShift] = useState({
    officer_email: "",
    shift_date: "", // This will now consistently represent the START date of the shift
    start_time: "",
    end_time: "",
    location: "",
    shift_type: "normal",
    is_open: false,
    is_split_shift: false,
    linked_shift_id: "", // Added linked_shift_id to newShift state
  });
  const [showOverlapReport, setShowOverlapReport] = useState(false);
  const [overlapResults, setOverlapResults] = useState(null);
  const [showSelectiveCopyDialog, setShowSelectiveCopyDialog] = useState(false);
  const [selectedOfficersForCopy, setSelectedOfficersForCopy] = useState(new Set());
  const [applyToWholeWeek, setApplyToWholeWeek] = useState(false);
  const [weekShifts, setWeekShifts] = useState([
    { day: 'Sunday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Monday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Tuesday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Wednesday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Thursday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Friday', date: '', start_time: '', end_time: '', location: '' },
    { day: 'Saturday', date: '', start_time: '', end_time: '', location: '' },
  ]);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showPerformanceAnalyzer, setShowPerformanceAnalyzer] = useState(false);
  const [showOpenShiftManager, setShowOpenShiftManager] = useState(false);


  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const allDivisions = await base44.entities.Division.list('division_name');
      return allDivisions.filter(d => d.active);
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await base44.entities.Location.list('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
    enabled: !!user,
    staleTime: 60000,
  });

  const { data: schedules } = useQuery({
    queryKey: ['allSchedules'],
    queryFn: () => base44.entities.Schedule.list('-shift_date'),
    enabled: user?.role === 'admin',
    staleTime: 30000,
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      return periods;
    },
    enabled: user?.role === 'admin',
    staleTime: 5 * 60 * 1000,
  });

  const { data: plannedShifts } = useQuery({
    queryKey: ['plannedShifts'],
    queryFn: () => base44.entities.PlannedShift.filter({ active: true }),
    enabled: user?.role === 'admin',
    staleTime: 5 * 60 * 1000,
  });

  const { data: weekStatus } = useQuery({
    queryKey: ['scheduleWeekStatus', format(addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), currentWeekOffset), 'yyyy-MM-dd')],
    queryFn: async () => {
      const weekStartForQuery = format(addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), currentWeekOffset), 'yyyy-MM-dd');
      const statuses = await base44.entities.ScheduleWeekStatus.list();
      return statuses.find(s => s.week_start_date === weekStartForQuery);
    },
    enabled: user?.role === 'admin',
  });

  const markWeekReadyMutation = useMutation({
    mutationFn: async (isReady) => {
      const currentWeekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), currentWeekOffset);
      const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
      const weekEndStr = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd');

      if (weekStatus) {
        // Update existing
        await base44.entities.ScheduleWeekStatus.update(weekStatus.id, {
          is_ready: isReady,
          marked_ready_by: user?.email,
          marked_ready_date: new Date().toISOString()
        });
      } else {
        // Create new
        await base44.entities.ScheduleWeekStatus.create({
          week_start_date: weekStartStr,
          week_end_date: weekEndStr,
          is_ready: isReady,
          marked_ready_by: user?.email,
          marked_ready_date: new Date().toISOString()
        });
      }

      // If marking as ready, send announcement
      if (isReady) {
        await base44.entities.Announcement.create({
          title: `📅 Week Schedule Ready: ${format(currentWeekStart, 'MMM d')} - ${format(addDays(currentWeekStart, 6), 'MMM d, yyyy')}`,
          message: `The schedule for the week of ${format(currentWeekStart, 'MMMM d')} to ${format(addDays(currentWeekStart, 6), 'MMMM d, yyyy')} is now available. Please check your schedule in Black Point Portal and note any changes to your shifts.`,
          priority: 'important'
        });
      }
      
      return isReady;
    },
    onSuccess: (isReady) => {
      queryClient.invalidateQueries({ queryKey: ['scheduleWeekStatus'] });
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      alert(isReady ? 'Week schedule published and announcement sent!' : 'Week schedule hidden from officers and clients');
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: (data) => base44.entities.Schedule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      setShowAddDialog(false); // Updated here
      setNewShift({
        officer_email: "",
        shift_date: "",
        start_time: "",
        end_time: "",
        location: "",
        is_open: false,
        is_split_shift: false,
        linked_shift_id: "",
      });
    },
  });

  const bulkCreateShiftsMutation = useMutation({
    mutationFn: (shiftsArray) => base44.entities.Schedule.bulkCreate(shiftsArray),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      alert('Schedule copied successfully from previous week!');
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Schedule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      alert('Shift updated successfully!');
    },
    onError: (error) => {
      console.error("Error updating shift:", error);
      alert('Failed to update shift: ' + error.message);
    }
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id) => base44.entities.Schedule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      alert('Shift deleted successfully!');
    },
    onError: (error) => {
      console.error("Error deleting shift:", error);
      alert('Failed to delete shift: ' + error.message);
    }
  });

  const clearAllShiftsMutation = useMutation({
    mutationFn: async () => {
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // Filter shifts whose *start date* is within the current displayed week
      const shiftsToDelete = schedules?.filter(s => {
        return s.shift_date >= weekStartStr && s.shift_date <= weekEndStr;
      }) || [];

      if (shiftsToDelete.length === 0) {
        alert('No shifts found in the current week to clear.');
        return;
      }

      // Process deletions sequentially to avoid concurrent deletion errors
      const errors = [];
      for (const shift of shiftsToDelete) {
        try {
          await base44.entities.Schedule.delete(shift.id);
        } catch (error) {
          // If shift not found, it may have been already deleted - skip error
          if (!error.message?.includes('not found')) {
            errors.push(`${shift.location} on ${shift.shift_date}: ${error.message}`);
          }
        }
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (errors.length > 0) {
        console.error("Some shifts failed to delete:", errors);
        throw new Error(`Failed to delete ${errors.length} shift(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSchedules'] });
      alert('All shifts for the current week cleared successfully!');
    },
    onError: (error) => {
      console.error("Error clearing shifts:", error);
      alert('Failed to clear some shifts. Please refresh and try again.');
    }
  });

  const getOfficerName = useCallback((email) => {
    if (email === "OPEN") return "OPEN SHIFT";
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return officer?.full_name || email;
  }, [allUsers]);

  const getOfficerRank = useCallback((email) => {
    if (email === "OPEN") return "";
    const officer = allUsers?.find(u => u.email === email);
    return officer?.rank || "Unarmed Officer";
  }, [allUsers]);

  const getOfficerUnitNumber = useCallback((email) => {
    if (email === "OPEN") return "";
    const officer = allUsers?.find(u => u.email === email);
    return officer?.unit_number || "";
  }, [allUsers]);

  const calculateShiftHours = useCallback((startTime, endTime) => {
    const start = parseInt(startTime.replace(':', ''));
    const end = parseInt(endTime.replace(':', ''));
    let hours = 0;
    if (end < start) {
      hours = ((2400 - start) + end) / 100;
    } else {
      hours = (end - start) / 100;
    }
    return hours;
  }, []);

  const getScheduleForDateOfficerAndLocation = useCallback((date, officerEmail, locationSiteName) => {
    if (!schedules) return [];
    const dateStr = format(date, 'yyyy-MM-dd');

    return schedules.filter(s => {
      const scheduleLocationName = s.location.split(':')[0].trim();
      
      // Only show shifts that have this exact date as their shift_date
      // Do NOT show split shifts on the "next day" - only on their stored date
      return s.shift_date === dateStr &&
             s.officer_email === officerEmail &&
             scheduleLocationName === locationSiteName.trim();
    }).sort((a, b) => {
      // Regular shifts come first, split shifts come last
      if (!a.is_split_shift && b.is_split_shift) return -1;
      if (a.is_split_shift && !b.is_split_shift) return 1;
      
      // If both are split shifts or both are regular, sort by time
      const timeA = a.start_time.replace(':', '');
      const timeB = b.start_time.replace(':', '');
      return timeA.localeCompare(timeB);
    });
  }, [schedules]);

  const getOfficerScheduleForDateRange = useCallback((officerEmail, startDate, endDate) => {
    const rangeSchedules = schedules?.filter(s => {
      const shiftDate = s.shift_date; // This is the START date of the shift
      const shiftStartDate = parseISO(shiftDate);
      const shiftEndDate = s.is_split_shift ? addDays(shiftStartDate, 1) : shiftStartDate;

      // Check if the shift's start OR end falls within the print range
      return s.officer_email === officerEmail &&
             shiftStartDate <= parseISO(endDate) &&
             shiftEndDate >= parseISO(startDate);
    }) || [];

    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    let totalOvertimeHours = 0;
    let totalRegularHours = 0;
    let currentWeekStart = new Date(start);
    
    while (currentWeekStart <= end) {
      const currentWeekEnd = addDays(currentWeekStart, 6);
      
      const weekSegmentEnd = currentWeekEnd > end ? end : currentWeekEnd;
      
      const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekSegmentEnd, 'yyyy-MM-dd');
      
      const weekSchedules = rangeSchedules.filter(s => {
        const sShiftDate = parseISO(s.shift_date);
        const sEndShiftDate = s.is_split_shift ? addDays(sShiftDate, 1) : sShiftDate;
        
        // A shift counts for this week if its start date is in the week, OR
        // if it's a split shift that ends in this week but started before the week.
        return (sShiftDate >= parseISO(weekStartStr) && sShiftDate <= parseISO(weekEndStr)) ||
               (s.is_split_shift && sShiftDate < parseISO(weekStartStr) && sEndShiftDate >= parseISO(weekStartStr));
      });
      
      const weekHours = weekSchedules.reduce((sum, s) => {
        return sum + calculateShiftHours(s.start_time, s.end_time);
      }, 0);
      
      if (weekHours > 40) {
        totalOvertimeHours += (weekHours - 40);
        totalRegularHours += 40;
      } else {
        totalRegularHours += weekHours;
      }
      
      currentWeekStart = addDays(currentWeekStart, 7);
    }
    
    const totalHours = totalRegularHours + totalOvertimeHours;
    const hasOvertime = totalOvertimeHours > 0;

    return {
      schedules: rangeSchedules,
      totalHours,
      hasOvertime,
      overtimeHours: totalOvertimeHours,
      regularHours: totalRegularHours
    };
  }, [schedules, calculateShiftHours]);

  // Helper function to determine if a shift is an overnight shift
  const isOvernightShift = (startTime, endTime) => {
    const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    return endMinutes <= startMinutes;
  };

  const getStartingOnSchedulesForDate = useCallback((date, showOvernightContinuation = false, includeOvernightStartingYesterday = false) => {
    if (!schedules) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    const yesterdayStr = format(addDays(date, -1), 'yyyy-MM-dd');
    
    let result = schedules.filter(s => {
      // Check for shifts that *start* on the given date
      if (s.shift_date === dateStr) {
        // If showOvernightContinuation is true, and it's an overnight shift, include it
        // Otherwise, if it's not an overnight shift, include it.
        // This ensures shifts starting on `date` are included, handling the overnight flag.
        return showOvernightContinuation || !isOvernightShift(s.start_time, s.end_time);
      }
      // Check for shifts that *started yesterday* and are overnight, meaning they *end* on the given date
      if (includeOvernightStartingYesterday && s.shift_date === yesterdayStr) {
        return isOvernightShift(s.start_time, s.end_time);
      }
      return false;
    });

    return result;
  }, [schedules]);

  const getCurrentPayrollPeriod = useCallback(() => {
    if (!payrollPeriods) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    return payrollPeriods.find(p => p.start_date <= today && p.end_date >= today);
  }, [payrollPeriods]);

  const rankOrder = useMemo(() => ([
    "Colonel (Operations Manager)",
    "Major (Operations Supervisor)",
    "Supervisor",
    "Captain",
    "Lieutenant",
    "Sergeant",
    "Corporal",
    "Armed Officer",
    "Unarmed Officer"
  ]), []);

  const sortOfficersByUnitNumber = useCallback((officerEmails) => {
    return Array.from(officerEmails).sort((a, b) => {
      if (a === "OPEN") return 1;
      if (b === "OPEN") return -1;

      const unitA = getOfficerUnitNumber(a);
      const unitB = getOfficerUnitNumber(b);
      
      if (unitA && unitB) {
        const numA = parseInt(unitA);
        const numB = parseInt(unitB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return unitA.localeCompare(unitB);
      }
      
      if (unitA && !unitB) return -1;
      if (!unitA && unitB) return 1;
      
      const rankA = getOfficerRank(a);
      const rankB = getOfficerRank(b);
      const indexA = rankOrder.indexOf(rankA);
      const indexB = rankOrder.indexOf(b);
      const finalIndexA = indexA === -1 ? rankOrder.length : indexA;
      const finalIndexB = indexB === -1 ? rankOrder.length : indexB;
      return finalIndexA - finalIndexB;
    });
  }, [getOfficerUnitNumber, getOfficerRank, rankOrder]);

  const currentPeriod = getCurrentPayrollPeriod();

  // Calculate display based on selected view
  let weekStartCalc, weekEndCalc;
  const today = new Date();

  if (selectedPayrollPeriod === "all" || !selectedPayrollPeriod) {
    // Use scheduleViewType to determine days
    weekStartCalc = addWeeks(startOfWeek(today, { weekStartsOn: 0 }), currentWeekOffset);
    if (scheduleViewType === "weekly") {
      weekEndCalc = addDays(weekStartCalc, 6); // 7 days
    } else if (scheduleViewType === "biweekly") {
      weekEndCalc = addDays(weekStartCalc, 13); // 14 days
    } else if (scheduleViewType === "monthly") {
      weekEndCalc = addDays(weekStartCalc, 29); // 30 days
    } else {
      weekEndCalc = addDays(weekStartCalc, 6); // default to weekly
    }
  } else if (selectedPayrollPeriod === "current") {
    // Current payroll period - 14 days
    weekStartCalc = currentPeriod ? parseISO(currentPeriod.start_date) : startOfWeek(today, { weekStartsOn: 0 });
    weekEndCalc = currentPeriod ? parseISO(currentPeriod.end_date) : addDays(startOfWeek(today, { weekStartsOn: 0 }), 6);
  } else {
    // Specific payroll period - 14 days
    const selectedPeriodData = payrollPeriods?.find(p => p.id === selectedPayrollPeriod);
    weekStartCalc = selectedPeriodData ? parseISO(selectedPeriodData.start_date) : startOfWeek(today, { weekStartsOn: 0 });
    weekEndCalc = selectedPeriodData ? parseISO(selectedPeriodData.end_date) : addDays(startOfWeek(today, { weekStartsOn: 0 }), 6);
  }

  const weekStart = weekStartCalc;
  const weekEnd = weekEndCalc;

  const weekDays = useMemo(() => {
    const days = [];
    let currentDay = weekStart;
    while (currentDay <= weekEnd) {
      days.push(currentDay);
      currentDay = addDays(currentDay, 1);
    }
    return days;
  }, [weekStart, weekEnd]);

  const weekDivisionalSchedules = useMemo(() => {
    if (!schedules) return [];
    
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    // Only include schedules where shift_date is within the displayed week
    const schedulesInRange = schedules.filter(s => {
      const shiftDate = s.shift_date;
      return shiftDate >= weekStartStr && shiftDate <= weekEndStr;
    });

    if (selectedDivision === "all") {
      return schedulesInRange;
    }

    return schedulesInRange.filter(s => {
      const locationSiteName = s.location.split(':')[0].trim();
      const location = locations?.find(l => l.site_name === locationSiteName);
      return (location?.subdivision === selectedDivision || location?.division === selectedDivision) || !location;
    });
  }, [schedules, selectedDivision, locations, weekStart, weekEnd]);

  const locationGroups = useMemo(() => {
    const groups = {};
    weekDivisionalSchedules.forEach(schedule => {
      const locationSiteName = schedule.location.split(':')[0].trim();
      if (!groups[locationSiteName]) {
        groups[locationSiteName] = new Set();
      }
      groups[locationSiteName].add(schedule.officer_email);
    });
    return groups;
  }, [weekDivisionalSchedules]);

  const divisionGroups = useMemo(() => {
    if (!weekDivisionalSchedules || !locations) return {};
    
    const groups = {};
    
    weekDivisionalSchedules.forEach(schedule => {
      const locationSiteName = schedule.location.split(':')[0].trim();
      // Try exact match first, then partial match for locations like "St. Paul's"
      let location = locations.find(l => l.site_name === locationSiteName);
      if (!location) {
        // Try partial match - find location that contains the site name or vice versa
        location = locations.find(l => 
          l.site_name.toLowerCase().includes(locationSiteName.toLowerCase()) ||
          locationSiteName.toLowerCase().includes(l.site_name.toLowerCase())
        );
      }
      const subdivision = location?.subdivision || location?.division || 'Unassigned';
      
      if (!groups[subdivision]) {
        groups[subdivision] = {};
      }
      
      if (!groups[subdivision][locationSiteName]) {
        groups[subdivision][locationSiteName] = {
          address: location?.address || '',
          officers: new Set(),
          schedules: []
        };
      }
      
      groups[subdivision][locationSiteName].officers.add(schedule.officer_email);
      groups[subdivision][locationSiteName].schedules.push(schedule);
    });
    
    return groups;
  }, [weekDivisionalSchedules, locations]);

  const activeOfficers = useMemo(() => allUsers?.filter(u => !u.termination_date) || [], [allUsers]);

  useEffect(() => {
    const generatePayrollPeriods = async () => {
      if (!payrollPeriods || payrollPeriods.length > 0) return;
      if (generatingPeriods) return;

      setGeneratingPeriods(true);
      try {
        const exactPeriods = [
          { period_name: "PP 27-2024", start_date: "2024-11-22", end_date: "2024-12-05", deposit_date: "2024-12-20", year: 2024, period_number: 27 },
          { period_name: "PP 01-2025", start_date: "2024-12-06", end_date: "2024-12-19", deposit_date: "2025-01-03", year: 2025, period_number: 1 },
          { period_name: "PP 02-2025", start_date: "2024-12-20", end_date: "2025-01-02", deposit_date: "2025-01-17", year: 2025, period_number: 2 },
          { period_name: "PP 03-2025", start_date: "2025-01-03", end_date: "2025-01-16", deposit_date: "2025-01-31", year: 2025, period_number: 3 },
          { period_name: "PP 04-2025", start_date: "2025-01-17", end_date: "2025-01-30", deposit_date: "2025-02-14", year: 2025, period_number: 4 },
          { period_name: "PP 05-2025", start_date: "2025-01-31", end_date: "2025-02-13", deposit_date: "2025-02-28", year: 2025, period_number: 5 },
          { period_name: "PP 06-2025", start_date: "2025-02-14", end_date: "2025-02-27", deposit_date: "2025-03-14", year: 2025, period_number: 6 },
          { period_name: "PP 07-2025", start_date: "2025-02-28", end_date: "2025-03-13", deposit_date: "2025-03-28", year: 2025, period_number: 7 },
          { period_name: "PP 08-2025", start_date: "2025-03-14", end_date: "2025-03-27", deposit_date: "2025-04-11", year: 2025, period_number: 8 },
          { period_name: "PP 09-2025", start_date: "2025-03-28", end_date: "2025-04-10", deposit_date: "2025-04-25", year: 2025, period_number: 9 },
          { period_name: "PP 10-2025", start_date: "2025-04-11", end_date: "2025-04-24", deposit_date: "2025-05-09", year: 2025, period_number: 10 },
          { period_name: "PP 11-2025", start_date: "2025-04-25", end_date: "2025-05-08", deposit_date: "2025-05-23", year: 2025, period_number: 11 },
          { period_name: "PP 12-2025", start_date: "2025-05-09", end_date: "2025-05-22", deposit_date: "2025-06-06", year: 2025, period_number: 12 },
          { period_name: "PP 13-2025", start_date: "2025-05-23", end_date: "2025-06-05", deposit_date: "2025-06-20", year: 2025, period_number: 13 },
          { period_name: "PP 14-2025", start_date: "2025-06-06", end_date: "2025-06-19", deposit_date: "2025-07-04", year: 2025, period_number: 14 },
          { period_name: "PP 15-2025", start_date: "2025-06-20", end_date: "2025-07-03", deposit_date: "2025-07-18", year: 2025, period_number: 15 },
          { period_name: "PP 16-2025", start_date: "2025-07-04", end_date: "2025-07-17", deposit_date: "2025-08-01", year: 2025, period_number: 16 },
          { period_name: "PP 17-2025", start_date: "2025-07-18", end_date: "2025-07-31", deposit_date: "2025-08-15", year: 2025, period_number: 17 },
          { period_name: "PP 18-2025", start_date: "2025-08-01", end_date: "2025-08-14", deposit_date: "2025-08-29", year: 2025, period_number: 18 },
          { period_name: "PP 19-2025", start_date: "2025-08-15", end_date: "2025-08-28", deposit_date: "2025-09-12", year: 2025, period_number: 19 },
          { period_name: "PP 20-2025", start_date: "2025-08-29", end_date: "2025-09-11", deposit_date: "2025-09-26", year: 2025, period_number: 20 },
          { period_name: "PP 21-2025", start_date: "2025-09-12", end_date: "2025-09-25", deposit_date: "2025-10-10", year: 2025, period_number: 21 },
          { period_name: "PP 22-2025", start_date: "2025-09-26", end_date: "2025-10-09", deposit_date: "2025-10-24", year: 2025, period_number: 22 },
          { period_name: "PP 23-2025", start_date: "2025-10-10", end_date: "2025-10-23", deposit_date: "2025-11-07", year: 2025, period_number: 23 },
          { period_name: "PP 24-2025", start_date: "2025-11-07", end_date: "2025-11-20", deposit_date: "2025-12-05", year: 2025, period_number: 24 },
          { period_name: "PP 25-2025", start_date: "2025-11-21", end_date: "2025-12-04", deposit_date: "2025-12-19", year: 2025, period_number: 25 },
          { period_name: "PP 26-2025", start_date: "2025-12-05", end_date: "2025-12-18", deposit_date: "2026-01-02", year: 2025, period_number: 26 },
          { period_name: "PP 27-2025", start_date: "2025-12-19", end_date: "2026-01-01", deposit_date: "2026-01-16", year: 2026, period_number: 1 },
        ];

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Generate the next 24 bi-weekly payroll periods continuing from this last period:
- Last period: PP 01-2026, Start: 2025-12-19, End: 2026-01-01, Deposit: 2026-01-16

Continue the exact pattern from the Black Point Protection payroll schedule:
- Each period is exactly 14 days (2 weeks)
- Start date of next period = day after previous end date
- Deposit date is typically 15 days after the end date (adjust for weekends/holidays to next business day if needed)
- Period numbers: PP 02-2026, PP 03-2026, etc. (resets to PP 01-YYYY each year around December)

Return a JSON array with this exact structure for each period:
{
  "period_name": "PP 02-2026",
  "start_date": "2026-01-02",
  "end_date": "2026-01-15",
  "deposit_date": "2026-01-30",
  "year": 2026,
  "period_number": 2
}

Make sure all dates are in YYYY-MM-DD format.` ,
          response_json_schema: {
            type: "object",
            properties: {
              periods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    period_name: { type: "string" },
                    start_date: { type: "string" },
                    deposit_date: { type: "string" },
                    year: { type: "number" },
                    period_number: { type: "number" }
                  }
                }
              }
            }
          }
        });

        const allPeriods = [...exactPeriods, ...(result.periods || [])];

        const today = format(new Date(), 'yyyy-MM-dd');
        const periodsWithStatus = allPeriods.map(p => ({
          ...p,
          status: today < p.start_date ? 'upcoming' :
                  today >= p.start_date && today <= p.end_date ? 'current' :
                  'closed'
        }));

        if (periodsWithStatus.length > 0) {
          await base44.entities.PayrollPeriod.bulkCreate(periodsWithStatus);
          queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] });
        }
      } catch (error) {
        console.error("Error generating payroll periods:", error);
      }
      setGeneratingPeriods(false);
    };

    generatePayrollPeriods();
  }, [payrollPeriods, generatingPeriods, queryClient, weekStart, weekEnd, user?.email]);

  const handleCopyPreviousWeek = () => {
    if (!schedules) return;
    
    const confirmCopy = confirm(
      `This will copy all shifts from the previous week (${format(addDays(weekStart, -7), 'MMM d')} - ${format(addDays(weekEnd, -7), 'MMM d')}) to the current week (${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}). Continue?`
    );
    
    if (!confirmCopy) return;

    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(weekEnd, -7);
    const prevWeekStartStr = format(prevWeekStart, 'yyyy-MM-dd');
    const prevWeekEndStr = format(prevWeekEnd, 'yyyy-MM-dd');

    const previousWeekSchedules = schedules.filter(s => {
      const shiftDate = s.shift_date; // This is the START date of the shift
      const shiftStartDate = parseISO(shiftDate);
      const shiftEndDate = s.is_split_shift ? addDays(shiftStartDate, 1) : shiftStartDate;

      // Include shifts if their start date is within the previous week, OR if they are split shifts
      // that *end* within the previous week but started *before* the previous week.
      return (shiftStartDate >= parseISO(prevWeekStartStr) && shiftStartDate <= parseISO(prevWeekEndStr)) ||
             (s.is_split_shift && shiftStartDate < parseISO(prevWeekStartStr) && shiftEndDate >= parseISO(prevWeekStartStr));
    });

    if (previousWeekSchedules.length === 0) {
      alert('No shifts found in the previous week to copy.');
      return;
    }

    const newShifts = previousWeekSchedules.map(schedule => {
      const oldDate = parseISO(schedule.shift_date);
      const newDate = addDays(oldDate, 7); // Copying to the corresponding day in the current week
      
      return {
        officer_email: schedule.officer_email,
        shift_date: format(newDate, 'yyyy-MM-dd'),
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        location: schedule.location,
        is_open: schedule.is_open || false,
        is_split_shift: schedule.is_split_shift || false,
        linked_shift_id: schedule.linked_shift_id || null, // Include linked_shift_id when copying
      };
    });

    bulkCreateShiftsMutation.mutate(newShifts);
  };

  const handleCopySelectedOfficers = () => {
    if (selectedOfficersForCopy.size === 0) {
      alert('Please select at least one officer to copy');
      return;
    }

    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = addDays(weekEnd, -7);
    const prevWeekStartStr = format(prevWeekStart, 'yyyy-MM-dd');
    const prevWeekEndStr = format(prevWeekEnd, 'yyyy-MM-dd');

    const selectedOfficersArray = Array.from(selectedOfficersForCopy);

    const previousWeekSchedules = schedules.filter(s => {
      const shiftDate = s.shift_date;
      const shiftStartDate = parseISO(shiftDate);
      const shiftEndDate = s.is_split_shift ? addDays(shiftStartDate, 1) : shiftStartDate;

      const isInPrevWeek = (shiftStartDate >= parseISO(prevWeekStartStr) && shiftStartDate <= parseISO(prevWeekEndStr)) ||
             (s.is_split_shift && shiftStartDate < parseISO(prevWeekStartStr) && shiftEndDate >= parseISO(prevWeekStartStr));

      return isInPrevWeek && selectedOfficersArray.includes(s.officer_email);
    });

    if (previousWeekSchedules.length === 0) {
      alert('No shifts found for selected officers in the previous week.');
      return;
    }

    const newShifts = previousWeekSchedules.map(schedule => {
      const oldDate = parseISO(schedule.shift_date);
      const newDate = addDays(oldDate, 7);
      
      return {
        officer_email: schedule.officer_email,
        shift_date: format(newDate, 'yyyy-MM-dd'),
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        location: schedule.location,
        is_open: schedule.is_open || false,
        is_split_shift: schedule.is_split_shift || false,
        linked_shift_id: schedule.linked_shift_id || null,
      };
    });

    bulkCreateShiftsMutation.mutate(newShifts);
    setShowSelectiveCopyDialog(false);
    setSelectedOfficersForCopy(new Set());
  };

  const toggleOfficerSelection = (email) => {
    const newSet = new Set(selectedOfficersForCopy);
    if (newSet.has(email)) {
      newSet.delete(email);
    } else {
      newSet.add(email);
    }
    setSelectedOfficersForCopy(newSet);
  };

  const handlePrintOfficerSchedule = () => {
    if (!selectedOfficerForPrint || !printStartDate || !printEndDate) {
      alert('Please select an officer and date range.');
      return;
    }

    const officerEmail = selectedOfficerForPrint;
    const officer = allUsers?.find(u => u.email === officerEmail);
    const officerName = officer ? `${officer.first_name} ${officer.last_name}` : officerEmail;
    const officerRank = officer?.rank || '';
    
    const printStart = parseISO(printStartDate);
    const printEnd = parseISO(printEndDate);

    const officerSchedules = schedules?.filter(s => 
      s.officer_email === officerEmail &&
      parseISO(s.shift_date) >= printStart &&
      parseISO(s.shift_date) <= printEnd
    ) || [];
    
    const sortedSchedules = officerSchedules.sort((a, b) => {
      // Calculate display date - split shifts show on their END date (shift_date + 1)
      const displayDateA = a.is_split_shift ? format(addDays(parseISO(a.shift_date), 1), 'yyyy-MM-dd') : a.shift_date;
      const displayDateB = b.is_split_shift ? format(addDays(parseISO(b.shift_date), 1), 'yyyy-MM-dd') : b.shift_date;
      
      const dateCompare = displayDateA.localeCompare(displayDateB);
      if (dateCompare !== 0) return dateCompare;
      
      // Within same display date: regular shifts first, then split shifts
      if (!a.is_split_shift && b.is_split_shift) return -1;
      if (a.is_split_shift && !b.is_split_shift) return 1;
      
      // Within same category, sort by start time
      const timeA = parseInt(a.start_time.replace(':', ''));
      const timeB = parseInt(b.start_time.replace(':', ''));
      return timeA - timeB;
    });

    // Calculate total hours - sum all shifts
    let totalHours = 0;
    sortedSchedules.forEach(s => {
      totalHours += calculateShiftHours(s.start_time, s.end_time);
    });

    // For overtime calculation, group by payroll week (Friday-Thursday)
    const getPayrollWeekKey = (dateStr) => {
      const date = parseISO(dateStr);
      const dayOfWeek = date.getDay(); // 0=Sun, 5=Fri
      // Days since Friday: Fri=0, Sat=1, Sun=2, Mon=3, Tue=4, Wed=5, Thu=6
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      const fridayStart = new Date(date);
      fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
      return format(fridayStart, 'yyyy-MM-dd');
    };
    
    const weeklyHours = {};
    sortedSchedules.forEach(s => {
      const payrollWeekKey = getPayrollWeekKey(s.shift_date);
      if (!weeklyHours[payrollWeekKey]) weeklyHours[payrollWeekKey] = 0;
      weeklyHours[payrollWeekKey] += calculateShiftHours(s.start_time, s.end_time);
    });

    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    Object.values(weeklyHours).forEach(weekHrs => {
      if (weekHrs > 40) {
        totalRegularHours += 40;
        totalOvertimeHours += weekHrs - 40;
      } else {
        totalRegularHours += weekHrs;
      }
    });

    const scheduleHTML = sortedSchedules.map(schedule => {
      const isSplitShift = schedule.is_split_shift === true;
      // For display, split shifts show on their END date
      const displayDate = isSplitShift ? addDays(parseISO(schedule.shift_date), 1) : parseISO(schedule.shift_date);
      const hours = calculateShiftHours(schedule.start_time, schedule.end_time);
      
      return `
        <div class="shift-card ${isSplitShift ? 'split-shift' : ''}">
          <div class="shift-date">${format(displayDate, 'MMM d, yyyy EEEE')}</div>
          <div class="shift-time">${schedule.start_time} - ${schedule.end_time} at ${schedule.location.split(':')[0]} (${hours.toFixed(2)}h) ${isSplitShift ? '<span class="split-badge">(Overnight Shift)</span>' : ''}</div>
          ${schedule.site_details ? `<div class="shift-details">Site Details: ${schedule.site_details}</div>` : ''}
          ${schedule.special_instructions ? `<div class="shift-instructions">Special Instructions: ${schedule.special_instructions}</div>` : ''}
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Officer Schedule - ${officerName}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.5in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; }
          .header { text-align: center; padding-bottom: 12px; margin-bottom: 16px; border-bottom: 3px solid #000; }
          .logo { width: 200px; height: auto; object-fit: contain; margin: 0 auto 10px; display: block; }
          .header h1 { font-size: 20pt; font-weight: bold; margin: 6px 0; }
          .header .officer-info { font-size: 13pt; margin: 4px 0; }
          .header .date-range { font-size: 10pt; color: #666; margin-top: 6px; }
          .summary { background: #f0f0f0; padding: 12px; margin: 16px 0; border-radius: 6px; text-align: center; }
          .summary .total-hours { font-size: 18pt; font-weight: bold; color: #1e40af; }
          .shift-card { margin: 12px 0; padding: 10px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; page-break-inside: avoid; }
          .shift-card.split-shift { background: #f3e8ff; border-color: #a855f7; border-width: 2px; }
          .shift-date { font-weight: bold; font-size: 11pt; margin-bottom: 4px; color: #1e40af; }
          .shift-time { font-size: 10pt; margin: 4px 0; }
          .split-badge { color: #7c3aed; font-weight: bold; margin-left: 8px; }
          .shift-details { font-size: 9pt; color: #666; margin-top: 6px; padding: 6px; background: #e8f4f8; border-left: 3px solid #0ea5e9; }
          .shift-instructions { font-size: 9pt; color: #854d0e; margin-top: 6px; padding: 6px; background: #fef3c7; border-left: 3px solid #f59e0b; }
          .footer { margin-top: 20px; padding-top: 12px; border-top: 2px solid #000; text-align: center; font-size: 9pt; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${LOGO_URL}" alt="Black Point Protection" class="logo" />
          <h1>Officer Work Schedule</h1>
          <div class="officer-info">${officerRank} ${officerName}</div>
          <div class="date-range">
            ${format(printStart, 'MMMM d')} - ${format(printEnd, 'MMMM d, yyyy')}
          </div>
        </div>

        <div class="summary">
          <div>Total Hours This Period</div>
          <div class="total-hours">${totalHours.toFixed(2)} hours</div>
          ${totalOvertimeHours > 0 ? `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 4px; border: 2px solid #f59e0b;">
              <div style="color: #92400e; font-size: 9pt; font-weight: bold;">Regular: ${totalRegularHours.toFixed(2)}h | Overtime: ${totalOvertimeHours.toFixed(2)}h</div>
            </div>
          ` : `
            <div style="margin-top: 8px; color: #16a34a; font-size: 9pt;">All Regular Hours - No Overtime</div>
          `}
        </div>

        ${scheduleHTML || '<p style="text-align: center; padding: 20px; color: #999;">No shifts scheduled for this period.</p>'}

        <div class="footer">
          <strong>BLACK POINT PROTECTION</strong> | Richmond, VA | Confidential Document<br/>
          Printed: ${format(new Date(), 'MMM d, yyyy h:mm a')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    setShowPrintDialog(false); // Close dialog after triggering print
  };

  const handlePrintCompanySchedule = () => {
    const printWindow = window.open('', '', 'width=1200,height=900');
    
    // Build division groups directly from ALL schedules in the week (not filtered by selectedDivision)
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    const allWeekSchedules = schedules?.filter(s => {
      const shiftDate = s.shift_date;
      return shiftDate >= weekStartStr && shiftDate <= weekEndStr;
    }) || [];
    
    // Build division groups from all schedules
    const printDivisionGroups = {};
    allWeekSchedules.forEach(schedule => {
      const locationSiteName = schedule.location.split(':')[0].trim();
      // Try exact match first, then partial match for locations like "St. Paul's"
      let location = locations?.find(l => l.site_name === locationSiteName);
      if (!location) {
        // Try partial match
        location = locations?.find(l => 
          l.site_name.toLowerCase().includes(locationSiteName.toLowerCase()) ||
          locationSiteName.toLowerCase().includes(l.site_name.toLowerCase())
        );
      }
      const subdivisionName = location?.subdivision || location?.division || 'Unassigned';
      
      if (!printDivisionGroups[subdivisionName]) {
        printDivisionGroups[subdivisionName] = {};
      }
      
      if (!printDivisionGroups[subdivisionName][locationSiteName]) {
        printDivisionGroups[subdivisionName][locationSiteName] = {
          address: location?.address || '',
          officers: new Set(),
          schedules: []
        };
      }
      
      printDivisionGroups[subdivisionName][locationSiteName].officers.add(schedule.officer_email);
      printDivisionGroups[subdivisionName][locationSiteName].schedules.push(schedule);
    });
    
    // Build schedule HTML organized by division and location
    let divisionsHTML = '';
    
    Object.entries(printDivisionGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([divisionName, locationData], divisionIndex) => {
        
        // Start a new page for each division
        divisionsHTML += `
          <div class="division-page ${divisionIndex > 0 ? 'page-break-before' : ''}">
            <div class="division-title">${divisionName}</div>
            <table class="schedule-table">
              <thead>
                <tr>
                  <th rowspan="2" style="width: 140px;">Property / Officer</th>
                  ${weekDays.map(day => `
                    <th class="day-header">${format(day, 'EEE')}</th>
                  `).join('')}
                  <th rowspan="2" style="width: 50px;">Total</th>
                </tr>
                <tr>
                  ${weekDays.map(day => `
                    <th class="date-subheader">${format(day, 'M/d')}</th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
        `;
        
        // Each location within the division
        Object.entries(locationData)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([locationSiteName, locData]) => {
            const locationTotalHours = locData.schedules.reduce((sum, s) => 
              sum + calculateShiftHours(s.start_time, s.end_time), 0
            );
            
            // Location header
            divisionsHTML += `
              <tr>
                <td colspan="${weekDays.length + 1}" class="location-header">
                  ${locationSiteName}
                </td>
                <td class="location-hours">${Math.round(locationTotalHours)}</td>
              </tr>
            `;
            
            // Officers for this location
            const sortedOfficersForLocation = sortOfficersByUnitNumber(locData.officers);
            sortedOfficersForLocation.forEach((officerEmail) => {
              if (officerEmail === 'OPEN') return; // Skip open shifts in print
              
              const officerSchedules = locData.schedules.filter(s => s.officer_email === officerEmail);
              const totalOfficerHours = officerSchedules.reduce((sum, s) => 
                sum + calculateShiftHours(s.start_time, s.end_time), 0
              );
              
              const fullRankPrint = getOfficerRank(officerEmail);
              // Only show rank for Sergeant and above in print
              const showRankPrint = fullRankPrint && (
                fullRankPrint.includes('Sergeant') || 
                fullRankPrint.includes('Lieutenant') || 
                fullRankPrint.includes('Captain') ||
                fullRankPrint.includes('Operations Manager') ||
                fullRankPrint.includes('Supervisor')
              );
              const officerRank = showRankPrint ? fullRankPrint
                .replace('Operations Manager', 'OM')
                .replace('Supervisor', 'Sup')
                .replace('Sergeant', 'Sgt')
                .replace('Lieutenant', 'Lt')
                .replace('Captain', 'Cpt')
                .trim() : '';
              
              const officerUnit = getOfficerUnitNumber(officerEmail);
              const officerFirstName = allUsers?.find(u => u.email === officerEmail)?.first_name || '';
              const officerLastName = allUsers?.find(u => u.email === officerEmail)?.last_name || '';
              
              let officerDisplayName = '';
              if (officerUnit) officerDisplayName = `#${officerUnit} `;
              if (officerRank) officerDisplayName += `${officerRank} `;
              if (officerFirstName && officerLastName) {
                officerDisplayName += `${officerFirstName.charAt(0)}.${officerLastName}`;
              } else {
                officerDisplayName += getOfficerName(officerEmail);
              }
              
              // Add rank only for Sergeant and above
              const printRank = getOfficerRank(officerEmail);
              const showRankInPrint = printRank && (
                printRank.includes('Sergeant') || 
                printRank.includes('Lieutenant') || 
                printRank.includes('Captain') ||
                printRank.includes('Operations Manager') ||
                printRank.includes('Supervisor')
              );
              if (showRankInPrint) {
                officerDisplayName += ' (' + printRank.replace('Operations Manager', 'OM').replace('Supervisor', 'Sup').replace('Sergeant', 'Sgt').replace('Lieutenant', 'Lt').replace('Captain', 'Cpt') + ')';
              }
              
              divisionsHTML += `<tr><td class="officer-name">${officerDisplayName}</td>`;
              
              weekDays.forEach((day) => {
                const daySchedules = getScheduleForDateOfficerAndLocation(day, officerEmail, locationSiteName);
                divisionsHTML += '<td class="shift-cell">';
                daySchedules.forEach((schedule) => {
                  divisionsHTML += `<div class="shift-time">${schedule.start_time}-${schedule.end_time}</div>`;
                });
                divisionsHTML += '</td>';
              });
              
              divisionsHTML += `<td class="total-cell">${Math.round(totalOfficerHours)}</td></tr>`;
            });
          });
        
        divisionsHTML += `
              </tbody>
            </table>
          </div>
        `;
      });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Black Point Protection Weekly Schedule</title>
        <meta charset="UTF-8">
        <style>
          @page { 
            size: 11in 8.5in landscape; 
            margin: 0.25in;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 7pt; color: #000; }
          
          .header { 
            text-align: center; 
            margin-bottom: 5px;
            border-bottom: 2px solid #000;
            padding-bottom: 4px;
          }
          .header h1 { font-size: 12pt; font-weight: bold; margin-bottom: 2px; }
          .header .date-range { font-size: 9pt; font-weight: bold; }
          
          .division-page {
            width: 100%;
          }
          .division-title {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            font-weight: bold;
            text-align: center;
            padding: 6px;
            font-size: 11pt;
            margin-bottom: 5px;
            border-radius: 3px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
          
          .schedule-table { 
            width: 100%; 
            border-collapse: collapse;
            table-layout: fixed;
          }
          th { 
            background-color: #86efac;
            border: 1px solid #000; 
            padding: 3px 2px;
            text-align: center;
            font-size: 7pt;
            font-weight: bold;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          th.day-header { font-size: 7pt; }
          th.date-subheader { font-size: 6pt; font-weight: normal; background-color: #bbf7d0; }
          td { 
            border: 1px solid #000; 
            padding: 2px;
            font-size: 6.5pt;
            vertical-align: top;
          }
          .location-header {
            background-color: #bfdbfe;
            font-weight: bold;
            padding: 3px 4px;
            font-size: 7pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .location-hours {
            background-color: #bfdbfe;
            font-weight: bold;
            text-align: center;
            font-size: 7pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .officer-name {
            padding-left: 4px;
            font-weight: normal;
            font-size: 6.5pt;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .shift-cell {
            text-align: center;
            padding: 1px;
          }
          .shift-time {
            font-size: 6pt;
            line-height: 1.1;
            margin: 0;
          }
          .total-cell {
            text-align: center;
            font-weight: bold;
            font-size: 6.5pt;
            background-color: #f1f5f9;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .footer { 
            margin-top: 5px; 
            text-align: center; 
            font-size: 6pt;
            color: #666;
            border-top: 1px solid #000;
            padding-top: 3px;
          }
          
          @media print {
            .page-break-before { page-break-before: always !important; break-before: page !important; }
            .division-page { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${LOGO_URL}" alt="Black Point Protection" style="width: 180px; height: auto; object-fit: contain; margin: 0 auto 8px;" />
          <h1>Black Point Protection ${scheduleViewType === 'weekly' ? 'Weekly' : scheduleViewType === 'biweekly' ? 'Bi-Weekly' : 'Monthly'} Schedule</h1>
          <div class="date-range">${format(weekStart, 'MMMM d')} – ${format(weekEnd, 'MMMM d, yyyy')}</div>
          ${(() => {
            // For monthly view, show ALL payroll periods that overlap with the date range
            if (scheduleViewType === 'monthly' && payrollPeriods) {
              const overlappingPeriods = payrollPeriods.filter(p => 
                p.start_date <= weekEndStr && p.end_date >= weekStartStr
              ).sort((a, b) => a.start_date.localeCompare(b.start_date));

              if (overlappingPeriods.length > 0) {
                return '<div style="font-size: 8pt; margin-top: 5px; color: #475569;">Payroll Periods: ' + 
                  overlappingPeriods.map(p => `${p.period_name} (${format(parseISO(p.start_date), 'MMM d')} - ${format(parseISO(p.end_date), 'MMM d')})`).join(' | ') + 
                  '</div>';
              }
            }
            return currentPeriod ? `<div style="font-size: 8pt; margin-top: 5px; color: #475569;">Payroll Period: ${currentPeriod.period_name} (${format(parseISO(currentPeriod.start_date), 'MMM d')} - ${format(parseISO(currentPeriod.end_date), 'MMM d, yyyy')})</div>` : '';
          })()}
        </div>

        ${divisionsHTML || '<p style="text-align: center; padding: 20px;">No schedules found</p>'}

        <div class="footer">
          <strong>BLACK POINT PROTECTION</strong> | Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}
        </div>
        
        <!-- Officer Hours Summary Page (For This Week Only) -->
        <div class="division-page page-break-before">
          <div class="division-title">Officer Hours Summary (Payroll Week)</div>
          <p style="text-align:center; font-size:8pt; margin-bottom:10px; color:#475569;">
            Payroll Week: ${format(parseISO((() => {
              const getPayrollWeekKey = (dateStr) => {
                const date = parseISO(dateStr);
                const dayOfWeek = date.getDay();
                const daysSinceFriday = (dayOfWeek + 2) % 7;
                const fridayStart = new Date(date);
                fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
                return format(fridayStart, 'yyyy-MM-dd');
              };
              return getPayrollWeekKey(format(weekStart, 'yyyy-MM-dd'));
            })()), 'MMM d')} - ${format(addDays(parseISO((() => {
              const getPayrollWeekKey = (dateStr) => {
                const date = parseISO(dateStr);
                const dayOfWeek = date.getDay();
                const daysSinceFriday = (dayOfWeek + 2) % 7;
                const fridayStart = new Date(date);
                fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
                return format(fridayStart, 'yyyy-MM-dd');
              };
              return getPayrollWeekKey(format(weekStart, 'yyyy-MM-dd'));
            })()), 6), 'MMM d, yyyy')} (Fri-Thu)
            ${currentPeriod ? ' | Payroll Period: ' + currentPeriod.period_name : ''}
          </p>
          <table class="schedule-table">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th style="width: 80px;">Unit</th>
                <th>Officer Name</th>
                <th>Rank</th>
                <th style="width: 80px;">Regular Hrs</th>
                <th style="width: 80px;">OT Hrs</th>
                <th style="width: 80px;">Total Hrs</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                // Determine the payroll week (Friday-Thursday) for the displayed week
                const getPayrollWeekKey = (dateStr) => {
                  const date = parseISO(dateStr);
                  const dayOfWeek = date.getDay(); // 0=Sun, 5=Fri
                  // Days since Friday: Fri=0, Sat=1, Sun=2, Mon=3, Tue=4, Wed=5, Thu=6
                  const daysSinceFriday = (dayOfWeek + 2) % 7;
                  const fridayStart = new Date(date);
                  fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
                  return format(fridayStart, 'yyyy-MM-dd');
                };
                
                // Get the payroll week that contains the displayed week start
                const payrollWeekStart = getPayrollWeekKey(format(weekStart, 'yyyy-MM-dd'));
                const payrollWeekEnd = format(addDays(parseISO(payrollWeekStart), 6), 'yyyy-MM-dd');
                
                // Get all schedules within this payroll week (Friday-Thursday)
                const payrollWeekSchedules = schedules?.filter(s => {
                  const shiftDate = s.shift_date;
                  return shiftDate >= payrollWeekStart && shiftDate <= payrollWeekEnd && s.officer_email !== 'OPEN';
                }) || [];
                
                // Calculate total hours per officer for this payroll week
                const officerHoursSummary = {};
                
                payrollWeekSchedules.forEach(schedule => {
                  if (!officerHoursSummary[schedule.officer_email]) {
                    officerHoursSummary[schedule.officer_email] = 0;
                  }
                  officerHoursSummary[schedule.officer_email] += calculateShiftHours(schedule.start_time, schedule.end_time);
                });
                
                // Sort by unit number
                const sortedOfficersForIndividualPages = Object.keys(officerHoursSummary).sort((a, b) => {
                  const unitA = getOfficerUnitNumber(a);
                  const unitB = getOfficerUnitNumber(b);
                  if (unitA && unitB) {
                    const numA = parseInt(unitA);
                    const numB = parseInt(unitB);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                  }
                  return getOfficerName(a).localeCompare(getOfficerName(b));
                });
                
                let totalRegular = 0;
                let totalOT = 0;
                
                const rows = sortedOfficersForIndividualPages.map((email, idx) => {
                  const hours = officerHoursSummary[email];
                  // Calculate regular and OT based on 40 hour threshold for this payroll week
                  const regular = Math.min(hours, 40);
                  const ot = Math.max(0, hours - 40);
                  totalRegular += regular;
                  totalOT += ot;
                  
                  const officer = allUsers?.find(u => u.email === email);
                  const name = officer ? (officer.first_name + ' ' + officer.last_name) : email;
                  const rank = getOfficerRank(email);
                  const unit = getOfficerUnitNumber(email);
                  
                  return '<tr>' +
                    '<td style="text-align:center;">' + (idx + 1) + '</td>' +
                    '<td style="text-align:center; font-weight:bold;">' + (unit ? '#' + unit : '-') + '</td>' +
                    '<td>' + name + '</td>' +
                    '<td>' + rank + '</td>' +
                    '<td style="text-align:center;">' + regular.toFixed(1) + '</td>' +
                    '<td style="text-align:center; color:' + (ot > 0 ? '#dc2626' : '#000') + '; font-weight:' + (ot > 0 ? 'bold' : 'normal') + ';">' + ot.toFixed(1) + '</td>' +
                    '<td style="text-align:center; font-weight:bold;">' + hours.toFixed(1) + '</td>' +
                  '</tr>';
                }).join('');
                
                return rows + 
                  '<tr style="background-color:#e0e7ff; font-weight:bold;">' +
                    '<td colspan="4" style="text-align:right; padding-right:10px;">TOTALS:</td>' +
                    '<td style="text-align:center;">' + totalRegular.toFixed(1) + '</td>' +
                    '<td style="text-align:center; color:#dc2626;">' + totalOT.toFixed(1) + '</td>' +
                    '<td style="text-align:center;">' + (totalRegular + totalOT).toFixed(1) + '</td>' +
                  '</tr>';
              })()}
            </tbody>
          </table>
        </div>
        
        <!-- Location Hours Summary Page -->
        <div class="division-page page-break-before">
          <div class="division-title">Hours by Location</div>
          <table class="schedule-table">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>Division</th>
                <th>Location</th>
                <th style="width: 100px;">Total Hours</th>
                <th style="width: 100px;">Max Hours/Week</th>
                <th style="width: 100px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                // Calculate hours per location
                const locationHoursSummary = {};
                allWeekSchedules.forEach(schedule => {
                  if (schedule.officer_email === 'OPEN') return;
                  const locationSiteName = schedule.location.split(':')[0].trim();
                  if (!locationHoursSummary[locationSiteName]) {
                    locationHoursSummary[locationSiteName] = 0;
                  }
                  locationHoursSummary[locationSiteName] += calculateShiftHours(schedule.start_time, schedule.end_time);
                });
                
                // Sort by division then location name
                const sortedLocations = Object.keys(locationHoursSummary).sort((a, b) => {
                  const locA = locations?.find(l => l.site_name === a);
                  const locB = locations?.find(l => l.site_name === b);
                  const subA = locA?.subdivision || locA?.division || 'Unassigned';
                  const subB = locB?.subdivision || locB?.division || 'Unassigned';
                  if (subA !== subB) return subA.localeCompare(subB);
                  return a.localeCompare(b);
                });
                
                let totalHours = 0;
                
                const rows = sortedLocations.map((siteName, idx) => {
                  const hours = locationHoursSummary[siteName];
                  totalHours += hours;
                  const loc = locations?.find(l => l.site_name === siteName);
                  const division = loc?.division || 'Unassigned';
                  const maxHours = loc?.max_hours_per_week || null;
                  const isOver = maxHours && hours > maxHours;
                  
                  const subdivision = loc?.subdivision || loc?.division || 'Unassigned';
                  return '<tr>' +
                    '<td style="text-align:center;">' + (idx + 1) + '</td>' +
                    '<td>' + subdivision + '</td>' +
                    '<td>' + siteName + '</td>' +
                    '<td style="text-align:center; font-weight:bold;">' + hours.toFixed(1) + '</td>' +
                    '<td style="text-align:center;">' + (maxHours ? maxHours : '-') + '</td>' +
                    '<td style="text-align:center; color:' + (isOver ? '#dc2626' : '#16a34a') + '; font-weight:bold;">' + (isOver ? '⚠️ OVER' : '✓ OK') + '</td>' +
                  '</tr>';
                }).join('');
                
                return rows + 
                  '<tr style="background-color:#e0e7ff; font-weight:bold;">' +
                    '<td colspan="3" style="text-align:right; padding-right:10px;">TOTAL HOURS:</td>' +
                    '<td style="text-align:center;">' + totalHours.toFixed(1) + '</td>' +
                    '<td colspan="2"></td>' +
                  '</tr>';
              })()}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <strong>BLACK POINT PROTECTION</strong> | Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}
        </div>

        <!-- Individual Officer Shift Details Pages -->
        ${(() => {
          const getPayrollWeekKey = (dateStr) => {
            const date = parseISO(dateStr);
            const dayOfWeek = date.getDay();
            const daysSinceFriday = (dayOfWeek + 2) % 7;
            const fridayStart = new Date(date);
            fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
            return format(fridayStart, 'yyyy-MM-dd');
          };
          
          const payrollWeekStart = getPayrollWeekKey(format(weekStart, 'yyyy-MM-dd'));
          const payrollWeekEnd = format(addDays(parseISO(payrollWeekStart), 6), 'yyyy-MM-dd');
          
          const payrollWeekSchedules = schedules?.filter(s => {
            const shiftDate = s.shift_date;
            return shiftDate >= payrollWeekStart && shiftDate <= payrollWeekEnd && s.officer_email !== 'OPEN';
          }) || [];
          
          const officerHoursSummaryForPrint = {};
          
          payrollWeekSchedules.forEach(schedule => {
            if (!officerHoursSummaryForPrint[schedule.officer_email]) {
              officerHoursSummaryForPrint[schedule.officer_email] = 0;
            }
            officerHoursSummaryForPrint[schedule.officer_email] += calculateShiftHours(schedule.start_time, schedule.end_time);
          });
          
          const sortedOfficersForPrint = Object.keys(officerHoursSummaryForPrint).sort((a, b) => {
            const unitA = getOfficerUnitNumber(a);
            const unitB = getOfficerUnitNumber(b);
            if (unitA && unitB) {
              const numA = parseInt(unitA);
              const numB = parseInt(unitB);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            }
            return getOfficerName(a).localeCompare(getOfficerName(b));
          });
          
          return sortedOfficersForPrint.map((email) => {
            const hours = officerHoursSummaryForPrint[email];
          const regular = Math.min(hours, 40);
          const ot = Math.max(0, hours - 40);
          
          const officer = allUsers?.find(u => u.email === email);
          const name = officer ? (officer.first_name + ' ' + officer.last_name) : email;
          const rank = getOfficerRank(email);
          const unit = getOfficerUnitNumber(email);
          
          const officerShifts = payrollWeekSchedules
            .filter(s => s.officer_email === email)
            .sort((a, b) => {
              // Display date: split shifts show on END date (shift_date + 1)
              const displayDateA = a.is_split_shift ? format(addDays(parseISO(a.shift_date), 1), 'yyyy-MM-dd') : a.shift_date;
              const displayDateB = b.is_split_shift ? format(addDays(parseISO(b.shift_date), 1), 'yyyy-MM-dd') : b.shift_date;
              
              const dateCompare = displayDateA.localeCompare(displayDateB);
              if (dateCompare !== 0) return dateCompare;
              
              // Regular shifts first, then split shifts
              if (!a.is_split_shift && b.is_split_shift) return -1;
              if (a.is_split_shift && !b.is_split_shift) return 1;
              
              // Sort by start time
              return a.start_time.localeCompare(b.start_time);
            });
          
          const shiftsHTML = officerShifts.map(s => {
            const shiftHours = calculateShiftHours(s.start_time, s.end_time);
            // Display date: split shifts show on their END date
            const displayDate = s.is_split_shift ? addDays(parseISO(s.shift_date), 1) : parseISO(s.shift_date);
            return '<div style="margin:8px 0; padding:8px; background:#fafafa; border:1px solid #ddd; border-radius:6px; ' + (s.is_split_shift ? 'background:#f3e8ff; border-color:#a855f7; border-width:2px;' : '') + '">' +
              '<div style="font-weight:bold; color:#1e40af; font-size:10pt; margin-bottom:4px;">' + format(displayDate, 'MMM d, yyyy (EEEE)') + '</div>' +
              '<div style="font-size:9pt;">' + s.start_time + ' - ' + s.end_time + ' at ' + s.location.split(':')[0] + ' (' + shiftHours.toFixed(2) + 'h)' + (s.is_split_shift ? ' <span style="color:#7c3aed; font-weight:bold; margin-left:8px;">(Overnight Shift)</span>' : '') + '</div>' +
              (s.site_details ? '<div style="font-size:8pt; color:#666; margin-top:6px; padding:6px; background:#e8f4f8; border-left:3px solid #0ea5e9;">Site Details: ' + s.site_details + '</div>' : '') +
              (s.special_instructions ? '<div style="font-size:8pt; color:#854d0e; margin-top:6px; padding:6px; background:#fef3c7; border-left:3px solid #f59e0b;">Instructions: ' + s.special_instructions + '</div>' : '') +
            '</div>';
          }).join('');
          
          return '<div style="page-break-before:always;">' +
            '<div style="text-align:center; padding-bottom:12px; margin-bottom:16px; border-bottom:3px solid #000;">' +
              '<img src="' + LOGO_URL + '" style="width:200px; height:auto; object-fit:contain; margin:0 auto 10px; display:block;" />' +
              '<h1 style="font-size:20pt; font-weight:bold; margin:6px 0;">Officer Work Schedule</h1>' +
              '<div style="font-size:13pt; margin:4px 0;">' + rank + ' ' + name + (unit ? ' (Unit #' + unit + ')' : '') + '</div>' +
              '<div style="font-size:10pt; color:#666; margin-top:6px;">Payroll Week: ' + format(parseISO(payrollWeekStart), 'MMM d') + ' - ' + format(parseISO(payrollWeekEnd), 'MMM d, yyyy') + '</div>' +
            '</div>' +
            '<div style="background:#f0f0f0; padding:12px; margin:16px 0; border-radius:6px; text-align:center;">' +
              '<div>Total Hours This Week</div>' +
              '<div style="font-size:18pt; font-weight:bold; color:#1e40af;">' + hours.toFixed(2) + ' hours</div>' +
              (ot > 0 ? 
                '<div style="margin-top:8px; padding:8px; background:#fef3c7; border-radius:4px; border:2px solid #f59e0b;">' +
                  '<div style="color:#92400e; font-size:9pt; font-weight:bold;">Regular: ' + regular.toFixed(2) + 'h | Overtime: ' + ot.toFixed(2) + 'h</div>' +
                '</div>' 
                : 
                '<div style="margin-top:8px; color:#16a34a; font-size:9pt;">All Regular Hours - No Overtime</div>'
              ) +
            '</div>' +
            shiftsHTML +
            '<div style="margin-top:20px; padding-top:12px; border-top:2px solid #000; text-align:center; font-size:9pt; color:#666;">' +
              '<strong>BLACK POINT PROTECTION</strong> | Richmond, VA | Confidential Document<br/>' +
              'Printed: ' + format(new Date(), 'MMM d, yyyy h:mm a') +
            '</div>' +
          '</div>';
          }).join('');
        })()}
      </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for images to load before printing
    const img = printWindow.document.querySelector('img');
    if (img) {
      img.onload = () => {
        setTimeout(() => printWindow.print(), 100);
      };
      img.onerror = () => {
        setTimeout(() => printWindow.print(), 100);
      };
      // Fallback if image already loaded
      if (img.complete) {
        setTimeout(() => printWindow.print(), 100);
      }
    } else {
      setTimeout(() => printWindow.print(), 100);
    }
  };

  const handleDocumentUpload = async (file) => {
    if (!file) return;
    
    setUploadingDocument(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setUploadedFileUrl(result.file_url);
      alert('Document uploaded! Click "Import Schedule" to analyze and import shifts.');
    } catch (error) {
      alert('Error uploading document: ' + error.message);
    }
    setUploadingDocument(false);
  };

  const handleAIImport = async () => {
    if (!uploadedFileUrl) {
      alert("Please upload a document first.");
      return;
    }

    setImportingSchedule(true);
    try {
      const officerList = activeOfficers?.map(u => `${u.first_name} ${u.last_name} (${u.email})`).join('\n- ');
      const locationList = locations?.map(l => `${l.site_name}: ${l.address}`).join('\n- ');

      const promptText = `Parse the schedule from the provided document URL. Extract all shifts and provide them in a structured JSON format.
        
        Document URL: ${uploadedFileUrl}

        Here are the currently registered officers and their emails in our system. Please use their emails for the 'officer_email' field if their name matches. If an officer's name is in the document but not in this list, assume it's an unrecognized officer and still extract the shift, but the 'officer_email' for such a shift could be null or a generic placeholder like "unknown@example.com" if you cannot find a match, though prioritize matching to the list below:
        - ${officerList}

        Here are the currently active locations in our system. Please use the exact 'site_name: address' format for the 'location' field if the site name matches. If a location name from the document is not in this list, use "UNKNOWN LOCATION: Unknown Address" or the closest possible match based on the document's context, but prioritize matching to the list below:
        - ${locationList}

        Crucial instructions for parsing:
        1.  **Officer Identification**: Match officer names in the document to existing officers. If an officer's full name (first and last) matches an existing user's full name or email in our system, use their email as \`officer_email\`. If the document refers to a shift as 'OPEN', 'UNASSIGNED', or similar, set \`officer_email\` to "OPEN" and \`is_open\` to true.
        2.  **Location Identification**: Match location names in the document to existing site names. Use the exact \`site_name: address\` format for the \`location\`.
        3.  **Date Parsing**: Dates can be in various formats (e.g., "Mon 1/1", "Jan 1", "January 1st, 2025"). Normalize all dates to 'YYYY-MM-DD' format. Ensure the correct year is used if not explicitly stated (assume current or upcoming year based on context).
        4.  **Time Parsing**: Extract start and end times. Times can be 12-hour or 24-hour format (e.g., "0800", "8am", "8:00 PM"). Normalize to 'HH:MM' (24-hour) format.
        5.  **Split Shifts**: If a shift starts on one day and ends on the next (e.g., "22:00 - 06:00"), this indicates a split shift. For split shifts, the \`shift_date\` should be the START date of the shift. The \`is_split_shift\` flag should be set to \`true\`. For instance, a shift on Jan 1 from 22:00 to 06:00 Jan 2 should have \`shift_date: "YYYY-01-01"\` and \`is_split_shift: true\`.
        6.  **Linked Shift ID**: For split shifts, the \`linked_shift_id\` should typically be null when importing, as linking is usually a manual process post-creation or through advanced rules not covered here.
        7.  **Output Structure**: Return a JSON object with a "shifts" array containing shift objects with the following keys: \`officer_email\`, \`shift_date\`, \`start_time\`, \`end_time\`, \`location\`, \`is_open\`, \`is_split_shift\`, \`linked_shift_id\`.
        
        Example Output Format:
        {
          "shifts": [
            {
              "officer_email": "john.doe@example.com",
              "shift_date": "2024-01-15",
              "start_time": "08:00",
              "end_time": "16:00",
              "location": "Main Office: 123 Main St",
              "is_open": false,
              "is_split_shift": false,
              "linked_shift_id": null
            },
            {
              "officer_email": "OPEN",
              "shift_date": "2024-01-15",
              "start_time": "16:00",
              "end_time": "23:00",
              "location": "Warehouse: 456 Industrial Rd",
              "is_open": true,
              "is_split_shift": false,
              "linked_shift_id": null
            },
            {
              "officer_email": "jane.smith@example.com",
              "shift_date": "2024-01-15",
              "start_time": "22:00",
              "end_time": "06:00",
              "location": "Downtown Bank: 789 Financial Ave",
              "is_open": false,
              "is_split_shift": true,
              "linked_shift_id": null
            }
          ]
        }
        
        Return the JSON object with shifts array. If no shifts are found, return {"shifts": []}.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: promptText,
        response_json_schema: {
          type: "object",
          properties: {
            shifts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  officer_email: { type: "string" },
                  shift_date: { type: "string", format: "date" },
                  start_time: { type: "string", pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" },
                  end_time: { type: "string", pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" },
                  location: { type: "string" },
                  is_open: { type: "boolean" },
                  is_split_shift: { type: "boolean" },
                  linked_shift_id: { type: ["string", "null"] }
                },
                required: ["officer_email", "shift_date", "start_time", "end_time", "location", "is_open", "is_split_shift", "linked_shift_id"]
              }
            }
          }
        }
      });

      if (response && response.shifts && response.shifts.length > 0) {
        // Filter out any shifts that might have an invalid location (e.g., LLM couldn't match)
        // Or shifts with officers not found and not marked as OPEN.
        const validShifts = response.shifts.filter(s => {
          const locationSiteName = s.location.split(':')[0].trim();
          const locationExists = locations?.some(loc => loc.site_name === locationSiteName);
          
          const officerExists = s.officer_email === "OPEN" || activeOfficers?.some(o => o.email === s.officer_email);

          return locationExists && officerExists;
        }).map(s => ({
          ...s,
          linked_shift_id: s.linked_shift_id || null // Ensure null if not provided
        }));

        if (validShifts.length > 0) {
          await bulkCreateShiftsMutation.mutateAsync(validShifts);
          alert(`Successfully imported ${validShifts.length} shifts.`);
        } else {
          alert('No valid shifts were extracted from the document or matched to existing officers/locations. Please check the document format or ensure officers/locations exist.');
        }
      } else {
        alert('No shifts were extracted from the document. Please check the document content.');
      }
      setUploadedFileUrl(null); // Clear URL after import
      setShowAIImportDialog(false);
    } catch (error) {
      console.error("Error importing schedule with AI:", error);
      alert('Failed to import schedule using AI. Please check the document and try again. Ensure officer names and location site names are consistent with system data.');
    } finally {
      setImportingSchedule(false);
    }
  };

  const handleEditShift = (schedule) => {
    // Store the schedule object as is. The Select component in the dialog will parse the location string.
    setEditingShift(schedule);
    setShowEditDialog(true);
  };

  const handleUpdateShift = () => {
    if (!editingShift) return;

    // The editingShift.location will still be in "site_name: address" format
    // because handleEditShift stores the full schedule object.
    const locationSiteName = editingShift.location.split(':')[0].trim();
    const locationObj = locations?.find(loc => loc.site_name === locationSiteName);
    
    if (!locationObj) {
      alert('Selected location not found.'); // This should ideally not happen if it was an existing shift
      return;
    }

    // Determine the actual `shift_date` to store in the database (always the START date)
    let actualShiftDate = editingShift.shift_date; // This is the date from the form

    // If it's a split shift, we interpret editingShift.shift_date as the "end day" in the form for user convenience
    if (editingShift.is_split_shift) {
        if (editingShift.linked_shift_id) {
            // If linked, use the start date of the linked shift (which must be on the previous day)
            const linkedShift = schedules?.find(s => s.id === editingShift.linked_shift_id);
            if (linkedShift) {
                actualShiftDate = linkedShift.shift_date; // Use the start date of the linked shift
            } else {
                // Fallback in case linkedShift not found, assume form date is end day and calculate start
                actualShiftDate = format(subDays(parseISO(editingShift.shift_date), 1), 'yyyy-MM-dd');
            }
        } else {
            // If not linked, but it's a split shift, the actual start date is the day before the form date
            actualShiftDate = format(subDays(parseISO(editingShift.shift_date), 1), 'yyyy-MM-dd');
        }
    }
    // If not a split shift, actualShiftDate remains editingShift.shift_date (which should be the start date)

    updateScheduleMutation.mutate({
      id: editingShift.id,
      data: {
        officer_email: editingShift.is_open ? "OPEN" : editingShift.officer_email,
        shift_date: actualShiftDate, // Use actualShiftDate logic
        start_time: editingShift.start_time,
        end_time: editingShift.end_time,
        location: `${locationObj.site_name}: ${locationObj.address}`, // Reconstruct full string
        is_open: editingShift.is_open,
        is_split_shift: editingShift.is_split_shift,
        linked_shift_id: editingShift.linked_shift_id || null,
      }
    });
    
    setShowEditDialog(false);
    setEditingShift(null);
  };

  const handleClearAllShifts = () => {
    if (confirm(`⚠️ WARNING: This will permanently delete ALL shifts for the week of ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}.\n\nThis action cannot be undone. Are you sure you want to continue?`)) {
      clearAllShiftsMutation.mutate();
    }
  };

  const handleDeleteShift = (scheduleId) => {
    if (confirm('Delete this shift?')) {
      deleteScheduleMutation.mutate(scheduleId);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    const parts = destination.droppableId.split('-');
    const destLocationSiteName = parts[1];
    const destOfficer = parts[2];
    const destDateStr = parts[3]; // This is the *display date* (the day the column represents)

    const schedule = schedules?.find(s => s.id === draggableId);
    
    if (schedule) {
      const targetLocationObj = locations?.find(loc => loc.site_name === destLocationSiteName);
      const fullLocationString = targetLocationObj ? `${targetLocationObj.site_name}: ${targetLocationObj.address}` : destLocationSiteName;

      let newShiftDate = destDateStr; // Default to the display date

      // If dragging a split shift to a new day/officer, it's safer to clear the linked ID
      // as the target shift it was linked to might not exist or be appropriate anymore.
      // This logic will be handled by the backend's validation on update.
      let updatedLinkedShiftId = schedule.linked_shift_id;
      if (schedule.is_split_shift && (destOfficer !== schedule.officer_email || destDateStr !== format(parseISO(schedule.shift_date), 'yyyy-MM-dd'))) {
        updatedLinkedShiftId = null;
      }
      
      // If the original shift is a split shift and starts on the day BEFORE the destination date,
      // it means we're dropping it into a column that represents the *end* day of a split shift.
      // In this case, the actual `shift_date` (start date) should be one day prior to `destDateStr`.
      // This is complex and might lead to incorrect state if not carefully handled.
      // For now, let's assume `destDateStr` always refers to the shift's *start* date for simplicity
      // in drag-and-drop, and users will re-adjust if it's a split shift needing a specific start date.
      // Given the change for `newShift.shift_date` always being the start date, `destDateStr` will be the start date.

      updateScheduleMutation.mutate({
        id: schedule.id,
        data: {
          shift_date: newShiftDate, // This will be the START date of the shift
          officer_email: destOfficer,
          location: fullLocationString,
          is_open: destOfficer === "OPEN",
          is_split_shift: schedule.is_split_shift, // Preserve this
          linked_shift_id: updatedLinkedShiftId // Apply the updated linked_shift_id logic
        }
      });
    }
  };

  const handleAddShift = () => {
    const officerEmailToStore = newShift.is_open ? "OPEN" : newShift.officer_email;
    if (!officerEmailToStore) { 
      alert('Please select an officer or mark as open shift');
      return;
    }

    // If apply to whole week is checked, use weekShifts array
    if (applyToWholeWeek) {
      const shiftsToCreate = [];
      
      weekShifts.forEach((dayShift) => {
        if (dayShift.start_time && dayShift.end_time && dayShift.location) {
          const locationObj = locations?.find(loc => loc.site_name === dayShift.location);
          if (locationObj && dayShift.date) {
            shiftsToCreate.push({
              officer_email: officerEmailToStore,
              shift_date: dayShift.date,
              start_time: dayShift.start_time,
              end_time: dayShift.end_time,
              location: `${locationObj.site_name}: ${locationObj.address}`,
              is_open: newShift.is_open,
              is_split_shift: false,
              linked_shift_id: null,
            });
          }
        }
      });

      if (shiftsToCreate.length === 0) {
        alert('Please fill in at least one day with time and location');
        return;
      }

      bulkCreateShiftsMutation.mutate(shiftsToCreate);
      setShowAddDialog(false);
      setApplyToWholeWeek(false);
      setWeekShifts([
        { day: 'Sunday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Monday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Tuesday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Wednesday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Thursday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Friday', date: '', start_time: '', end_time: '', location: '' },
        { day: 'Saturday', date: '', start_time: '', end_time: '', location: '' },
      ]);
      setNewShift({
         officer_email: "",
         shift_date: "",
         start_time: "",
         end_time: "",
         location: "",
         shift_type: "normal",
         is_open: false,
         is_split_shift: false,
         linked_shift_id: "",
       });
       return;
    }

    // Single shift creation
    if (!newShift.shift_date || !newShift.start_time || !newShift.end_time || !newShift.location) {
      alert('Please fill in all required fields');
      return;
    }

    const locationObj = locations?.find(loc => loc.site_name === newShift.location);
    if (!locationObj) {
      alert('Selected location not found.');
      return;
    }

    let actualShiftDate = newShift.shift_date;

    if (newShift.is_split_shift) {
        if (newShift.linked_shift_id) {
            const linkedShift = schedules?.find(s => s.id === newShift.linked_shift_id);
            if (linkedShift) {
                actualShiftDate = linkedShift.shift_date;
            } else {
                actualShiftDate = format(subDays(parseISO(newShift.shift_date), 1), 'yyyy-MM-dd');
            }
        } else {
            actualShiftDate = format(subDays(parseISO(newShift.shift_date), 1), 'yyyy-MM-dd');
        }
    }
    
    createShiftMutation.mutate({
       officer_email: officerEmailToStore,
       shift_date: actualShiftDate,
       start_time: newShift.start_time,
       end_time: newShift.end_time,
       location: `${locationObj.site_name}: ${locationObj.address}`,
       shift_type: newShift.shift_type || "normal",
       is_open: newShift.is_open,
       is_split_shift: newShift.is_split_shift,
       linked_shift_id: newShift.linked_shift_id || null,
     });
  };

  // Helper function to check if a time falls within a range
  const timeInRange = (time, startTime, endTime) => {
    const timeNum = parseInt(time.replace(':', ''));
    const startNum = parseInt(startTime.replace(':', ''));
    let endNum = parseInt(endTime.replace(':', ''));
    
    // Handle overnight shifts where end time is numerically smaller than start time
    if (endNum <= startNum) { // Changed to <= for cases like 22:00-06:00
      endNum += 2400; // Adjust end time for next day
    }
    
    // Convert current time to numerical equivalent, adjusting for potential next day
    let adjustedTimeNum = timeNum;
    if (timeNum < startNum && endNum > 2400) { // If time is on the "next day" numerically
      adjustedTimeNum += 2400;
    }
    
    return adjustedTimeNum >= startNum && adjustedTimeNum < endNum;
  };

  // Check if two shifts overlap
  const shiftsOverlap = (shift1, shift2) => {
    // If shifts are identical, they "overlap" but we might ignore for this check unless we want to find duplicates.
    // Assuming we want to find distinct overlaps.
    if (shift1.id === shift2.id) return false; 

    // Helper to convert HH:MM to minutes from midnight for easier comparison
    const toMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    let start1 = toMinutes(shift1.start_time);
    let end1 = toMinutes(shift1.end_time);
    let start2 = toMinutes(shift2.start_time);
    let end2 = toMinutes(shift2.end_time);

    // Adjust for overnight shifts
    if (end1 <= start1) end1 += 24 * 60;
    if (end2 <= start2) end2 += 24 * 60;

    // Check for overlap: (start1 < end2 AND start2 < end1)
    return (start1 < end2 && start2 < end1);
  };



  const autoCheckSchedule = async () => {
    if (!schedules || !allUsers) {
      alert('Loading data, please try again in a moment');
      return;
    }

    const results = {
      overlaps: [],
      overtimeOfficers: [],
      exactlyFortyHours: [],
      splitShifts: [],
      aiSuggestions: []
    };

    // Use the currently displayed week instead of current payroll period
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    // Filter schedules for the displayed week
    const periodSchedules = schedules.filter(s => 
      parseISO(s.shift_date) >= parseISO(weekStartStr) && 
      parseISO(s.shift_date) <= parseISO(weekEndStr) &&
      s.officer_email !== 'OPEN'
    );

    // Check for overlaps
    const schedulesByDate = {};
    periodSchedules.forEach(schedule => {
      if (!schedulesByDate[schedule.shift_date]) {
        schedulesByDate[schedule.shift_date] = [];
      }
      schedulesByDate[schedule.shift_date].push(schedule);
    });

    Object.keys(schedulesByDate).forEach(date => {
      const daySchedules = schedulesByDate[date];
      
      // Group by officer
      const byOfficer = {};
      daySchedules.forEach(s => {
        if (!byOfficer[s.officer_email]) {
          byOfficer[s.officer_email] = [];
        }
        byOfficer[s.officer_email].push(s);
      });

      // Check for overlaps within each officer's schedule
      Object.keys(byOfficer).forEach(officerEmail => {
        const officerShifts = byOfficer[officerEmail];
        if (officerShifts.length > 1) {
          for (let i = 0; i < officerShifts.length; i++) {
            for (let j = i + 1; j < officerShifts.length; j++) {
              if (shiftsOverlap(officerShifts[i], officerShifts[j])) {
                const officer = allUsers.find(u => u.email === officerEmail);
                results.overlaps.push({
                  date,
                  officer: officer ? `${officer.first_name} ${officer.last_name}` : officerEmail,
                  shift1: `${officerShifts[i].start_time}-${officerShifts[i].end_time} at ${officerShifts[i].location}`,
                  shift2: `${officerShifts[j].start_time}-${officerShifts[j].end_time} at ${officerShifts[j].location}`
                });
              }
            }
          }
        }
      });
    });

    // Calculate hours for payroll week
    const calculateShiftHours = (startTime, endTime) => {
      let [startHour, startMin] = startTime.split(':').map(Number);
      let [endHour, endMin] = endTime.split(':').map(Number);
      
      let startDecimal = startHour + (startMin / 60);
      let endDecimal = endHour + (endMin / 60);
      
      // Handle overnight shifts
      if (endDecimal < startDecimal) {
        endDecimal += 24;
      }
      
      return endDecimal - startDecimal;
    };

    const getPayrollDay = (shiftDateStr, startTimeStr) => {
      const shiftStartDateTime = parseISO(`${shiftDateStr}T${startTimeStr}:00`);
      const shiftHour = shiftStartDateTime.getHours();
      
      if (shiftHour < 4) {
        const payrollDay = new Date(shiftStartDateTime);
        payrollDay.setDate(payrollDay.getDate() - 1);
        return format(payrollDay, 'yyyy-MM-dd');
      } else {
        return shiftDateStr;
      }
    };

    const getPayrollWeekStart = (payrollDay) => {
      const dt = parseISO(payrollDay);
      const dayOfWeek = dt.getDay();
      const daysSinceFriday = (dayOfWeek + 2) % 7;
      
      const weekStart = new Date(dt);
      weekStart.setDate(weekStart.getDate() - daysSinceFriday);
      return format(weekStart, 'yyyy-MM-dd');
    };

    // Check for split shifts (only those explicitly marked as split shifts)
    periodSchedules.forEach(schedule => {
      if (schedule.is_split_shift) {
        const officer = allUsers.find(u => u.email === schedule.officer_email);
        results.splitShifts.push({
          date: schedule.shift_date,
          officer: officer ? `${officer.first_name} ${officer.last_name}` : schedule.officer_email,
          time: `${schedule.start_time}-${schedule.end_time}`,
          location: schedule.location
        });
      }
    });

    // Calculate hours per payroll week
    const officerHours = {};
    periodSchedules.forEach(schedule => {
      if (!officerHours[schedule.officer_email]) {
        officerHours[schedule.officer_email] = {};
      }
      
      const payrollDay = getPayrollDay(schedule.shift_date, schedule.start_time);
      const weekStart = getPayrollWeekStart(payrollDay);
      
      if (!officerHours[schedule.officer_email][weekStart]) {
        officerHours[schedule.officer_email][weekStart] = 0;
      }
      
      const hours = calculateShiftHours(schedule.start_time, schedule.end_time);
      officerHours[schedule.officer_email][weekStart] += hours;
    });

    // Identify overtime and exactly 40 hours - each officer listed once per week
    Object.keys(officerHours).forEach(officerEmail => {
      const officer = allUsers.find(u => u.email === officerEmail);
      const officerName = officer ? `${officer.first_name} ${officer.last_name}` : officerEmail;
      
      Object.keys(officerHours[officerEmail]).forEach(weekStart => {
        const hours = officerHours[officerEmail][weekStart];
        
        if (hours > 40) {
          results.overtimeOfficers.push({
            officer: officerName,
            week: weekStart,
            totalHours: hours.toFixed(2),
            overtimeHours: (hours - 40).toFixed(2)
          });
        } else if (hours === 40) {
          results.exactlyFortyHours.push({
            officer: officerName,
            week: weekStart,
            totalHours: hours.toFixed(2)
          });
        }
      });
    });

    // Generate AI suggestions for conflicts
    if (results.overlaps.length > 0 || results.overtimeOfficers.length > 0) {
      try {
        // Get availability data for AI context
        const allAvailability = await base44.entities.OfficerAvailability.list();
        const siteAssignments = await base44.entities.SiteAssignment.list();

        const conflictContext = {
          overlaps: results.overlaps.map(o => ({
            officer: o.officer,
            date: o.date,
            shift1: o.shift1,
            shift2: o.shift2
          })),
          overtime: results.overtimeOfficers.map(ot => ({
            officer: ot.officer,
            week: ot.week,
            totalHours: ot.totalHours,
            overtimeHours: ot.overtimeHours
          })),
          availableOfficers: activeOfficers.map(o => {
            const avail = allAvailability.filter(a => a.officer_email === o.email);
            return {
              name: `${o.first_name} ${o.last_name}`,
              email: o.email,
              rank: o.rank,
              maxHours: avail[0]?.max_hours_per_week || 40,
              preferredShiftLength: avail[0]?.preferred_shift_length || 8,
              preferredSites: avail[0]?.preferred_locations || [],
              availability: avail.map(a => ({
                day: a.day_of_week,
                available: a.available,
                timeWindow: `${a.preferred_start_time || '18:00'}-${a.preferred_end_time || '04:00'}`
              }))
            };
          })
        };

        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `You are a scheduling assistant. Analyze these schedule conflicts and provide specific, actionable solutions.

CONFLICTS:
${JSON.stringify(conflictContext, null, 2)}

For each conflict, provide:
1. A clear explanation of the issue
2. 2-3 specific solutions with officer names who can cover
3. Consider officer availability, current hours, preferred sites, and rank when suggesting

Return ONLY a JSON array of suggestion objects with this structure:
{
  "conflictType": "overlap" | "overtime",
  "officer": "officer name",
  "issue": "brief description",
  "solutions": [
    {
      "action": "specific action to take",
      "assignTo": "officer email if reassigning",
      "reasoning": "why this solution works"
    }
  ]
}`,
          response_json_schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    conflictType: { type: "string" },
                    officer: { type: "string" },
                    issue: { type: "string" },
                    solutions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          action: { type: "string" },
                          assignTo: { type: "string" },
                          reasoning: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        results.aiSuggestions = aiResponse.suggestions || [];
      } catch (error) {
        console.error('Error generating AI suggestions:', error);
      }
    }

    setOverlapResults(results);
    setShowOverlapReport(true);
  };

  const isFutureWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return weekStart > today;
  }, [weekStart]);

  const locationHours = useMemo(() => {
    if (!schedules || !locations) return {};
    
    const hours = {};
    const weekStartFmt = format(weekStart, 'yyyy-MM-dd');
    const weekEndFmt = format(weekEnd, 'yyyy-MM-dd');

    const weekSchedules = schedules.filter(s => 
      s.shift_date >= weekStartFmt && 
      s.shift_date <= weekEndFmt &&
      s.officer_email !== 'OPEN' // Don't count open shifts
    );

    weekSchedules.forEach(schedule => {
      const locationSiteName = schedule.location.split(':')[0].trim();
      if (!hours[locationSiteName]) {
        hours[locationSiteName] = 0;
      }
      const shiftHours = calculateShiftHours(schedule.start_time, schedule.end_time);
      hours[locationSiteName] += shiftHours;
    });

    return hours;
  }, [schedules, locations, weekStart, weekEnd, calculateShiftHours]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="scheduling-page p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Weekly Schedule</h1>
              <p className="text-sm text-slate-600">Drag and drop shifts to reschedule</p>
            </div>
          </div>

        </div>

        {currentPeriod && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-300 print:hidden">
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
                      💰 Direct Deposit: {format(parseISO(currentPeriod.deposit_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <Badge className="bg-green-600 text-white">Active Period</Badge>
            </div>
          </div>
        )}

        {isFutureWeek && (selectedPayrollPeriod === "all" || !selectedPayrollPeriod) && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border-2 border-amber-300 print:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-700" />
                <div>
                  <p className="font-bold text-amber-900">Future Week Detected</p>
                  <p className="text-sm text-amber-700">
                    You can copy the schedule from the previous week to save time
                  </p>
                </div>
              </div>
              <Button
                onClick={handleCopyPreviousWeek}
                disabled={bulkCreateShiftsMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${bulkCreateShiftsMutation.isPending ? 'animate-spin' : ''}`} />
                {bulkCreateShiftsMutation.isPending ? 'Copying...' : 'Copy All'}
              </Button>
              <Button
                onClick={() => setShowSelectiveCopyDialog(true)}
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              >
                <User className="w-4 h-4 mr-2" />
                Copy Select Officers
              </Button>
            </div>
          </div>
        )}

        <Card className="border-none shadow-lg print:hidden">
          <CardHeader>
            <CardTitle>Schedule Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center gap-4 p-4 rounded-lg border-2 ${weekStatus?.is_ready ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
              <Checkbox
                id="week-ready"
                checked={weekStatus?.is_ready || false}
                onCheckedChange={(checked) => markWeekReadyMutation.mutate(checked)}
                disabled={markWeekReadyMutation.isPending}
              />
              <div className="flex-1">
                <Label htmlFor="week-ready" className={`cursor-pointer font-semibold ${weekStatus?.is_ready ? 'text-green-900' : 'text-amber-900'}`}>
                  {weekStatus?.is_ready ? '✓ Week Schedule Published' : '⚠️ Schedule Not Yet Published'}
                </Label>
                <p className={`text-xs mt-1 ${weekStatus?.is_ready ? 'text-green-700' : 'text-amber-700'}`}>
                  {weekStatus?.is_ready 
                    ? 'Officers and clients can view this week\'s schedule. Uncheck to hide it while making changes.'
                    : 'Check this box to publish the schedule. Officers and clients cannot see it until published.'}
                </p>
              </div>
              {weekStatus?.is_ready && (
                <Badge className="bg-green-600 text-white">Published</Badge>
              )}
              {!weekStatus?.is_ready && (
                <Badge className="bg-amber-600 text-white">Not Published</Badge>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <Label className="text-xs text-slate-600 mb-2 block">Schedule View</Label>
                <Select value={scheduleViewType} onValueChange={setScheduleViewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly (7 days)</SelectItem>
                    <SelectItem value="biweekly">Bi-Weekly (14 days)</SelectItem>
                    <SelectItem value="monthly">Monthly (30 days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <Label className="text-xs text-slate-600 mb-2 block">Filter by Division/Subdivision</Label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by division..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Divisions</SelectItem>
                    {divisions
                      ?.filter(d => !d.is_subdivision)
                      .map((div) => (
                        <SelectItem key={div.id} value={div.division_name}>
                          {div.division_name}
                        </SelectItem>
                      ))}
                    {divisions
                      ?.filter(d => d.is_subdivision)
                      .map((div) => (
                        <SelectItem key={div.id} value={div.subdivision || div.division_name}>
                          {div.parent_division ? `${div.parent_division} → ` : ''}{div.subdivision || div.division_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <Label className="text-xs text-slate-600 mb-2 block">View by Payroll Period</Label>
                <Select value={selectedPayrollPeriod} onValueChange={setSelectedPayrollPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Weekly View (7 days - Manual Navigation)</SelectItem>
                    <SelectItem value="current">Current Payroll Period (14 days)</SelectItem>
                    {payrollPeriods?.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.period_name} ({format(parseISO(period.start_date), 'MMM d')} - {format(parseISO(period.end_date), 'MMM d, yyyy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                onClick={handleClearAllShifts}
                disabled={clearAllShiftsMutation.isPending}
                variant="destructive"
              >
                <Trash2 className={`w-4 h-4 mr-2 ${clearAllShiftsMutation.isPending ? 'animate-spin' : ''}`} />
                {clearAllShiftsMutation.isPending ? 'Clearing...' : 'Clear Week'}
              </Button>
              <Button
                onClick={handlePrintCompanySchedule}
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Company
              </Button>
              <Button
                onClick={() => setShowPrintDialog(true)}
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Officer
              </Button>
              <Button
                onClick={autoCheckSchedule}
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Auto Check
              </Button>

              <Button
                onClick={() => setShowAddDialog(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Shift
              </Button>
            </div>
          </CardContent>
        </Card>

        {(selectedPayrollPeriod === "all" || !selectedPayrollPeriod) && (
          <div className="flex items-center justify-between bg-gradient-to-r from-green-100 to-blue-100 p-3 rounded-lg border-2 border-green-600 print:hidden">
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
              className="bg-white text-sm"
              size="sm"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <div className="text-center">
              <p className="font-bold text-slate-900 text-base">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </p>
              <p className="text-xs text-slate-600">
                {scheduleViewType === "weekly" ? "7 Days" : scheduleViewType === "biweekly" ? "14 Days" : "30 Days"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
              className="bg-white text-sm"
              size="sm"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {selectedPayrollPeriod && selectedPayrollPeriod !== "all" && (
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 p-3 rounded-lg border-2 border-purple-400 print:hidden">
            <div className="text-center">
              <p className="font-bold text-purple-900 text-base">
                {selectedPayrollPeriod === "current" 
                  ? currentPeriod?.period_name 
                  : payrollPeriods?.find(p => p.id === selectedPayrollPeriod)?.period_name}
              </p>
              <p className="text-sm text-purple-700">
                {format(weekStart, 'MMM d, yyyy')} - {format(weekEnd, 'MMM d, yyyy')} (14 Days - Full Pay Period)
              </p>
              {(selectedPayrollPeriod === "current" ? currentPeriod?.deposit_date : payrollPeriods?.find(p => p.id === selectedPayrollPeriod)?.deposit_date) && (
                <p className="text-xs text-purple-600 mt-1">
                  💰 Direct Deposit: {format(parseISO(selectedPayrollPeriod === "current" ? currentPeriod.deposit_date : payrollPeriods.find(p => p.id === selectedPayrollPeriod).deposit_date), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* This block is removed as the handlePrintOfficerSchedule now generates its own print window */}
        {/*
        {selectedOfficerForPrint && printOfficerData && printStartDate && printEndDate && (
          <div className="hidden print:block">
            <div className="bg-white p-8">
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-slate-200">
                <div className="flex items-center gap-3">
                  <img src={LOGO_URL} alt="Black Point Protection" className="w-16 h-16 object-contain" />
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">BLACK POINT PROTECTION</h2>
                    <p className="text-slate-600">Richmond, VA</p>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    OFFICER SCHEDULE
                  </h3>
                  <p className="text-slate-600">
                    {format(parseISO(printStartDate), 'MMM d, yyyy')} - {format(parseISO(printEndDate), 'MMM d, yyyy')}
                  </p>
                  <p className="text-slate-600">
                    Generated: {format(new Date(), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>

              <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Officer</p>
                    <p className="text-lg font-bold text-blue-900">{getOfficerName(selectedOfficerForPrint)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Unit Number</p>
                    <p className="text-lg font-bold text-blue-900">{getOfficerUnitNumber(selectedOfficerForPrint) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Total Hours</p>
                    <p className="2xl font-bold text-blue-900">{printOfficerData.totalHours.toFixed(2)}h</p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Status</p>
                    {printOfficerData.hasOvertime ? (
                      <div>
                        <p className="text-lg font-bold text-orange-600">OVERTIME</p>
                        <p className="text-sm text-orange-700">+{printOfficerData.overtimeHours.toFixed(2)}h overtime</p>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-green-600">Regular Time</p>
                    )}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-300">
                    <th className="text-left p-3 font-bold">Date</th>
                    <th className="text-left p-3 font-bold">Day</th>
                    <th className="text-left p-3 font-bold">Time</th>
                    <th className="text-left p-3 font-bold">Location</th>
                    <th className="text-right p-3 font-bold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const daysInRange = [];
                    let current = parseISO(printStartDate);
                    const end = parseISO(printEndDate);
                    while (current <= end) {
                      daysInRange.push(current);
                      current = addDays(current, 1);
                    }
                    
                    return daysInRange.map((day) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      // Filter schedules where the shift either starts on this day, or is a split shift ending on this day
                      const daySchedules = printOfficerData.schedules
                        .filter(s => {
                          const shiftStartDate = parseISO(s.shift_date);
                          const shiftEndDate = s.is_split_shift ? addDays(shiftStartDate, 1) : shiftStartDate;
                          return format(shiftStartDate, 'yyyy-MM-dd') === dateStr || 
                                 (s.is_split_shift && format(shiftEndDate, 'yyyy-MM-dd') === dateStr);
                        })
                        .sort((a,b) => {
                          // Sort split shifts (starting previous day) before normal shifts on this day
                          const aIsOvernightEndingToday = a.is_split_shift && format(addDays(parseISO(a.shift_date), 1), 'yyyy-MM-dd') === dateStr;
                          const bIsOvernightEndingToday = b.is_split_shift && format(addDays(parseISO(b.shift_date), 1), 'yyyy-MM-dd') === dateStr;
                          if (aIsOvernightEndingToday && !bIsOvernightEndingToday) return -1;
                          if (!aIsOvernightEndingToday && bIsOvernightEndingToday) return 1;
                          return a.start_time.localeCompare(b.start_time);
                        });
                      
                      if (daySchedules.length === 0) {
                        return (
                          <tr key={dateStr} className="border-b border-slate-200">
                            <td className="p-3">{format(day, 'MMM d, yyyy')}</td>
                            <td className="p-3">{format(day, 'EEEE')}</td>
                            <td className="p-3 text-slate-400" colSpan="2">Off Day</td>
                            <td className="p-3 text-right text-slate-400">-</td>
                          </tr>
                        );
                      }

                      return daySchedules.map((schedule, idx) => (
                        <tr key={`${dateStr}-${idx}`} className="border-b border-slate-200">
                          {idx === 0 && (
                            <>
                              <td className="p-3" rowSpan={daySchedules.length}>{format(day, 'MMM d, yyyy')}</td>
                              <td className="p-3" rowSpan={daySchedules.length}>{format(day, 'EEEE')}</td>
                            </>
                          )}
                          <td className="p-3">{schedule.start_time} - {schedule.end_time}</td>
                          <td className="p-3">{schedule.location.split(':')[0]}</td>
                          <td className="p-3 text-right font-semibold">
                            {calculateShiftHours(schedule.start_time, schedule.end_time).toFixed(2)}h
                          </td>
                        </tr>
                      ));
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td colSpan="4" className="p-3 text-right font-bold">Total:</td>
                    <td className="p-3 text-right">
                      <span className="2xl font-bold">{printOfficerData.totalHours.toFixed(2)}h</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        */}

        {/* The company print remains using the older pattern */}
        {(!selectedOfficerForPrint) && (
          <div className="hidden print:block">
            <div className="bg-white p-4">
              <div className="text-center mb-3 pb-2 border-b-2 border-slate-300">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <img src={LOGO_URL} alt="Black Point Protection" className="w-12 h-12 object-contain" />
                  <h1 className="text-xl font-bold uppercase">BLACK POINT PROTECTION WEEKLY SCHEDULE</h1>
                </div>
                <p className="text-sm font-semibold">
                  {format(weekStart, 'MMMM d, yyyy')} - {format(weekEnd, 'MMMM d, yyyy')}
                </p>
              </div>

              <div className="mb-2 text-[9px] flex gap-2">
                <span className="bg-yellow-200 px-1 py-0.5">ADJUSTED</span>
                <span className="bg-cyan-200 px-1 py-0.5">OPEN SHIFT</span>
                <span className="bg-red-200 px-1 py-0.5">CANCELLED</span>
              </div>

              {Object.keys(divisionGroups).length === 0 ? (
                <p className="text-center text-slate-500 py-8">No shifts scheduled for this period.</p>
              ) : (
                Object.entries(divisionGroups).sort(([a], [b]) => a.localeCompare(b)).map(([divisionName, locationData], divIdx) => (
                  <div key={divisionName} className={`mb-6 ${divIdx > 0 ? 'page-break-before' : ''}`}>
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white font-bold text-center py-2 mb-3 text-sm rounded">
                      {divisionName}
                    </div>

                    {Object.entries(locationData).map(([locationSiteName, locData]) => {
                      const sortedOfficers = sortOfficersByUnitNumber(locData.officers);
                      const locationTotalHours = locData.schedules.reduce((sum, s) => sum + calculateShiftHours(s.start_time, s.end_time), 0);

                      return (
                        <div key={locationSiteName} className="mb-4 page-break-inside-avoid">
                          <table className="w-full border-collapse text-[8px]">
                            <thead>
                              <tr className="bg-green-300">
                                <th className="border border-slate-400 p-1 text-left font-bold">Property / Officer</th>
                                {weekDays.map((day) => (
                                  <th key={day.toString()} className="border border-slate-400 p-1 text-center font-bold">
                                    <div className="text-[9px]">{format(day, 'EEE')}</div>
                                    <div className="text-[7px]">{format(day, 'M/d')}</div>
                                  </th>
                                ))}
                                <th className="border border-slate-400 p-1 text-center font-bold">Total</th>
                              </tr>
                              <tr className="bg-blue-100">
                                <td colSpan={weekDays.length + 2} className="border border-slate-400 p-1 font-bold text-[9px]">
                                  {locationSiteName}
                                  </td>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedOfficers.map((officerEmail, officerIdx) => {
                                const officerSchedules = locData.schedules.filter(s => 
                                  s.officer_email === officerEmail
                                );
                                const totalOfficerHours = officerSchedules.reduce((sum, s) => {
                                  return sum + calculateShiftHours(s.start_time, s.end_time);
                                }, 0);

                                const tableRank = getOfficerRank(officerEmail);
                                const showTableRank = tableRank && (
                                  tableRank.includes('Sergeant') || 
                                  tableRank.includes('Lieutenant') || 
                                  tableRank.includes('Captain') ||
                                  tableRank.includes('Operations Manager') ||
                                  tableRank.includes('Supervisor')
                                );
                                const officerRankShort = showTableRank ? tableRank
                                  .replace('Operations Manager', 'OM')
                                  .replace('Supervisor', 'Sup')
                                  .replace('Sergeant', 'Sgt')
                                  .replace('Lieutenant', 'Lt')
                                  .replace('Captain', 'Cpt')
                                  .trim() : '';
                                
                                const officerUnit = getOfficerUnitNumber(officerEmail);

                                return (
                                  <tr key={`${locationSiteName}-${officerEmail}`} className={officerIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="border border-slate-400 p-1 font-semibold text-[8px]">
                                      {officerEmail === "OPEN" ? (
                                        "OPEN SHIFT"
                                      ) : (
                                        <>
                                          {officerUnit && `#${officerUnit} `}
                                          {officerRankShort} {getOfficerName(officerEmail)}
                                        </>
                                      )}
                                    </td>
                                    {weekDays.map((day) => {
                                      const dateStr = format(day, 'yyyy-MM-dd');
                                      const daySchedules = getScheduleForDateOfficerAndLocation(day, officerEmail, locationSiteName);
                                      
                                      return (
                                        <td key={day.toString()} className="border border-slate-400 p-1 text-center">
                                          {daySchedules.map((schedule, idx) => (
                                            <div key={idx} className={`text-[7px] leading-tight mb-0.5 ${schedule.is_open ? 'bg-cyan-100' : ''} ${schedule.is_split_shift ? 'bg-purple-100' : ''}`}>
                                              {schedule.start_time}-{schedule.end_time}
                                            </div>
                                          ))}
                                        </td>
                                      );
                                    })}
                                    <td className="border border-slate-400 p-1 text-center font-bold text-[8px]">
                                      {totalOfficerHours.toFixed(1)}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-blue-50">
                                <td colSpan={weekDays.length + 1} className="border border-slate-400 p-1 text-right font-bold text-[8px]">
                                  Location Total:
                                </td>
                                <td className="border border-slate-400 p-1 text-center font-bold text-[8px]">
                                  {locationTotalHours.toFixed(1)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}

              <div className="mt-2 pt-2 border-t border-slate-300 text-center text-[8px] text-slate-500">
                <p>Black Point Protection - Richmond, VA | Confidential Document</p>
                <p className="text-[7px] mt-1">Generated: {format(new Date(), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>
          </div>
        )}

        {showOverlapReport && overlapResults && (
          <Card className="border-none shadow-lg bg-purple-50 border-2 border-purple-300 print:hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-purple-900">Schedule Analysis Report</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowOverlapReport(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overlaps */}
              <div>
                <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Schedule Overlaps ({overlapResults.overlaps.length})
                </h3>
                {overlapResults.overlaps.length > 0 ? (
                  <ScrollArea className="h-48 bg-white rounded-lg border border-red-200">
                    <div className="p-4 space-y-2">
                      {overlapResults.overlaps.map((overlap, idx) => (
                        <Alert key={idx} variant="destructive">
                          <AlertDescription>
                            <strong>{overlap.officer}</strong> on {format(parseISO(overlap.date), 'MMM d, yyyy')}:<br/>
                            • {overlap.shift1}<br/>
                            • {overlap.shift2}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-green-700 bg-green-50 p-3 rounded border border-green-200">✓ No overlaps found</p>
                )}
              </div>

              {/* Split Shifts */}
              <div>
                <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Split Shifts (Overnight) ({overlapResults.splitShifts.length})
                </h3>
                {overlapResults.splitShifts.length > 0 ? (
                  <ScrollArea className="h-48 bg-white rounded-lg border border-purple-200">
                    <div className="p-4 space-y-2">
                      {overlapResults.splitShifts.map((shift, idx) => (
                        <div key={idx} className="bg-purple-50 p-3 rounded border border-purple-200">
                          <p><strong>{shift.officer}</strong></p>
                          <p className="text-sm">Week of {format(parseISO(shift.date), 'MMM d, yyyy')}: {shift.time} at {shift.location}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-slate-600 bg-slate-50 p-3 rounded border border-slate-200">No split shifts found</p>
                )}
              </div>

              {/* Overtime */}
              <div>
                <h3 className="font-bold text-orange-900 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Officers with Overtime ({overlapResults.overtimeOfficers.length})
                </h3>
                {overlapResults.overtimeOfficers.length > 0 ? (
                  <ScrollArea className="h-48 bg-white rounded-lg border border-orange-200">
                    <div className="p-4 space-y-2">
                      {overlapResults.overtimeOfficers.map((ot, idx) => (
                        <div key={idx} className="bg-orange-50 p-3 rounded border border-orange-200">
                          <p><strong>{ot.officer}</strong></p>
                          <p className="text-sm">Week of {format(parseISO(ot.week), 'MMM d, yyyy')}: {ot.totalHours} hours ({ot.overtimeHours} OT)</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-slate-600 bg-slate-50 p-3 rounded border border-slate-200">No overtime scheduled</p>
                )}
              </div>

              {/* Exactly 40 Hours */}
              <div>
                <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Officers with Exactly 40 Hours ({overlapResults.exactlyFortyHours.length})
                </h3>
                {overlapResults.exactlyFortyHours.length > 0 ? (
                  <ScrollArea className="h-48 bg-white rounded-lg border border-green-200">
                    <div className="p-4 space-y-2">
                      {overlapResults.exactlyFortyHours.map((officer, idx) => (
                        <div key={idx} className="bg-green-50 p-3 rounded border border-green-200">
                          <p><strong>{officer.officer}</strong></p>
                          <p className="text-sm">Week of {format(parseISO(officer.week), 'MMM d, yyyy')}: {officer.totalHours} hours</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-slate-600 bg-slate-50 p-3 rounded border border-slate-200">No officers scheduled for exactly 40 hours</p>
                )}
              </div>

              {/* AI Suggestions */}
              {overlapResults.aiSuggestions && overlapResults.aiSuggestions.length > 0 && (
                <div>
                  <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                    <div className="w-5 h-5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded flex items-center justify-center text-white text-xs font-bold">AI</div>
                    Resolution Suggestions ({overlapResults.aiSuggestions.length})
                  </h3>
                  <ScrollArea className="h-96 bg-white rounded-lg border border-indigo-200">
                    <div className="p-4 space-y-4">
                      {overlapResults.aiSuggestions.map((suggestion, idx) => (
                        <div key={idx} className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                          <div className="flex items-start gap-3 mb-3">
                            <Badge className={suggestion.conflictType === 'overlap' ? 'bg-red-600' : 'bg-orange-600'}>
                              {suggestion.conflictType === 'overlap' ? 'Double Booking' : 'Overtime'}
                            </Badge>
                            <div className="flex-1">
                              <p className="font-bold text-indigo-900">{suggestion.officer}</p>
                              <p className="text-sm text-slate-700 mt-1">{suggestion.issue}</p>
                            </div>
                          </div>
                          <div className="space-y-2 pl-3 border-l-2 border-indigo-300">
                            {suggestion.solutions?.map((sol, solIdx) => (
                              <div key={solIdx} className="bg-white p-3 rounded border border-indigo-100">
                                <p className="text-sm font-semibold text-indigo-900 mb-1">
                                  Solution {solIdx + 1}: {sol.action}
                                </p>
                                {sol.assignTo && (
                                  <p className="text-xs text-indigo-700 mb-1">
                                    👤 Assign to: <strong>{sol.assignTo}</strong>
                                  </p>
                                )}
                                <p className="text-xs text-slate-600 italic">{sol.reasoning}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        )}



        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="bg-white rounded-lg shadow-lg overflow-x-auto border-2 border-slate-300 print:hidden">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gradient-to-r from-green-400 to-blue-400">
                  <th className="border border-slate-400 p-2 text-left min-w-[180px] sticky left-0 bg-green-400 z-10">
                    <div className="font-bold text-slate-900 text-xs">Property / Officer</div>
                  </th>
                  {weekDays.map((day) => (
                    <th key={day.toString()} className="border border-slate-400 p-2 text-center min-w-[100px]">
                      <div className="text-slate-900 font-bold text-xs">{format(day, 'EEE')}</div>
                      <div className="text-slate-900 text-[10px]">{format(day, 'M/d')}</div>
                    </th>
                  ))}
                  <th className="border border-slate-400 p-2 text-center min-w-[60px] bg-green-400">
                    <div className="font-bold text-slate-900 text-xs">Total</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(locationGroups).length === 0 && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="p-4 text-center text-slate-500">
                      No shifts scheduled for this period.
                    </td>
                  </tr>
                )}
                {Object.entries(locationGroups).map(([locationSiteName, officers], locationIdx) => {
                  const locationSchedules = weekDivisionalSchedules?.filter(s => s.location.split(':')[0].trim() === locationSiteName) || [];
                  const totalLocationHours = locationSchedules.reduce((sum, s) => {
                    return sum + calculateShiftHours(s.start_time, s.end_time);
                  }, 0);

                  const sortedOfficersUI = sortOfficersByUnitNumber(officers);

                  return (
                    <React.Fragment key={locationSiteName}>
                      <tr className="bg-blue-100">
                        <td colSpan={weekDays.length + 2} className="border border-slate-400 p-2 font-bold text-slate-900 text-xs sticky left-0 bg-blue-100 z-10">
                          {locationSiteName}
                        </td>
                      </tr>
                      {sortedOfficersUI.map((officerEmail, officerIdx) => {
                        const officerSchedules = weekDivisionalSchedules?.filter(s => 
                          s.officer_email === officerEmail && s.location.split(':')[0].trim() === locationSiteName
                        ) || [];
                        const totalOfficerHours = officerSchedules.reduce((sum, s) => {
                          return sum + calculateShiftHours(s.start_time, s.end_time);
                        }, 0);

                        const officerRank = getOfficerRank(officerEmail);
                        const officerUnit = getOfficerUnitNumber(officerEmail);

                        return (
                          <tr key={`${locationSiteName}-${officerEmail}`} className={officerIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="border border-slate-400 p-2 font-semibold text-slate-900 text-xs sticky left-0 z-10" style={{backgroundColor: officerIdx % 2 === 0 ? 'white' : '#f8fafc'}}>
                              <div className="flex items-center gap-2">
                                {officerUnit && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                    #{officerUnit}
                                  </span>
                                )}
                                <div>
                                  <div>{getOfficerName(officerEmail)}</div>
                                  {officerRank && <div className="text-[10px] text-slate-500">{officerRank}</div>}
                                </div>
                              </div>
                            </td>
                            {weekDays.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const daySchedules = getScheduleForDateOfficerAndLocation(day, officerEmail, locationSiteName);
                              const droppableId = `schedule-${locationSiteName}-${officerEmail}-${dateStr}`;

                              return (
                                <td key={day.toString()} className="border border-slate-400 p-1">
                                  <Droppable droppableId={droppableId}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`min-h-[40px] p-1 rounded ${snapshot.isDraggingOver ? 'bg-blue-100' : ''}`}
                                      >
                                        {daySchedules.map((schedule, index) => (
                                          <Draggable
                                            key={schedule.id}
                                            draggableId={schedule.id}
                                            index={index}
                                          >
                                            {(provided, snapshot) => (
                                              <div
                                                ref={provided.innerRef}
                                                {...provided.dragHandleProps}
                                                {...provided.draggableProps}
                                                className={`p-1 mb-1 text-[10px] font-semibold text-center rounded cursor-move ${
                                                  snapshot.isDragging ? 'bg-blue-200 shadow-lg' : 'bg-slate-200 hover:bg-slate-300'
                                                } ${schedule.is_split_shift ? 'bg-purple-200 hover:bg-purple-300' : ''}`}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span>{schedule.start_time}-{schedule.end_time}</span>
                                                  <div className="flex items-center gap-1">
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditShift(schedule);
                                                      }}
                                                      className="text-blue-600 hover:text-blue-800"
                                                    >
                                                      <Pencil className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteShift(schedule.id);
                                                      }}
                                                      className="text-red-600 hover:text-red-800"
                                                    >
                                                      <Trash2 className="w-3 h-3" />
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </Draggable>
                                        ))}
                                        {provided.placeholder}
                                      </div>
                                    )}
                                  </Droppable>
                                </td>
                              );
                            })}
                            <td className="border border-slate-400 p-2 text-center font-bold text-slate-900 text-xs">
                              {totalOfficerHours.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-blue-50">
                        <td colSpan={weekDays.length + 1} className="border border-slate-400 p-2 text-right font-bold text-slate-900 text-xs sticky left-0 bg-blue-50 z-10">
                          Location Total:
                        </td>
                        <td className="border border-slate-400 p-2 text-center font-bold text-slate-900 text-xs">
                          {totalLocationHours.toFixed(1)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DragDropContext>

        <Card className="border-none shadow-lg print:hidden">
          <CardHeader>
            <CardTitle>Hours by Location - This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations?.map((location) => (
                <LocationHourCard key={location.id} location={location} hours={locationHours[location.site_name] || 0} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Officer Hours Summary for Payroll Week */}
        <Card className="border-none shadow-lg print:hidden">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-100 border-b-2 border-blue-300">
            <CardTitle className="text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Officer Hours Summary (Payroll Week)
            </CardTitle>
            {(() => {
              // Find which payroll period the current week falls into
              const weekStartStr = format(weekStart, 'yyyy-MM-dd');
              const applicablePeriod = payrollPeriods?.find(p => 
                p.start_date <= weekStartStr && p.end_date >= weekStartStr
              );
              
              return (
                <p className="text-sm text-slate-700 mt-1 font-medium">
                  {applicablePeriod 
                    ? `Payroll Period: ${applicablePeriod.period_name} (${format(parseISO(applicablePeriod.start_date), 'MMM d')} - ${format(parseISO(applicablePeriod.end_date), 'MMM d, yyyy')})`
                    : 'No payroll period found for this week'}
                </p>
              );
            })()}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-green-200 border-b-2 border-slate-300">
                    <th className="p-2 text-left font-bold text-xs">#</th>
                    <th className="p-2 text-left font-bold text-xs">Unit</th>
                    <th className="p-2 text-left font-bold text-xs">Officer Name</th>
                    <th className="p-2 text-left font-bold text-xs">Rank</th>
                    <th className="p-2 text-center font-bold text-xs">Regular Hrs</th>
                    <th className="p-2 text-center font-bold text-xs">OT Hrs</th>
                    <th className="p-2 text-center font-bold text-xs">Total Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const getPayrollWeekKey = (dateStr) => {
                      const date = parseISO(dateStr);
                      const dayOfWeek = date.getDay();
                      const daysSinceFriday = (dayOfWeek + 2) % 7;
                      const fridayStart = new Date(date);
                      fridayStart.setDate(fridayStart.getDate() - daysSinceFriday);
                      return format(fridayStart, 'yyyy-MM-dd');
                    };
                    
                    const payrollWeekStart = getPayrollWeekKey(format(weekStart, 'yyyy-MM-dd'));
                    const payrollWeekEnd = format(addDays(parseISO(payrollWeekStart), 6), 'yyyy-MM-dd');
                    
                    const payrollWeekSchedules = schedules?.filter(s => {
                      const shiftDate = s.shift_date;
                      return shiftDate >= payrollWeekStart && shiftDate <= payrollWeekEnd && s.officer_email !== 'OPEN';
                    }) || [];
                    
                    const officerHoursSummary = {};
                    
                    payrollWeekSchedules.forEach(schedule => {
                      if (!officerHoursSummary[schedule.officer_email]) {
                        officerHoursSummary[schedule.officer_email] = 0;
                      }
                      officerHoursSummary[schedule.officer_email] += calculateShiftHours(schedule.start_time, schedule.end_time);
                    });
                    
                    const sortedOfficers = Object.keys(officerHoursSummary).sort((a, b) => {
                      const unitA = getOfficerUnitNumber(a);
                      const unitB = getOfficerUnitNumber(b);
                      if (unitA && unitB) {
                        const numA = parseInt(unitA);
                        const numB = parseInt(unitB);
                        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                      }
                      return getOfficerName(a).localeCompare(getOfficerName(b));
                    });
                    
                    let totalRegular = 0;
                    let totalOT = 0;
                    let totalHours = 0;
                    
                    return (
                      <>
                        {sortedOfficers.map((email, idx) => {
                          const hours = officerHoursSummary[email];
                          const regular = Math.min(hours, 40);
                          const ot = Math.max(0, hours - 40);
                          totalRegular += regular;
                          totalOT += ot;
                          totalHours += hours;
                          
                          const officer = allUsers?.find(u => u.email === email);
                          const name = officer ? `${officer.first_name} ${officer.last_name}` : email;
                          const rank = getOfficerRank(email);
                          const unit = getOfficerUnitNumber(email);
                          
                          return (
                            <tr key={email} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="p-2 text-center text-xs border-b border-slate-200">{idx + 1}</td>
                              <td className="p-2 text-center font-bold text-xs border-b border-slate-200">
                                {unit ? `#${unit}` : '-'}
                              </td>
                              <td className="p-2 text-xs border-b border-slate-200">{name}</td>
                              <td className="p-2 text-xs border-b border-slate-200">{rank}</td>
                              <td className="p-2 text-center text-xs border-b border-slate-200">{regular.toFixed(1)}</td>
                              <td className={`p-2 text-center text-xs border-b border-slate-200 ${ot > 0 ? 'text-red-600 font-bold' : ''}`}>
                                {ot.toFixed(1)}
                              </td>
                              <td className="p-2 text-center font-bold text-xs border-b border-slate-200">{hours.toFixed(1)}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-blue-100 font-bold border-t-2 border-slate-400">
                          <td colSpan="4" className="p-2 text-right text-xs">TOTALS:</td>
                          <td className="p-2 text-center text-xs">{totalRegular.toFixed(1)}</td>
                          <td className="p-2 text-center text-xs text-red-600">{totalOT.toFixed(1)}</td>
                          <td className="p-2 text-center text-xs">{totalHours.toFixed(1)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print Officer Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="print_officer">Select Officer *</Label>
              <Select
                value={selectedOfficerForPrint}
                onValueChange={setSelectedOfficerForPrint}
              >
                <SelectTrigger id="print_officer">
                  <SelectValue placeholder="Select officer..." />
                </SelectTrigger>
                <SelectContent>
                  {activeOfficers
                    .sort((a, b) => {
                      const unitA = a.unit_number || "";
                      const unitB = b.unit_number || "";
                      if (unitA && unitB) {
                        const numA = parseInt(unitA);
                        const numB = parseInt(unitB);
                        if (!isNaN(numA) && !isNaN(numB)) {
                          return numA - numB;
                        }
                      }
                      return getOfficerName(a.email).localeCompare(getOfficerName(b.email));
                    })
                    .map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        <div className="flex items-center gap-2">
                          {officer.unit_number && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                              #{officer.unit_number}
                            </span>
                          )}
                          <span>
                            {officer.first_name && officer.last_name 
                              ? `${officer.first_name} ${officer.last_name}` 
                              : officer.full_name || officer.email}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date Range *</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="print_start" className="text-xs text-slate-500">Start Date</Label>
                  <Input
                    id="print_start"
                    type="date"
                    value={printStartDate}
                    onChange={(e) => setPrintStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="print_end" className="text-xs text-slate-500">End Date</Label>
                  <Input
                    id="print_end"
                    type="date"
                    value={printEndDate}
                    onChange={(e) => setPrintEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Or Select Payroll Period</Label>
              <Select
                value=""
                onValueChange={(value) => {
                  if (value === "current") {
                    setPrintStartDate(currentPeriod?.start_date || "");
                    setPrintEndDate(currentPeriod?.end_date || "");
                  } else {
                    const period = payrollPeriods?.find(p => p.id === value);
                    if (period) {
                      setPrintStartDate(period.start_date);
                      setPrintEndDate(period.end_date);
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Quick select period..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current Payroll Period</SelectItem>
                  {payrollPeriods?.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.period_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOfficerForPrint && printStartDate && printEndDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-blue-700 font-semibold">Total Hours:</p>
                    <p className="text-blue-900 font-bold text-lg">
                      {/* Recalculate hours dynamically for display based on selected range */}
                      {getOfficerScheduleForDateRange(selectedOfficerForPrint, printStartDate, printEndDate)?.totalHours.toFixed(2) || '0.00'}h
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-semibold">Status:</p>
                    {getOfficerScheduleForDateRange(selectedOfficerForPrint, printStartDate, printEndDate)?.hasOvertime ? (
                      <div>
                        <p className="text-orange-600 font-bold text-lg">OVERTIME</p>
                        <p className="text-xs text-orange-700">
                          {getOfficerScheduleForDateRange(selectedOfficerForPrint, printStartDate, printEndDate)?.overtimeHours.toFixed(2)}h overtime
                        </p>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-green-600">Regular Time</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePrintOfficerSchedule}
                disabled={!selectedOfficerForPrint || !printStartDate || !printEndDate}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MobileResponsiveDialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <MobileResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <MobileResponsiveDialogHeader>
            <MobileResponsiveDialogTitle>Add New Shift</MobileResponsiveDialogTitle>
          </MobileResponsiveDialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <input
                type="checkbox"
                id="is_open"
                checked={newShift.is_open}
                onChange={(e) => setNewShift({ ...newShift, is_open: e.target.checked, officer_email: e.target.checked ? "" : newShift.officer_email })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_open" className="text-sm font-medium text-blue-900 cursor-pointer">
                Mark as Open Shift (available for officers to bid on)
              </Label>
            </div>

            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <input
                type="checkbox"
                id="is_split_shift"
                checked={newShift.is_split_shift}
                onChange={(e) => setNewShift({ ...newShift, is_split_shift: e.target.checked, linked_shift_id: e.target.checked ? newShift.linked_shift_id : "" })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_split_shift" className="text-sm font-medium text-purple-900 cursor-pointer">
                Split Shift (will appear purple - optionally link to another shift on the same day)
              </Label>
            </div>

            {!newShift.is_open && (
              <div className="space-y-2">
                <Label htmlFor="officer">Officer *</Label>
                <Select
                  value={newShift.officer_email}
                  onValueChange={(value) => setNewShift({ ...newShift, officer_email: value })}
                >
                  <SelectTrigger id="officer">
                    <SelectValue placeholder="Select officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeOfficers.map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name && officer.last_name 
                          ? `${officer.first_name} ${officer.last_name}` 
                          : officer.full_name || officer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!applyToWholeWeek && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="shift_type">Shift Type</Label>
                  <Select
                    value={newShift.shift_type}
                    onValueChange={(value) => setNewShift({ ...newShift, shift_type: value })}
                  >
                    <SelectTrigger id="shift_type">
                      <SelectValue placeholder="Select shift type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="holiday_coverage">Holiday Coverage</SelectItem>
                      <SelectItem value="rush_coverage">Rush Coverage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Select
                    value={newShift.location}
                    onValueChange={(value) => setNewShift({ ...newShift, location: value })}
                  >
                    <SelectTrigger id="location">
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations?.map((loc) => (
                        <SelectItem key={loc.id} value={loc.site_name}>
                          {loc.site_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shift_date">Date *</Label>
                  <Input
                    id="shift_date"
                    type="date"
                    value={newShift.shift_date}
                    onChange={(e) => setNewShift({ ...newShift, shift_date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={newShift.start_time}
                      onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={newShift.end_time}
                      onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {applyToWholeWeek && (
              <div className="space-y-2">
                <Label htmlFor="week_start_date">Week Start Date *</Label>
                <Input
                  id="week_start_date"
                  type="date"
                  value={newShift.shift_date}
                  onChange={(e) => {
                    setNewShift({ ...newShift, shift_date: e.target.value });
                    const startDate = parseISO(e.target.value);
                    const updatedWeekShifts = weekShifts.map((ws, idx) => ({
                      ...ws,
                      date: format(addDays(startDate, idx), 'yyyy-MM-dd')
                    }));
                    setWeekShifts(updatedWeekShifts);
                  }}
                />
                <p className="text-xs text-slate-600">Select Sunday to start the week</p>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <input
                type="checkbox"
                id="apply_to_week"
                checked={applyToWholeWeek}
                onChange={(e) => {
                  setApplyToWholeWeek(e.target.checked);
                  if (e.target.checked && newShift.shift_date) {
                    const startDate = parseISO(newShift.shift_date);
                    const updatedWeekShifts = weekShifts.map((ws, idx) => ({
                      ...ws,
                      date: format(addDays(startDate, idx), 'yyyy-MM-dd')
                    }));
                    setWeekShifts(updatedWeekShifts);
                  }
                }}
                className="w-4 h-4"
              />
              <Label htmlFor="apply_to_week" className="text-sm font-medium text-green-900 cursor-pointer">
                Apply to Whole Week (Different shifts for each day)
              </Label>
            </div>

            {applyToWholeWeek && (
              <div className="space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900">Configure shifts for each day:</p>
                {weekShifts.map((dayShift, idx) => (
                  <div key={idx} className="p-3 bg-white rounded border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="font-semibold text-sm">{dayShift.day} - {dayShift.date}</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const updated = [...weekShifts];
                          updated[idx] = { ...updated[idx], start_time: '', end_time: '', location: '' };
                          setWeekShifts(updated);
                        }}
                        className="text-xs text-red-600"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="time"
                          value={dayShift.start_time}
                          onChange={(e) => {
                            const updated = [...weekShifts];
                            updated[idx] = { ...updated[idx], start_time: e.target.value };
                            setWeekShifts(updated);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">End</Label>
                        <Input
                          type="time"
                          value={dayShift.end_time}
                          onChange={(e) => {
                            const updated = [...weekShifts];
                            updated[idx] = { ...updated[idx], end_time: e.target.value };
                            setWeekShifts(updated);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Location</Label>
                        <Select
                          value={dayShift.location}
                          onValueChange={(value) => {
                            const updated = [...weekShifts];
                            updated[idx] = { ...updated[idx], location: value };
                            setWeekShifts(updated);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Site..." />
                          </SelectTrigger>
                          <SelectContent>
                            {locations?.map((loc) => (
                              <SelectItem key={loc.id} value={loc.site_name}>
                                {loc.site_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {newShift.is_split_shift && newShift.officer_email && newShift.shift_date && !applyToWholeWeek && (
              <div className="space-y-2">
                <Label htmlFor="linked_shift">Link to Shift from {format(subDays(parseISO(newShift.shift_date), 1), 'MMM d, yyyy')} (Optional)</Label>
                <Select
                  value={newShift.linked_shift_id}
                  onValueChange={(value) => setNewShift({ ...newShift, linked_shift_id: value })}
                >
                  <SelectTrigger id="linked_shift">
                    <SelectValue placeholder="Optional - link to a previous shift..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schedules
                      ?.filter(s => {
                        const dayBefore = format(subDays(parseISO(newShift.shift_date), 1), 'yyyy-MM-dd');
                        return s.shift_date === dayBefore && 
                          s.officer_email === newShift.officer_email &&
                          !s.is_split_shift;
                      })
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))
                      .map((shift) => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.start_time} - {shift.end_time} at {shift.location.split(':')[0]}
                        </SelectItem>
                      ))}
                    {schedules?.filter(s => {
                      const dayBefore = format(subDays(parseISO(newShift.shift_date), 1), 'yyyy-MM-dd');
                      return s.shift_date === dayBefore && 
                        s.officer_email === newShift.officer_email &&
                        !s.is_split_shift;
                    }).length === 0 && (
                      <SelectItem value="none" disabled>
                        No shifts found for this officer on the previous day
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-purple-600">
                  If linked, this shift will be placed on the same day as the linked shift
                </p>
              </div>
            )}

            {newShift.is_split_shift && newShift.start_time && newShift.end_time && newShift.shift_date && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-900">
                  <strong>Split Shift Preview:</strong> This shift ({newShift.start_time} - {newShift.end_time}) will appear in purple. {newShift.linked_shift_id ? `It will be placed on ${format(subDays(parseISO(newShift.shift_date), 1), 'MMM d')} with the linked shift.` : `It will appear on ${format(parseISO(newShift.shift_date), 'MMM d, yyyy')}.`}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 bg-white sticky bottom-0 -mb-4 pb-4">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddShift}
                disabled={createShiftMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {createShiftMutation.isPending ? 'Adding...' : newShift.is_open ? 'Create Open Shift' : 'Add Shift'}
              </Button>
            </div>
          </div>
        </MobileResponsiveDialogContent>
      </MobileResponsiveDialog>

      {/* Edit Shift Dialog */}
      <Dialog open={showSelectiveCopyDialog} onOpenChange={setShowSelectiveCopyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Copy Selected Officers from Previous Week</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Select officers to copy their shifts from {format(addDays(weekStart, -7), 'MMM d')} - {format(addDays(weekEnd, -7), 'MMM d')} to {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
            </p>
            
            <ScrollArea className="h-96 border rounded-lg p-4">
              <div className="space-y-2">
                {activeOfficers
                  .sort((a, b) => {
                    const unitA = a.unit_number || "";
                    const unitB = b.unit_number || "";
                    if (unitA && unitB) {
                      const numA = parseInt(unitA);
                      const numB = parseInt(unitB);
                      if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                      }
                    }
                    return getOfficerName(a.email).localeCompare(getOfficerName(b.email));
                  })
                  .map((officer) => {
                    const prevWeekStartStr = format(addDays(weekStart, -7), 'yyyy-MM-dd');
                    const prevWeekEndStr = format(addDays(weekEnd, -7), 'yyyy-MM-dd');
                    const shiftsCount = schedules?.filter(s => 
                      s.officer_email === officer.email &&
                      parseISO(s.shift_date) >= parseISO(prevWeekStartStr) &&
                      parseISO(s.shift_date) <= parseISO(prevWeekEndStr)
                    ).length || 0;

                    if (shiftsCount === 0) return null;

                    return (
                      <div
                        key={officer.email}
                        onClick={() => toggleOfficerSelection(officer.email)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedOfficersForCopy.has(officer.email)
                            ? 'bg-blue-50 border-blue-400'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedOfficersForCopy.has(officer.email)}
                            onChange={() => {}}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {officer.unit_number && (
                                <Badge className="bg-blue-600 text-white">#{officer.unit_number}</Badge>
                              )}
                              <span className="font-semibold">
                                {officer.first_name && officer.last_name 
                                  ? `${officer.first_name} ${officer.last_name}` 
                                  : officer.full_name || officer.email}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {shiftsCount} shift{shiftsCount !== 1 ? 's' : ''} in previous week
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-blue-900">
                {selectedOfficersForCopy.size} officer{selectedOfficersForCopy.size !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedOfficersForCopy(new Set())}
              >
                Clear Selection
              </Button>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => {
                setShowSelectiveCopyDialog(false);
                setSelectedOfficersForCopy(new Set());
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleCopySelectedOfficers}
                disabled={bulkCreateShiftsMutation.isPending || selectedOfficersForCopy.size === 0}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${bulkCreateShiftsMutation.isPending ? 'animate-spin' : ''}`} />
                {bulkCreateShiftsMutation.isPending ? 'Copying...' : `Copy ${selectedOfficersForCopy.size} Officer${selectedOfficersForCopy.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <input
                type="checkbox"
                id="edit_is_open"
                checked={editingShift?.is_open || false}
                onChange={(e) => setEditingShift({ ...editingShift, is_open: e.target.checked, officer_email: e.target.checked ? "OPEN" : (editingShift?.officer_email === "OPEN" ? "" : editingShift?.officer_email) })}
                className="w-4 h-4"
              />
              <Label htmlFor="edit_is_open" className="text-sm font-medium text-blue-900 cursor-pointer">
                Mark as Open Shift
              </Label>
            </div>

            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <input
                type="checkbox"
                id="edit_is_split_shift"
                checked={editingShift?.is_split_shift || false}
                onChange={(e) => setEditingShift({ ...editingShift, is_split_shift: e.target.checked, linked_shift_id: e.target.checked ? (editingShift?.linked_shift_id || "") : "" })}
                className="w-4 h-4"
              />
              <Label htmlFor="edit_is_split_shift" className="text-sm font-medium text-purple-900 cursor-pointer">
                Split Shift (e.g., overnight shifts)
              </Label>
            </div>

            {!(editingShift?.is_open || editingShift?.officer_email === "OPEN") && (
              <div className="space-y-2">
                <Label htmlFor="edit_officer">Officer *</Label>
                <Select
                  value={editingShift?.officer_email || ""}
                  onValueChange={(value) => setEditingShift({ ...editingShift, officer_email: value })}
                  disabled={editingShift?.is_open || editingShift?.officer_email === "OPEN"}
                >
                  <SelectTrigger id="edit_officer">
                    <SelectValue placeholder="Select officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeOfficers.map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name && officer.last_name 
                          ? `${officer.first_name} ${officer.last_name}` 
                          : officer.full_name || officer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit_location">Location *</Label>
              <Select
                value={editingShift?.location?.split(':')[0].trim() || ""} // Extract site_name
                onValueChange={(value) => {
                  const selectedLocationObj = locations?.find(loc => loc.site_name === value);
                  if (selectedLocationObj) {
                    setEditingShift({ ...editingShift, location: `${selectedLocationObj.site_name}: ${selectedLocationObj.address}` });
                  } else {
                    setEditingShift({ ...editingShift, location: value }); // Fallback if not found, though should not happen
                  }
                }}
              >
                <SelectTrigger id="edit_location">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations?.map((loc) => (
                    <SelectItem key={loc.id} value={loc.site_name}>
                      {loc.site_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_shift_date">Date *</Label>
              <Input
                id="edit_shift_date"
                type="date"
                value={editingShift?.shift_date || ""}
                onChange={(e) => setEditingShift({ ...editingShift, shift_date: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_start_time">Start Time *</Label>
                <Input
                  id="edit_start_time"
                  type="time"
                  value={editingShift?.start_time || ""}
                  onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_end_time">End Time *</Label>
                <Input
                  id="edit_end_time"
                  type="time"
                  value={editingShift?.end_time || ""}
                  onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
                />
              </div>
            </div>

            {editingShift?.is_split_shift && editingShift?.officer_email && editingShift?.shift_date && (
              <div className="space-y-2">
                <Label htmlFor="edit_linked_shift">Link to Shift from {format(subDays(parseISO(editingShift.shift_date), 1), 'MMM d, yyyy')} (Optional)</Label>
                <Select
                  value={editingShift.linked_shift_id || ""}
                  onValueChange={(value) => setEditingShift({ ...editingShift, linked_shift_id: value === "" ? null : value })}
                >
                  <SelectTrigger id="edit_linked_shift">
                    <SelectValue placeholder="Optional - link to a previous shift..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>No Link</SelectItem> {/* Option to unlink */}
                    {schedules
                      ?.filter(s => {
                        const dayBefore = format(subDays(parseISO(editingShift.shift_date), 1), 'yyyy-MM-dd');
                        return s.shift_date === dayBefore && 
                          s.officer_email === editingShift.officer_email &&
                          !s.is_split_shift;
                      })
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))
                      .map((shift) => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.start_time} - {shift.end_time} at {shift.location.split(':')[0]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-purple-600">
                  If linked, this shift will be placed on the same day as the linked shift
                </p>
              </div>
            )}

            {(editingShift?.is_split_shift && editingShift?.start_time && editingShift?.end_time && editingShift?.shift_date) && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs text-purple-900">
                  <strong>Split Shift Preview:</strong> This shift ({editingShift.start_time} - {editingShift.end_time}) will appear in purple. {editingShift.linked_shift_id ? `It will be placed on ${format(subDays(parseISO(editingShift.shift_date), 1), 'MMM d')} with the linked shift.` : `It will appear on ${format(parseISO(editingShift.shift_date), 'MMM d, yyyy')}.`}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingShift(null); }}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateShift}
                disabled={updateScheduleMutation.isPending || !editingShift?.shift_date || !editingShift?.start_time || !editingShift?.end_time || !editingShift?.location || (!editingShift?.is_open && !(editingShift?.officer_email && editingShift.officer_email !== "OPEN"))}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateScheduleMutation.isPending ? 'Updating...' : 'Update Shift'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>





      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.3in;
          }
          
          body * {
            visibility: hidden;
          }
          .print\\:block, .print\\:block * {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          
          .page-break-inside-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .page-break-before {
            page-break-before: always !important;
            break-before: page !important;
            -webkit-break-before: page !important;
          }
          @media print {
            .page-break-before {
              page-break-before: always !important;
              break-before: page !important;
              display: table-row-group !important;
            }
          }
          
          .bg-blue-700 {
            background-color: #1d4ed8 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-blue-600 {
            background-color: #2563eb !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-blue-800 {
            background-color: #1e40af !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-green-300 {
            background-color: #86efac !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-slate-200 {
            background-color: #e2e8f0 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-white {
            background-color: white !important;
          }
          .bg-slate-50 {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-yellow-200 {
            background-color: #fef08a !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-cyan-200 {
            background-color: #a5f3fc !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-red-200 {
            background-color: #fecaca !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-blue-100 {
            background-color: #dbeafe !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-blue-50 {
            background-color: #eff6ff !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .bg-purple-100 {
            background-color: #e9d5ff !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            print-color-adjust: exact;
          }
          .border-slate-300, .border-slate-400 {
            border-color: #94a3b8 !important;
          }
          
          table, th, td {
            border: 1px solid #94a3b8 !important;
          }
          
          body {
            font-size: 8pt;
            line-height: 1.1;
          }
        }
      `}</style>
    </div>
  );
}