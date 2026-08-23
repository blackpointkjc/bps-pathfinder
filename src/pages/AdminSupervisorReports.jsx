import { getCurrentDirectoryUser, listDirectoryUsers } from '@/lib/appDirectory';
import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, FileWarning, ClipboardCheck, Check, X, AlertCircle, Users, Printer, BarChart3, ShieldCheck } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { getRankLastNameByEmail } from "@/utils/officerDisplay";
import { calculatePunctuality, calculateBidStanding } from '@/lib/performanceScoring';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminSupervisorReports() {
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [selectedWriteUp, setSelectedWriteUp] = useState(null);
  const [showInspectionDialog, setShowInspectionDialog] = useState(false);
  const [showWriteUpDialog, setShowWriteUpDialog] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    enabled: user?.role === 'admin',
  });

  const { data: inspections } = useQuery({
    queryKey: ['allInspectionReports'],
    queryFn: () => base44.entities.InspectionReport.list('-inspection_date'),
    enabled: user?.role === 'admin',
  });

  const { data: writeUps } = useQuery({
    queryKey: ['allWriteUpReports'],
    queryFn: () => base44.entities.WriteUpReport.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['allTimeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in'),
    enabled: user?.role === 'admin',
  });

  const { data: schedules } = useQuery({
    queryKey: ['allSchedules'],
    queryFn: () => base44.entities.Schedule.list('-shift_date'),
    enabled: user?.role === 'admin',
  });

  const { data: incidentReports = [] } = useQuery({
    queryKey: ['allIncidentReports', 'officerPerformance'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: shiftBids } = useQuery({
    queryKey: ['allShiftBids'],
    queryFn: () => base44.entities.ShiftBid.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: trainingCompletions } = useQuery({
    queryKey: ['allTrainingCompletions'],
    queryFn: () => base44.entities.TrainingCompletion.list(),
    enabled: user?.role === 'admin',
  });

  const { data: siteChecks } = useQuery({
    queryKey: ['allSupervisorSiteChecks'],
    queryFn: () => base44.entities.SupervisorSiteCheck.list('-check_timestamp'),
    enabled: user?.role === 'admin',
  });

  const getOfficerIdentifier = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    return getRankLastNameByEmail(allUsers, officer?.email || '', officer?.email || 'Unknown Officer');
  };

  const approveWriteUpMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WriteUpReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allWriteUpReports'] });
      setShowWriteUpDialog(false);
      setSelectedWriteUp(null);
      setAdminNotes("");
    },
  });

  const rejectWriteUpMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WriteUpReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allWriteUpReports'] });
      setShowWriteUpDialog(false);
      setSelectedWriteUp(null);
      setAdminNotes("");
    },
  });

  const handleWriteUpAction = (writeUp, action) => {
    setSelectedWriteUp(writeUp);
    setActionType(action);
    setAdminNotes(writeUp.admin_notes || "");
    setShowWriteUpDialog(true);
  };

  const handleWriteUpSubmit = () => {
    if (!selectedWriteUp || !actionType) return;

    if (actionType === 'approve') {
      approveWriteUpMutation.mutate({
        id: selectedWriteUp.id,
        data: {
          status: 'approved',
          reviewed_by: user.email,
          reviewed_date: new Date().toISOString(),
          admin_notes: adminNotes.trim() || null,
        }
      });
    } else if (actionType === 'reject') {
      if (!adminNotes.trim()) {
        alert('Please provide feedback for rejection');
        return;
      }
      rejectWriteUpMutation.mutate({
        id: selectedWriteUp.id,
        data: {
          status: 'draft',
          admin_notes: adminNotes.trim(),
        }
      });
    }
  };

  const pendingWriteUps = writeUps?.filter(w => w.status === 'pending_approval') || [];
  const approvedWriteUps = writeUps?.filter(w => w.status === 'approved') || [];

  // Officer analytics and selectors must contain actual operational officers only.
  const activeOfficers = allUsers?.filter(isOperationalOfficer).sort((a, b) => {
    const unitA = a.unit_number;
    const unitB = b.unit_number;
    if (unitA && unitB) {
      const numA = parseInt(unitA);
      const numB = parseInt(unitB);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    }
    if (unitA && !unitB) return -1;
    if (!unitA && unitB) return 1;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  }) || [];

  // Get date range label
  const getDateRangeLabel = () => {
    if (!startDate || !endDate) return '';
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
  };

  // Calculate officer performance data
  const officerPerformance = useMemo(() => {
    if (!selectedOfficer || !timeEntries || !schedules || !startDate || !endDate) return null;

    const officer = allUsers?.find(u => u.email === selectedOfficer);
    if (!officer) return null;

    // Filter data for selected officer and date range
    const officerTimeEntries = timeEntries.filter(e => 
      e.officer_email === selectedOfficer &&
      e.clock_in &&
      format(parseISO(e.clock_in), 'yyyy-MM-dd') >= startDate &&
      format(parseISO(e.clock_in), 'yyyy-MM-dd') <= endDate
    );

    const officerSchedules = schedules.filter(s => 
      s.officer_email === selectedOfficer &&
      s.shift_date >= startDate &&
      s.shift_date <= endDate
    );

    const officerBids = shiftBids?.filter(b => 
      b.officer_email === selectedOfficer &&
      format(parseISO(b.created_date), 'yyyy-MM-dd') >= startDate &&
      format(parseISO(b.created_date), 'yyyy-MM-dd') <= endDate
    ) || [];

    const punctuality = calculatePunctuality(officerTimeEntries, officerSchedules, startDate, endDate, incidentReports, officer);

    // Calculate hours worked
    let totalHours = 0;
    officerTimeEntries.forEach(entry => {
      if (entry.clock_in && entry.clock_out) {
        const diff = new Date(entry.clock_out) - new Date(entry.clock_in);
        totalHours += diff / 1000 / 60 / 60;
      }
    });

    // Calculate shift hours scheduled
    let scheduledHours = 0;
    officerSchedules.forEach(s => {
      const [sh = 0, sm = 0] = String(s.start_time || '00:00').split(':').map(Number);
      const [eh = 0, em = 0] = String(s.end_time || '00:00').split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      let endMinutes = eh * 60 + em;
      if (endMinutes <= startMinutes) endMinutes += 1440;
      scheduledHours += Math.max(0, (endMinutes - startMinutes) / 60);
    });

    // Bid standing uses the same rule as My Performance: only an assigned/accepted
    // bid is scoreable. Pending or management non-selection does not count as success.
    const bidStanding = calculateBidStanding(officerBids, startDate, endDate);
    const acceptedBids = bidStanding.accepted;
    const rejectedBids = bidStanding.rejected;
    const pendingBids = bidStanding.pending;

    // Training stats
    const officerTraining = trainingCompletions?.filter(tc => tc.officer_email === selectedOfficer) || [];
    const completedTraining = officerTraining.filter(tc => tc.completed).length;

    // Write-ups for this officer
    const officerWriteUps = writeUps?.filter(w => 
      w.officer_email === selectedOfficer &&
      format(parseISO(w.created_date), 'yyyy-MM-dd') >= startDate &&
      format(parseISO(w.created_date), 'yyyy-MM-dd') <= endDate
    ) || [];

    // Inspections for this officer
    const officerInspections = inspections?.filter(i => 
      i.officer_email === selectedOfficer &&
      format(parseISO(i.inspection_date), 'yyyy-MM-dd') >= startDate &&
      format(parseISO(i.inspection_date), 'yyyy-MM-dd') <= endDate
    ) || [];

    return {
      officer,
      dateRange: getDateRangeLabel(),
      onTimeRate: punctuality.rate,
      onTime: punctuality.onTime,
      late: punctuality.late,
      missed: punctuality.missed,
      totalHours: Math.round(totalHours * 10) / 10,
      scheduledHours: Math.round(scheduledHours * 10) / 10,
      shiftsWorked: officerTimeEntries.length,
      shiftsScheduled: officerSchedules.length,
      bids: { accepted: acceptedBids, rejected: rejectedBids, pending: pendingBids, total: officerBids.length },
      bidAcceptanceRate: bidStanding.score,
      trainingCompleted: completedTraining,
      writeUps: officerWriteUps,
      inspections: officerInspections,
    };
  }, [selectedOfficer, startDate, endDate, timeEntries, schedules, incidentReports, shiftBids, trainingCompletions, writeUps, inspections, allUsers]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  // Print officer performance report
  const handlePrintOfficerReport = () => {
    if (!officerPerformance) return;

    const LOGO_URL = "/black-point-shield.webp";

    const printWindow = window.open('', '_blank');
    const { officer, dateRange } = officerPerformance;

    // Calculate Officer Productivity Index (out of 100)
    let productivityScore = 0;
    
    // On-time rate (30 points max)
    productivityScore += ((officerPerformance.onTimeRate ?? 0) / 100) * 30;
    
    // Shift attendance (25 points max) - worked vs scheduled
    const attendanceRate = officerPerformance.shiftsScheduled > 0 
      ? (officerPerformance.shiftsWorked / officerPerformance.shiftsScheduled) 
      : 1;
    productivityScore += attendanceRate * 25;
    
    // No write-ups (25 points max) - deduct 5 per write-up
    const writeUpDeduction = Math.min(25, officerPerformance.writeUps.filter(w => w.status === 'approved').length * 5);
    productivityScore += 25 - writeUpDeduction;
    
    // Inspections quality (20 points max) - average of ratings
    if (officerPerformance.inspections.length > 0) {
      const ratingToScore = (rating) => {
        if (rating === 'excellent') return 5;
        if (rating === 'satisfactory') return 3.75;
        if (rating === 'needs_improvement') return 2.5;
        if (rating === 'unsatisfactory') return 0;
        return 3.75;
      };
      
      let totalInspectionScore = 0;
      officerPerformance.inspections.forEach(i => {
        totalInspectionScore += ratingToScore(i.uniform_appearance);
        totalInspectionScore += ratingToScore(i.equipment_condition);
        totalInspectionScore += ratingToScore(i.professionalism);
        totalInspectionScore += ratingToScore(i.post_knowledge);
      });
      const avgScore = totalInspectionScore / (officerPerformance.inspections.length * 4);
      productivityScore += (avgScore / 5) * 20;
    } else {
      productivityScore += 15; // Base score if no inspections
    }
    
    const finalScore = Math.round(productivityScore);
    const scoreColor = finalScore >= 85 ? '#16a34a' : finalScore >= 70 ? '#f59e0b' : '#dc2626';
    const scoreLabel = finalScore >= 85 ? 'Excellent' : finalScore >= 70 ? 'Good' : 'Needs Improvement';

    const approvedWriteUps = officerPerformance.writeUps.filter(w => w.status === 'approved');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Performance Review - ${officer.first_name} ${officer.last_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.4in; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.3; color: #1a1a1a; }
          
          .header { text-align: center; padding-bottom: 10px; margin-bottom: 15px; border-bottom: 3px solid #1e40af; }
          .logo { width: 180px; height: auto; object-fit: contain; margin: 0 auto 10px; }
          .title { font-size: 16pt; font-weight: bold; color: #1e40af; letter-spacing: 0.5px; margin-bottom: 4px; }
          .subtitle { font-size: 10pt; color: #475569; margin-bottom: 6px; }
          .officer-info { font-size: 7pt; color: #64748b; display: flex; justify-content: center; gap: 15px; }
          
          .productivity-banner { 
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); 
            color: white; 
            padding: 12px; 
            border-radius: 6px; 
            margin-bottom: 15px;
            text-align: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .productivity-score { font-size: 32pt; font-weight: bold; margin: 8px 0; }
          .productivity-label { font-size: 9pt; font-weight: 600; opacity: 0.95; }
          
          .section { margin-bottom: 15px; page-break-inside: avoid; }
          .section-title { 
            background: #e0e7ff; 
            color: #1e40af; 
            font-weight: bold; 
            font-size: 8.5pt; 
            padding: 4px 8px; 
            border-left: 4px solid #1e40af; 
            margin-bottom: 8px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .stat-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; text-align: center; }
          .stat-value { font-size: 16pt; font-weight: bold; color: #1e40af; }
          .stat-label { font-size: 6.5pt; color: #64748b; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
          
          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 3px; padding: 6px; margin: 4px 0; }
          .field-label { font-size: 6pt; font-weight: 600; color: #475569; margin-bottom: 2px; text-transform: uppercase; }
          .field-value { color: #1e293b; font-size: 7.5pt; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #cbd5e1; padding: 5px; font-size: 7pt; }
          th { background: #f1f5f9; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          
          .signature-section { margin-top: 20px; padding: 10px; background: #f8fafc; border-radius: 4px; }
          .sig-line { border-bottom: 2px solid #1e40af; min-height: 30px; margin: 6px 0; }
          .sig-details { font-size: 6pt; color: #64748b; margin-top: 3px; }
          
          .footer { 
            background: #1e293b; 
            color: white; 
            padding: 8px; 
            text-align: center; 
            font-size: 6.5pt; 
            margin-top: 15px; 
            border-radius: 4px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .footer strong { font-size: 7.5pt; display: block; margin-bottom: 3px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">PERFORMANCE REVIEW</div>
          <div class="subtitle">${officer.first_name} ${officer.last_name} - ${dateRange}</div>
          <div class="officer-info">
            <span>DCJS: ${officer.dcjs_number || 'N/A'}</span>
            <span>License: ${officer.drivers_license || 'N/A'}</span>
            <span>Rank: ${officer.rank || 'Officer'}</span>
            <span>Division: ${officer.division || 'N/A'}</span>
            <span>Unit #${officer.unit_number || 'N/A'}</span>
          </div>
        </div>

        <div class="productivity-banner">
          <div class="productivity-label">OFFICER PRODUCTIVITY INDEX</div>
          <div class="productivity-score" style="color: ${scoreColor};">${finalScore}/100</div>
          <div class="productivity-label">${scoreLabel} Performance</div>
        </div>

        <div class="section">
          <div class="section-title">ATTENDANCE & PUNCTUALITY</div>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.onTimeRate != null ? `${officerPerformance.onTimeRate}%` : '—'}</div>
              <div class="stat-label">On-Time Rate</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.onTime}</div>
              <div class="stat-label">On-Time Arrivals</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.late}</div>
              <div class="stat-label">Late Arrivals</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.shiftsWorked}/${officerPerformance.shiftsScheduled}</div>
              <div class="stat-label">Shifts Worked</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">HOURS SUMMARY</div>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.totalHours}h</div>
              <div class="stat-label">Hours Worked</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.scheduledHours}h</div>
              <div class="stat-label">Hours Scheduled</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.trainingCompleted}</div>
              <div class="stat-label">Training Completed</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${officerPerformance.bidAcceptanceRate != null ? `${officerPerformance.bidAcceptanceRate}%` : '—'}</div>
              <div class="stat-label">Bid Standing</div>
            </div>
          </div>
        </div>

        ${approvedWriteUps.length > 0 ? `
        <div class="section">
          <div class="section-title">DISCIPLINARY ACTIONS (${approvedWriteUps.length})</div>
          <table>
            <tr><th>Date</th><th>Type</th><th>Severity</th><th>Description</th></tr>
            ${approvedWriteUps.map(w => `
              <tr>
                <td>${format(parseISO(w.created_date), 'MMM d, yyyy')}</td>
                <td>${w.violation_type?.replace(/_/g, ' ') || 'N/A'}</td>
                <td>${w.severity?.replace(/_/g, ' ') || 'N/A'}</td>
                <td>${(w.description || '').substring(0, 60)}...</td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        ${officerPerformance.inspections.length > 0 ? `
        <div class="section">
          <div class="section-title">INSPECTIONS (${officerPerformance.inspections.length})</div>
          <table>
            <tr><th>Date</th><th>Location</th><th>Uniform</th><th>Equipment</th><th>Post Knowledge</th><th>Professional</th></tr>
            ${officerPerformance.inspections.map(i => `
              <tr>
                <td>${format(parseISO(i.inspection_date), 'MMM d, yyyy')}</td>
                <td>${i.location}</td>
                <td>${i.uniform_appearance || 'N/A'}</td>
                <td>${i.equipment_condition || 'N/A'}</td>
                <td>${i.post_knowledge || 'N/A'}</td>
                <td>${i.professionalism || 'N/A'}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        <div class="signature-section">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;">
            <div>
              <div class="field-label">Supervisor Signature</div>
              <div class="sig-line"></div>
              <div class="sig-details">Date: ________________</div>
            </div>
            <div>
              <div class="field-label">Officer Signature</div>
              <div class="sig-line"></div>
              <div class="sig-details">Date: ________________</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div style="margin-top: 3px;">Report Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')} | Confidential Document</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Quick date range presets
  const applyPreset = (preset) => {
    const today = new Date();
    switch (preset) {
      case 'thisMonth':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'lastMonth':
        const lastMonth = subMonths(today, 1);
        setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'last3Months':
        setStartDate(format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'last6Months':
        setStartDate(format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'thisYear':
        setStartDate(format(new Date(today.getFullYear(), 0, 1), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      default:
        break;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'verbal_warning': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'written_warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'final_warning': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'suspension_recommended': return 'bg-red-100 text-red-800 border-red-200';
      case 'termination_recommended': return 'bg-red-200 text-red-900 border-red-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Supervisor Reports</h1>
            <p className="text-slate-600">Review inspections and write-up reports from supervisors</p>
          </div>
        </div>

        <Tabs defaultValue="sitechecks" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1 flex flex-wrap gap-1">
            <TabsTrigger value="sitechecks" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-900">
              <ShieldCheck className="w-4 h-4 mr-2" />
              Site Checks ({siteChecks?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="writeups" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-900">
              <FileWarning className="w-4 h-4 mr-2" />
              Write-Ups ({pendingWriteUps.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-900">
              <Check className="w-4 h-4 mr-2" />
              Approved ({approvedWriteUps.length})
            </TabsTrigger>
            <TabsTrigger value="inspections" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-900">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Inspections ({inspections?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="officer-data" className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-900">
              <BarChart3 className="w-4 h-4 mr-2" />
              Officer Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sitechecks">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  Supervisor Site Check Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(siteChecks || []).map((check) => (
                    <div key={check.id} className={`p-4 rounded-lg border ${check.action_type === 'arrival' ? 'bg-emerald-950/30 border-emerald-700 text-slate-100' : 'bg-red-950/30 border-red-700 text-slate-100'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{check.dar_entry_text}</p>
                          <div className="flex flex-wrap gap-3 mt-1">
                            <span className="text-xs text-slate-500">Site: <strong>{check.site_name}</strong></span>
                            <span className="text-xs text-slate-500">Supervisor: <strong>{check.supervisor_rank} {check.supervisor_last_name}</strong></span>
                            <span className="text-xs text-slate-500">Officer: <strong>{getOfficerIdentifier(check.entered_by_officer_email || check.officer_email)}</strong></span>
                          </div>
                          {check.note && <p className="text-xs text-slate-500 italic mt-1">{check.note}</p>}
                        </div>
                        <div className="text-right">
                          <Badge className={check.action_type === 'arrival' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {check.action_type}
                          </Badge>
                          <p className="text-xs text-slate-400 mt-1">{format(new Date(check.check_timestamp), 'MMM d, yyyy h:mm a')}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!siteChecks?.length && (
                    <p className="text-center text-slate-500 py-8">No site check logs yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="writeups">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  Pending Write-Up Approvals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className="p-5 bg-amber-50 rounded-lg border-l-4 border-amber-500">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600 mb-1">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600 mb-2">{writeUp.location}</p>
                          <p className="text-xs text-slate-500">Supervisor: {getOfficerIdentifier(writeUp.created_by_id || writeUp.created_by)}</p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                            {writeUp.violation_type.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Incident Description:</p>
                          <p className="text-sm text-slate-700">{writeUp.description}</p>
                        </div>
                        {writeUp.corrective_action && (
                          <div className="p-2 bg-white rounded border border-amber-200">
                            <p className="text-xs text-amber-700 font-medium mb-1">Required Corrective Action:</p>
                            <p className="text-sm text-amber-900">{writeUp.corrective_action}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await base44.entities.WriteUpReport.update(writeUp.id, {
                              exclude_from_performance_review: !writeUp.exclude_from_performance_review
                            });
                            queryClient.invalidateQueries({ queryKey: ['allWriteUpReports'] });
                          }}
                          className={writeUp.exclude_from_performance_review ? 'bg-green-50' : ''}
                        >
                          {writeUp.exclude_from_performance_review ? '✓ Excluded' : 'Exclude from Review'}
                        </Button>
                        <Button
                          onClick={() => handleWriteUpAction(writeUp, 'reject')}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          size="lg"
                        >
                          <X className="w-5 h-5 mr-2" />
                          Reject & Send Back
                        </Button>
                        <Button
                          onClick={() => handleWriteUpAction(writeUp, 'approve')}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="lg"
                        >
                          <Check className="w-5 h-5 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No write-ups pending approval</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Approved Write-Ups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {approvedWriteUps.map((writeUp) => (
                    <div key={writeUp.id} className="p-5 bg-green-50 rounded-lg border-l-4 border-green-500">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{writeUp.officer_name}</p>
                          <p className="text-sm text-slate-600 mb-1">
                            Incident: {format(new Date(writeUp.incident_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600 mb-2">{writeUp.location}</p>
                          <p className="text-xs text-slate-500">Supervisor: {getOfficerIdentifier(writeUp.created_by_id || writeUp.created_by)}</p>
                          <p className="text-xs text-green-700 mt-1">
                            Approved by {getOfficerIdentifier(writeUp.reviewed_by)} on {format(new Date(writeUp.reviewed_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                            Approved
                          </Badge>
                          <Badge variant="outline" className={getSeverityColor(writeUp.severity)}>
                            {writeUp.severity.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700">{writeUp.description}</p>
                    </div>
                  ))}
                  {approvedWriteUps.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No approved write-ups yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inspections">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Officer Inspections</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {inspections?.map((inspection) => (
                    <div key={inspection.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-900">{inspection.officer_inspected}</p>
                          <p className="text-sm text-slate-600">
                            {format(new Date(inspection.inspection_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-600">{inspection.location}</p>
                          <p className="text-xs text-slate-500 mt-1">By: {getOfficerIdentifier(inspection.created_by_id || inspection.created_by)}</p>
                        </div>
                        {inspection.follow_up_required && (
                          <Badge className="bg-red-100 text-red-800 border-red-200">
                            Follow-up Required
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <p className="text-xs text-slate-500">Uniform</p>
                          <p className="text-sm font-semibold">{inspection.uniform_appearance}</p>
                        </div>
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <p className="text-xs text-slate-500">Equipment</p>
                          <p className="text-sm font-semibold">{inspection.equipment_condition}</p>
                        </div>
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <p className="text-xs text-slate-500">Post Knowledge</p>
                          <p className="text-sm font-semibold">{inspection.post_knowledge}</p>
                        </div>
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <p className="text-xs text-slate-500">Professionalism</p>
                          <p className="text-sm font-semibold">{inspection.professionalism}</p>
                        </div>
                      </div>
                      {inspection.observations && (
                        <div className="mb-2">
                          <p className="text-xs text-slate-500 font-medium mb-1">Observations:</p>
                          <p className="text-sm text-slate-700">{inspection.observations}</p>
                        </div>
                      )}
                      {inspection.areas_of_concern && (
                        <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                          <p className="text-xs text-red-700 font-medium mb-1">Areas of Concern:</p>
                          <p className="text-sm text-red-900">{inspection.areas_of_concern}</p>
                        </div>
                      )}
                      {inspection.commendations && (
                        <div className="p-2 bg-green-50 rounded border border-green-200">
                          <p className="text-xs text-green-700 font-medium mb-1">Commendations:</p>
                          <p className="text-sm text-green-900">{inspection.commendations}</p>
                        </div>
                      )}
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await base44.entities.InspectionReport.update(inspection.id, {
                              exclude_from_performance_review: !inspection.exclude_from_performance_review
                            });
                            queryClient.invalidateQueries({ queryKey: ['allInspectionReports'] });
                          }}
                          className={inspection.exclude_from_performance_review ? 'bg-green-50' : ''}
                        >
                          {inspection.exclude_from_performance_review ? '✓ Excluded from Review' : 'Exclude from Review'}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!inspections?.length && (
                    <p className="text-center text-slate-500 py-8">No inspection reports yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="officer-data">
            <Card className="border-none shadow-lg">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  Officer Monthly Performance Data
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4 mb-6">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Select Officer</Label>
                      <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an officer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeOfficers.sort((a, b) => 
                            `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
                          ).map(officer => (
                            <SelectItem key={officer.email} value={officer.email}>
                              {officer.first_name} {officer.last_name} {officer.unit_number ? `(#${officer.unit_number})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => applyPreset('thisMonth')}>This Month</Button>
                    <Button size="sm" variant="outline" onClick={() => applyPreset('lastMonth')}>Last Month</Button>
                    <Button size="sm" variant="outline" onClick={() => applyPreset('last3Months')}>Last 3 Months</Button>
                    <Button size="sm" variant="outline" onClick={() => applyPreset('last6Months')}>Last 6 Months</Button>
                    <Button size="sm" variant="outline" onClick={() => applyPreset('thisYear')}>This Year</Button>
                  </div>
                </div>

                {officerPerformance ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <div>
                        <h3 className="text-xl font-bold text-purple-900">
                          {officerPerformance.officer.first_name} {officerPerformance.officer.last_name}
                        </h3>
                        <p className="text-sm text-purple-700">
                          {officerPerformance.officer.rank || 'Officer'} • {officerPerformance.officer.division || 'No Division'} • Unit #{officerPerformance.officer.unit_number || 'N/A'}
                        </p>
                        <p className="text-sm text-purple-600 mt-1">{officerPerformance.dateRange}</p>
                      </div>
                      <Button onClick={handlePrintOfficerReport} className="bg-purple-600 hover:bg-purple-700">
                        <Printer className="w-4 h-4 mr-2" />
                        Print Report
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                        <p className="text-3xl font-bold text-green-600">{officerPerformance.onTimeRate != null ? `${officerPerformance.onTimeRate}%` : '—'}</p>
                        <p className="text-xs text-slate-600">On-Time Rate</p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-center">
                        <p className="text-3xl font-bold text-blue-600">{officerPerformance.totalHours}h</p>
                        <p className="text-xs text-slate-600">Hours Worked</p>
                      </div>
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-center">
                        <p className="text-3xl font-bold text-amber-600">{officerPerformance.shiftsWorked}/{officerPerformance.shiftsScheduled}</p>
                        <p className="text-xs text-slate-600">Shifts Worked</p>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 text-center">
                        <p className="text-3xl font-bold text-purple-600">{officerPerformance.bidAcceptanceRate != null ? `${officerPerformance.bidAcceptanceRate}%` : '—'}</p>
                        <p className="text-xs text-slate-600">Bid Standing</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h4 className="font-semibold mb-3">Punctuality</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600">On-Time Arrivals:</span>
                            <span className="font-semibold text-green-600">{officerPerformance.onTime}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Late Arrivals:</span>
                            <span className="font-semibold text-red-600">{officerPerformance.late}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h4 className="font-semibold mb-3">Shift Bids</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Accepted:</span>
                            <span className="font-semibold text-green-600">{officerPerformance.bids.accepted}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Rejected:</span>
                            <span className="font-semibold text-red-600">{officerPerformance.bids.rejected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Pending:</span>
                            <span className="font-semibold text-amber-600">{officerPerformance.bids.pending}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {officerPerformance.writeUps.length > 0 && (
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <h4 className="font-semibold text-red-900 mb-3">Disciplinary Actions ({officerPerformance.writeUps.length})</h4>
                        <div className="space-y-2">
                          {officerPerformance.writeUps.map(w => (
                            <div key={w.id} className="p-3 bg-white rounded border border-red-200">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{w.violation_type?.replace(/_/g, ' ')}</p>
                                  <p className="text-xs text-slate-500">{format(parseISO(w.created_date), 'MMM d, yyyy')}</p>
                                </div>
                                <Badge className={getSeverityColor(w.severity)}>{w.severity?.replace(/_/g, ' ')}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {officerPerformance.inspections.length > 0 && (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-semibold text-blue-900 mb-3">Inspections ({officerPerformance.inspections.length})</h4>
                        <div className="space-y-2">
                          {officerPerformance.inspections.map(i => (
                            <div key={i.id} className="p-3 bg-white rounded border border-blue-200">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{i.location}</p>
                                  <p className="text-xs text-slate-500">{format(parseISO(i.inspection_date), 'MMM d, yyyy')}</p>
                                </div>
                                <div className="text-right text-xs">
                                  <p>Uniform: {i.uniform_appearance}</p>
                                  <p>Professional: {i.professionalism}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>Select an officer to view their monthly performance data</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showWriteUpDialog} onOpenChange={setShowWriteUpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} Write-Up
            </DialogTitle>
          </DialogHeader>
          {selectedWriteUp && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold text-slate-900">{selectedWriteUp.officer_name}</p>
                <p className="text-sm text-slate-600">{selectedWriteUp.location}</p>
                <p className="text-xs text-slate-500 mt-1">Supervisor: {getOfficerIdentifier(selectedWriteUp.created_by_id || selectedWriteUp.created_by)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin_notes">
                  {actionType === 'approve' ? 'Notes (Optional)' : 'Rejection Reason (Required)'}
                </Label>
                <Textarea
                  id="admin_notes"
                  placeholder={actionType === 'approve' ? "Add any notes..." : "Explain what needs to be fixed..."}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowWriteUpDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleWriteUpSubmit}
                  disabled={approveWriteUpMutation.isPending || rejectWriteUpMutation.isPending || (actionType === 'reject' && !adminNotes.trim())}
                  className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {(approveWriteUpMutation.isPending || rejectWriteUpMutation.isPending) ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject & Send Back'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}