import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { completeReportTodo } from '@/lib/reportTodoApi';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, AlertTriangle, Edit, Archive, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import PullToRefresh from "../components/PullToRefresh";
import { format, subDays, isAfter } from "date-fns";
import StatusBadge from "../components/dashboard/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ReportAIEnhancer from "../components/ReportAIEnhancer";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';

export default function ShiftReports() {
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editingTodoId, setEditingTodoId] = useState(null); // Added for tracking which todo is being addressed
  const [formData, setFormData] = useState({
    shift_date: format(new Date(), 'yyyy-MM-dd'),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    start_time: "",
    end_time: "",
    location: "",
    weather_conditions: "",
    patrol_count: "",
    visitors_logged: "",
    doors_checked: "",
    activities: "",
    incidents: "",
    vehicles_noted: "",
    persons_of_interest: "",
    equipment_check: "",
    photo_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false); // New state for 'saving as draft'
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin'; // Determine if the current user is an admin

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-clock_in',
        100
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  // For admins, allow submission from anywhere; for officers, an active entry is required.
  const canSubmit = isAdmin || !!activeEntry;

  const { data: reports } = useQuery({
    queryKey: ['myShiftReports', user?.id],
    queryFn: () => base44.entities.ShiftReport.filter(
      { created_by_id: user.id },
      '-created_date'
    ),
    enabled: !!user?.id,
  });

  // Shift reports are private to their creator (plus authorized admin review).

  const { data: reportTodos } = useQuery({
    queryKey: ['myReportTodos'],
    queryFn: async () => {
      const todos = await base44.entities.ReportTodo.filter({
        officer_email: user?.email,
        report_type: 'shift_report',
        completed: false
      });
      // Filter out todos where the report no longer exists
      const validTodos = [];
      for (const todo of todos) {
        const report = reports?.find(r => r.id === todo.report_id);
        if (report) {
          validTodos.push(todo);
        }
      }
      return validTodos;
    },
    enabled: !!user && !!reports,
  });

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
  });

  const { data: rosterEntries } = useQuery({
    queryKey: ['officerRoster'],
    queryFn: () => base44.entities.OfficerRoster.list(),
    initialData: [],
  });

  const getOfficerSignature = (officerRef) => {
    const officerFromUsers = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    const email = officerFromUsers?.email || officerRef;
    // First check officer roster
    const rosterEntry = rosterEntries?.find(r => r.email === email && r.status === 'active');
    if (rosterEntry) {
      const rank = rosterEntry.rank || '';
      const lastName = rosterEntry.last_name || '';
      const unitNumber = rosterEntry.unit_number || '';
      
      if (rank && lastName && unitNumber) {
        return `${rank} ${lastName} Unit ${unitNumber}`;
      }
      if (rank && lastName) {
        return `${rank} ${lastName}`;
      }
      return `${rosterEntry.first_name || ''} ${rosterEntry.last_name || ''}`.trim() || email;
    }

    // Fall back to user entity
    const officer = officerFromUsers || allUsers?.find(u => u.email === email);
    if (!officer) return email;
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return `${officer?.first_name || ''} ${officer?.last_name || ''}`.trim() || email;
  };

  const getOfficerName = (officerRef) => {
    const officerFromUsers = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    const email = officerFromUsers?.email || officerRef;
    // First check officer roster
    const rosterEntry = rosterEntries?.find(r => r.email === email && r.status === 'active');
    if (rosterEntry) {
      const lastName = rosterEntry.last_name || '';
      const unitNumber = rosterEntry.unit_number || '';
      if (lastName && unitNumber) {
        return `${lastName} Unit ${unitNumber}`;
      }
      return `${rosterEntry.first_name || ''} ${rosterEntry.last_name || ''}`.trim() || email;
    }

    // Fall back to user entity
    const officer = officerFromUsers || allUsers?.find(u => u.email === email);
    if (officer?.last_name && officer?.unit_number) {
      return `${officer.last_name} Unit ${officer.unit_number}`;
    }
    return officer?.full_name || officer?.email || email;
  };

  useEffect(() => {
    // This effect pre-fills the location.
    // For non-admins, it uses the active time entry's location.
    // For admins, if they have an active entry, it also pre-fills.
    // If admin has no active entry, formData.location remains empty, allowing manual selection.
    if (activeEntry?.location) {
      const siteName = activeEntry.location.split(' - ')[0].trim();
      const matchingLocation = locations?.find(loc => loc.site_name === siteName);
      setFormData(prev => ({ ...prev, location: matchingLocation?.site_name || siteName }));
    }
  }, [activeEntry, locations]); // isAdmin is not needed here as logic applies to any user with activeEntry

  const saveReportMutation = useMutation({
    mutationFn: async ({ data, isDraft }) => {
      // IP capture must never block a report save.
      let ipAddress = 'Unknown';
      const ipController = new AbortController();
      const ipTimeout = setTimeout(() => ipController.abort(), 3000);
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: ipController.signal });
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      } finally {
        clearTimeout(ipTimeout);
      }

      const activeSiteName = activeEntry?.location?.split(' - ')[0]?.trim() || "";
      let locationToSubmit = String(data.location || activeSiteName).trim();
      if (!locationToSubmit) {
        locationToSubmit = isDraft
          ? "Draft - Location TBD"
          : (isAdmin ? "Admin - Remote Submission" : "Unknown Location");
      }

      const { patrol_count, visitors_logged, doors_checked, ...restData } = data;
      const saveData = {
        ...restData,
        location: locationToSubmit,
        activities: isDraft && !String(data.activities || "").trim()
          ? "Draft - Activities pending"
          : data.activities,
      };
      if (patrol_count !== '' && patrol_count != null) saveData.patrol_count = Number(patrol_count);
      if (visitors_logged !== '' && visitors_logged != null) saveData.visitors_logged = Number(visitors_logged);
      if (doors_checked !== '' && doors_checked != null) saveData.doors_checked = Number(doors_checked);

      if (editingReport) {
        // Update existing report
        const updated = await base44.entities.ShiftReport.update(editingReport.id, {
          ...saveData,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress,
        });

        if (!isDraft) {
          if (editingTodoId) {
            await completeReportTodo(editingTodoId);
          } else {
              const todos = await base44.entities.ReportTodo.filter({
                officer_email: user.email,
                report_type: 'shift_report',
                report_id: editingReport.id,
                completed: false
              });
              for (const todo of todos) {
                await completeReportTodo(todo.id);
              }
          }
        }
        return updated;
      } else {
        // Create new report
        const report = await base44.entities.ShiftReport.create({
          ...saveData,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          officer_ip_address: ipAddress,
        });
        return report;
      }
    },
    onMutate: async ({ data, isDraft }) => {
      await queryClient.cancelQueries({ queryKey: ['myShiftReports', user?.id] });
      const previousReports = queryClient.getQueryData(['myShiftReports', user?.id]);
      
      if (editingReport) {
        queryClient.setQueryData(['myShiftReports', user?.id], (old) => 
          old?.map((r) => r.id === editingReport.id ? { ...r, ...data, status: isDraft ? "draft" : "submitted" } : r)
        );
      } else {
        const optimisticReport = {
          ...data,
          id: 'temp-' + Date.now(),
          status: isDraft ? "draft" : "submitted",
          created_date: new Date().toISOString(),
          created_by_id: user?.id,
        };
        queryClient.setQueryData(['myShiftReports', user?.id], (old) => [optimisticReport, ...(old || [])]);
      }
      
      return { previousReports };
    },
    onError: (error, variables, context) => {
      console.error('Error saving shift report:', error);
      setSaving(false);
      if (context?.previousReports) {
        queryClient.setQueryData(['myShiftReports', user?.id], context.previousReports);
      }
      toast.error(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to save report. Please try again.');
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['myShiftReports', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['myReportTodos'] });

      if (!variables.isDraft) {
        setShowForm(false);
        setEditingReport(null);
        setEditingTodoId(null);
        setFormData({
          shift_date: format(new Date(), 'yyyy-MM-dd'),
          linked_call_id: "",
          linked_call_number: "",
          linked_call_type: "",
          linked_call_location: "",
          start_time: "",
          end_time: "",
          location: "",
          weather_conditions: "",
          patrol_count: "",
          visitors_logged: "",
          doors_checked: "",
          activities: "",
          incidents: "",
          vehicles_noted: "",
          persons_of_interest: "",
          equipment_check: "",
          photo_url: "",
        });
      } else {
        toast.success('Draft saved successfully.');
      }
      setSaving(false);
    },
  });

          const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData((prevData) => ({ ...prevData, photo_url: file_url }));
    } catch (error) {
      console.error("Error uploading file:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.location) {
      alert('Please select a location before submitting the report.');
      return;
    }
    
    saveReportMutation.mutate({ data: formData, isDraft: false });
  };

  const handleSaveAsDraft = () => {
    if (!formData.shift_date) {
      toast.error('Please select the shift date before saving as draft.');
      return;
    }
    setSaving(true);
    saveReportMutation.mutate({ data: formData, isDraft: true });
  };

  const handleEditReport = (report, todoId = null) => { // Modified to accept todoId
    // Check if report is approved - no one can edit approved reports
    if (report.status === 'approved') {
      alert("This report has been approved and can no longer be edited.");
      return;
    }
    
    // Only allow officer to edit their own reports
    if (String(report.created_by_id || '') !== String(user?.id || '')) {
      alert("You can only edit your own reports.");
      return;
    }
    
    setEditingReport(report);
    setEditingTodoId(todoId); // Set the todoId if provided
    setFormData({
      shift_date: report.shift_date,
      start_time: report.start_time,
      end_time: report.end_time,
      location: report.location,
      weather_conditions: report.weather_conditions || "",
      patrol_count: report.patrol_count || "",
      visitors_logged: report.visitors_logged || "",
      doors_checked: report.doors_checked || "",
      activities: report.status === 'draft' && report.activities === 'Draft - Activities pending' ? '' : report.activities,
      incidents: report.incidents || "",
      vehicles_noted: report.vehicles_noted || "",
      persons_of_interest: report.persons_of_interest || "",
      equipment_check: report.equipment_check || "",
      photo_url: report.photo_url || "",
    });
    setShowForm(true);
  };

  // Separate active, archived, and draft reports
  const sevenDaysAgo = subDays(new Date(), 7);
  const activeReports = reports?.filter(r => r.status !== 'draft' && isAfter(new Date(r.shift_date), sevenDaysAgo)) || [];
  const archivedReports = reports?.filter(r => r.status !== 'draft' && !isAfter(new Date(r.shift_date), sevenDaysAgo)) || [];
  const draftReports = reports?.filter(r => r.status === 'draft') || [];

  const printReport = (report) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const officerName = getOfficerName(report.created_by_id);
    const displayShiftDate = report.shift_date ? format(new Date(report.shift_date), 'MMMM d, yyyy') : '';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shift Report - ${officerName}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.35in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; line-height: 1.35; color: #1a1a1a; }
          
          .back-button {
            position: fixed;
            top: 10px;
            left: 10px;
            padding: 8px 16px;
            background: #1e40af;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover { background: #1e3a8a; }
          
          .report-container { border: 3px solid #1e40af; border-radius: 8px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 20px; text-align: center; }
          .logo { width: 60px; height: 60px; object-fit: contain; margin: 0 auto 10px; background: white; border-radius: 8px; padding: 5px; }
          .title { font-size: 20pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; }
          .subtitle { font-size: 12pt; font-weight: 500; opacity: 0.95; }
          .dcjs { font-size: 8pt; margin-top: 8px; opacity: 0.9; }
          
          .meta-bar { background: #f8fafc; padding: 12px 20px; border-bottom: 2px solid #e2e8f0; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
          .meta-item { font-size: 8.5pt; }
          .meta-label { font-weight: 600; color: #475569; }
          .meta-value { color: #1e293b; }
          
          .content { padding: 20px; }
          .section { margin-bottom: 18px; }
          .section-title { background: #e0e7ff; color: #1e40af; font-weight: bold; font-size: 10pt; padding: 6px 10px; border-left: 4px solid #1e40af; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
          .stat-box { background: #f1f5f9; border: 2px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; }
          .stat-label { font-size: 7.5pt; color: #64748b; font-weight: 600; margin-bottom: 4px; }
          .stat-value { font-size: 16pt; font-weight: bold; color: #1e40af; }
          
          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; margin: 8px 0; }
          .field-label { font-size: 8pt; font-weight: 600; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
          .field-value { color: #1e293b; font-size: 9.5pt; white-space: pre-wrap; line-height: 1.5; }
          
          .signature-section { margin-top: 25px; padding: 15px; background: #f8fafc; border-radius: 6px; }
          .sig-line { border-bottom: 2px solid #1e40af; min-height: 40px; margin: 8px 0; font-family: 'Brush Script MT', cursive; font-size: 18pt; padding: 5px; color: #1e40af; }
          .sig-details { font-size: 8pt; color: #64748b; margin-top: 6px; }
          
          .footer { background: #1e293b; color: white; padding: 15px; text-align: center; font-size: 8pt; margin-top: 20px; border-radius: 0 0 5px 5px; }
          .footer strong { font-size: 10pt; display: block; margin-bottom: 5px; }
          
          .photo-section { margin: 15px 0; text-align: center; }
          .photo-section img { max-width: 100%; max-height: 350px; object-fit: contain; border: 2px solid #cbd5e1; border-radius: 6px; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>
        
        <div class="report-container">
          <div class="header">
            <div class="title">SHIFT ACTIVITY REPORT</div>
            <div class="subtitle">Daily Operations Summary</div>
          </div>
          
          <div class="meta-bar">
            <div class="meta-item">
              <span class="meta-label">Report Date:</span>
              <span class="meta-value">${displayShiftDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Shift:</span>
              <span class="meta-value">${report.start_time} - ${report.end_time}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Submitted:</span>
              <span class="meta-value">${report.created_date ? format(new Date(report.created_date), 'M/d/yy h:mm a') : 'N/A'}</span>
            </div>
          </div>
          
          <div class="content">
            <div class="section">
              <div class="field-box">
                <div class="field-label">Location/Post Assignment</div>
                <div class="field-value">${report.location}</div>
              </div>
            </div>

            ${report.weather_conditions || report.patrol_count || report.visitors_logged || report.doors_checked ? `
            <div class="section">
              <div class="section-title">Shift Statistics</div>
              <div class="stats-grid">
                ${report.weather_conditions ? `
                <div class="stat-box">
                  <div class="stat-label">Weather</div>
                  <div class="stat-value" style="font-size: 11pt;">${report.weather_conditions}</div>
                </div>
                ` : ''}
                ${report.patrol_count ? `
                <div class="stat-box">
                  <div class="stat-label">Patrols</div>
                  <div class="stat-value">${report.patrol_count}</div>
                </div>
                ` : ''}
                ${report.visitors_logged ? `
                <div class="stat-box">
                  <div class="stat-label">Visitors</div>
                  <div class="stat-value">${report.visitors_logged}</div>
                </div>
                ` : ''}
                ${report.doors_checked ? `
                <div class="stat-box">
                  <div class="stat-label">Doors Checked</div>
                  <div class="stat-value">${report.doors_checked}</div>
                </div>
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            <div class="section">
              <div class="section-title">Activities & Observations</div>
              <div class="field-box">
                <div class="field-value">${report.activities}</div>
              </div>
            </div>

            ${report.incidents ? `
            <div class="section">
              <div class="section-title">Incidents Reported</div>
              <div class="field-box">
                <div class="field-value">${report.incidents}</div>
              </div>
            </div>
            ` : ''}

            ${report.vehicles_noted ? `
            <div class="section">
              <div class="section-title">Vehicles Noted</div>
              <div class="field-box">
                <div class="field-value">${report.vehicles_noted}</div>
              </div>
            </div>
            ` : ''}

            ${report.persons_of_interest ? `
            <div class="section">
              <div class="section-title">Persons of Interest</div>
              <div class="field-box">
                <div class="field-value">${report.persons_of_interest}</div>
              </div>
            </div>
            ` : ''}

            ${report.equipment_check ? `
            <div class="section">
              <div class="section-title">Equipment Status</div>
              <div class="field-box">
                <div class="field-value">${report.equipment_check}</div>
              </div>
            </div>
            ` : ''}

            ${report.photo_url ? `
            <div class="photo-section">
              <div class="section-title">Photo Documentation</div>
              <img src="${report.photo_url}" alt="Shift documentation" />
            </div>
            ` : ''}
            
            <div class="signature-section">
              <div class="field-label">Officer Signature</div>
              <div class="sig-line"></div>
              <div class="sig-details">Date: ____________________</div>
            </div>
          </div>
          
          <div class="footer">
          </div>
        </div>
        
        <script>
          window.onload = function() { 
            setTimeout(() => { window.print(); }, 500);
          }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
  };


  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['myShiftReports'] }),
      queryClient.invalidateQueries({ queryKey: ['myReportTodos'] }),
    ]);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Shift Reports</h1>
            <p className="text-sm md:text-base text-slate-600">Document your shift activities</p>
          </div>
          <Button
            onClick={() => {
              setEditingReport(null);
              setEditingTodoId(null); // Ensure todoId is cleared when opening new form
              setShowForm(!showForm);
              if (!showForm) { // When opening the form for a NEW report
                setFormData({
                  shift_date: format(new Date(), 'yyyy-MM-dd'),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                  start_time: "",
                  end_time: "",
                  // If admin and not clocked in, start with empty location for selection.
                  // Otherwise, if active entry exists, use its location (for non-admins or clocked-in admins).
                  // If no active entry and not admin, it will remain empty, but the form won't show.
                  location: isAdmin && !activeEntry
                    ? ""
                    : (activeEntry?.location ? activeEntry.location.split(' - ')[0] : ""),
                  weather_conditions: "",
                  patrol_count: "",
                  visitors_logged: "",
                  doors_checked: "",
                  activities: "",
                  incidents: "",
                  vehicles_noted: "",
                  persons_of_interest: "",
                  equipment_check: "",
                  photo_url: "",
                });
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto"
            disabled={!canSubmit && !showForm} // Disable "New Report" button if user cannot submit (e.g., not clocked in and not admin)
          >
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        {!canSubmit && ( // Show alert if user cannot submit (e.g., not clocked in and not admin)
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must be clocked in to submit a shift report. Please clock in at your assigned location first.
            </AlertDescription>
          </Alert>
        )}

        {showForm && canSubmit && ( // Only show form if canSubmit is true
          <Card className="border-none shadow-xl">
            <CardHeader className={editingReport ? "bg-gradient-to-r from-blue-50 to-purple-50" : "bg-gradient-to-r from-emerald-50 to-teal-50"}>
              <CardTitle className="flex items-center gap-2">
                {editingReport ? (
                  <>
                    <Pencil className="w-5 h-5 text-blue-600" />
                    Edit Shift Report
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-emerald-600" />
                    New Shift Report
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shift_date">Shift Date *</Label>
                    <Input
                      id="shift_date"
                      type="date"
                      value={formData.shift_date}
                      onChange={(e) => setFormData({...formData, shift_date: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Select
                    value={formData.location}
                    onValueChange={(value) => setFormData(prev => ({...prev, location: value}))}
                    required
                  >
                    <SelectTrigger id="location">
                      <SelectValue placeholder="Select location" />
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

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weather_conditions">Weather</Label>
                    <Input
                      id="weather_conditions"
                      placeholder="Clear, Rainy, etc."
                      value={formData.weather_conditions}
                      onChange={(e) => setFormData({...formData, weather_conditions: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patrol_count">Patrols Conducted</Label>
                    <Input
                      id="patrol_count"
                      type="number"
                      placeholder="0"
                      value={formData.patrol_count}
                      onChange={(e) => setFormData({...formData, patrol_count: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visitors_logged">Visitors Logged</Label>
                    <Input
                      id="visitors_logged"
                      type="number"
                      placeholder="0"
                      value={formData.visitors_logged}
                      onChange={(e) => setFormData({...formData, visitors_logged: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doors_checked">Doors/Areas Checked</Label>
                  <Input
                    id="doors_checked"
                    type="number"
                    placeholder="Number of doors/areas checked"
                    value={formData.doors_checked}
                    onChange={(e) => setFormData({...formData, doors_checked: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="activities">Activities & Observations *</Label>
                    <ReportAIEnhancer 
                      text={formData.activities}
                      onEnhanced={(enhanced) => setFormData({...formData, activities: enhanced})}
                      fieldName="activities and observations"
                    />
                  </div>
                  <Textarea
                    id="activities"
                    placeholder="Describe patrols, checks, and observations made during shift..."
                    value={formData.activities}
                    onChange={(e) => setFormData({...formData, activities: e.target.value})}
                    required
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicles_noted">Suspicious or Notable Vehicles</Label>
                  <Textarea
                    id="vehicles_noted"
                    placeholder="License plates, descriptions..."
                    value={formData.vehicles_noted}
                    onChange={(e) => setFormData({...formData, vehicles_noted: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="persons_of_interest">Persons of Interest</Label>
                  <Textarea
                    id="persons_of_interest"
                    placeholder="Descriptions of individuals encountered..."
                    value={formData.persons_of_interest}
                    onChange={(e) => setFormData({...formData, persons_of_interest: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="equipment_check">Equipment Status</Label>
                  <Textarea
                    id="equipment_check"
                    placeholder="Radio, flashlight, vehicle condition, etc."
                    value={formData.equipment_check}
                    onChange={(e) => setFormData({...formData, equipment_check: e.target.value})}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="incidents">Incidents</Label>
                    <ReportAIEnhancer 
                      text={formData.incidents}
                      onEnhanced={(enhanced) => setFormData({...formData, incidents: enhanced})}
                      fieldName="incidents"
                    />
                  </div>
                  <Textarea
                    id="incidents"
                    placeholder="Describe any incidents (if none, leave blank)..."
                    value={formData.incidents}
                    onChange={(e) => setFormData({...formData, incidents: e.target.value})}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="photo">Photo (Optional)</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="flex-1"
                    />
                    {uploading && <span className="text-sm text-slate-500">Uploading...</span>}
                  </div>
                  {formData.photo_url && (
                    <img
                      src={formData.photo_url}
                      alt="Preview"
                      className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200 mt-2"
                    />
                  )}
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveAsDraft}
                    disabled={saving || uploading || saveReportMutation.isPending}
                    className="bg-slate-50 hover:bg-slate-100"
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveReportMutation.isPending || uploading || saving}
                    className={editingReport ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}
                  >
                    {saveReportMutation.isPending ? 'Submitting...' : (editingReport ? 'Update Report' : 'Submit Report')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {reportTodos && reportTodos.length > 0 && (
          <Card className="border-l-4 border-l-amber-600 shadow-xl bg-gradient-to-r from-amber-50 to-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-6 h-6" />
                Reports Needing Revision ({reportTodos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {reportTodos.map((todo) => {
                  const report = reports?.find(r => r.id === todo.report_id);
                  if (!report) return null;
                  
                  return (
                    <div key={todo.id} className="p-4 bg-white rounded-lg border-2 border-amber-300">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold text-amber-900">
                          {format(new Date(report.shift_date), 'MMM d, yyyy')} - {report.location}
                        </p>
                        <Badge className="bg-amber-600 text-white">Needs Revision</Badge>
                      </div>
                      <div className="p-3 bg-amber-50 rounded border border-amber-200 mb-3">
                        <p className="text-xs text-amber-700 font-medium mb-1">Admin Feedback:</p>
                        <p className="text-sm text-amber-900">{todo.admin_feedback}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-amber-700">Sent by: {todo.created_by_admin}</p>
                        <Button
                          onClick={() => handleEditReport(report, todo.id)}
                          className="bg-amber-600 hover:bg-amber-700"
                          size="sm"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit & Resubmit
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active" className="text-xs sm:text-sm">
              <FileText className="w-4 h-4 mr-2" />
              Active ({activeReports.length})
            </TabsTrigger>
            <TabsTrigger value="drafts" className="text-xs sm:text-sm">
              <Edit className="w-4 h-4 mr-2" />
              Drafts ({draftReports.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="text-xs sm:text-sm">
              <Archive className="w-4 h-4 mr-2" />
              Archived ({archivedReports.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="active">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>My Recent Shift Reports (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeReports.map((report) => (
                    <div key={report.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.shift_date), 'MMM d, yyyy')} at {report.location}
                          </p>
                          <p className="text-sm text-slate-600">
                            {report.start_time} to {report.end_time}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={report.status} />
                          {/* Only allow editing own reports if not approved.
                              'reports' already filtered by current user, so created_by check is redundant. */}
                          {report.status !== 'approved' && (
                            <Button
                              onClick={() => handleEditReport(report)} // No todoId here as it's not from a todo list
                              size="sm"
                              variant="outline"
                              className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                          )}
                          <Button
                              onClick={() => printReport(report)}
                              size="sm"
                              variant="outline"
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Print
                            </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Activities:</p>
                          <p className="text-sm text-slate-700">{report.activities}</p>
                        </div>
                        {report.incidents && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Incidents:</p>
                            <p className="text-sm text-slate-700">{report.incidents}</p>
                          </div>
                        )}
                        {report.photo_url && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Photo:</p>
                            <img
                              src={report.photo_url}
                              alt="Shift report attachment"
                              className="w-full max-w-xs h-32 object-cover rounded-lg border border-slate-200"
                            />
                          </div>
                        )}
                        {report.admin_notes && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <p className="text-xs text-red-700 font-medium mb-1">Admin Notes:</p>
                            <p className="text-sm text-red-900">{report.admin_notes}</p>
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t-2 border-slate-300">
                          <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                          <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                            {getOfficerSignature(report.created_by_id)}
                          </p>
                          {report.officer_ip_address && report.created_date && (
                            <p className="text-xs text-slate-400 mt-1">
                              IP: {report.officer_ip_address} | Signed: {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!activeReports.length && (
                    <p className="text-center text-slate-500 py-8">No recent shift reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drafts">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Draft Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {draftReports.map((report) => (
                    <div key={report.id} className="p-5 bg-amber-50 rounded-lg border-2 border-amber-300">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <Badge className="bg-amber-600 text-white mb-2">DRAFT</Badge>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.shift_date), 'MMM d, yyyy')} at {report.location}
                          </p>
                          <p className="text-sm text-slate-600">
                            {report.start_time || 'No time'} to {report.end_time || 'No time'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleEditReport(report)}
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Continue Editing
                          </Button>
                          <Button
                              onClick={() => printReport(report)}
                              size="sm"
                              variant="outline"
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Print
                            </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Activities:</p>
                          <p className="text-sm text-slate-700">{report.activities}</p>
                        </div>
                        {report.incidents && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Incidents:</p>
                            <p className="text-sm text-slate-700">{report.incidents}</p>
                          </div>
                        )}
                        {report.photo_url && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Photo:</p>
                            <img
                              src={report.photo_url}
                              alt="Shift report attachment"
                              className="w-full max-w-xs h-32 object-cover rounded-lg border border-slate-200"
                            />
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t-2 border-slate-300">
                          <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                          <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                            {getOfficerSignature(report.created_by_id)}
                          </p>
                          {report.officer_ip_address && report.created_date && (
                            <p className="text-xs text-slate-400 mt-1">
                              IP: {report.officer_ip_address} | Saved: {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!draftReports.length && (
                    <p className="text-center text-slate-500 py-8">No draft reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Archived Shift Reports (Older than 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {archivedReports.map((report) => (
                    <div key={report.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200 opacity-75">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.shift_date), 'MMM d, yyyy')} at {report.location}
                          </p>
                          <p className="text-sm text-slate-600">
                            {report.start_time} to {report.end_time}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={report.status} />
                          <Button
                              onClick={() => printReport(report)}
                              size="sm"
                              variant="outline"
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Print
                            </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Activities:</p>
                          <p className="text-sm text-slate-700">{report.activities}</p>
                        </div>
                        {report.incidents && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Incidents:</p>
                            <p className="text-sm text-slate-700">{report.incidents}</p>
                          </div>
                        )}
                        {report.photo_url && (
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1">Photo:</p>
                            <img
                              src={report.photo_url}
                              alt="Shift report attachment"
                              className="w-full max-w-xs h-32 object-cover rounded-lg border border-slate-200"
                            />
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t-2 border-slate-300">
                          <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                          <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                            {getOfficerSignature(report.created_by_id)}
                          </p>
                          {report.officer_ip_address && report.created_date && (
                            <p className="text-xs text-slate-400 mt-1">
                              IP: {report.officer_ip_address} | Signed: {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!archivedReports.length && (
                    <p className="text-center text-slate-500 py-8">No archived reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </PullToRefresh>
  );
}