import { confirmInApp } from '@/lib/inAppDialog';
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
import { FileText, Plus, AlertTriangle, Edit, Archive, Pencil, Printer, Clock, ArrowLeft, ShieldCheck } from "lucide-react";
import SupervisorSiteCheckModal from "../components/SupervisorSiteCheckModal";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format, subDays, isAfter } from "date-fns";
import StatusBadge from "../components/dashboard/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportAIEnhancer from "../components/ReportAIEnhancer";
import SignaturePad from "../components/SignaturePad";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { getLiveLocation, waitForLiveLocation } from '@/lib/liveLocationService';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';

export default function DailyActivityReports() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [formData, setFormData] = useState({
    report_date: format(new Date(), 'yyyy-MM-dd'),
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
    hourly_entries: "",
    hourly_entries_array: [],
    vehicles_noted: "",
    persons_of_interest: "",
    equipment_check: "",
    incidents: "",
    photo_urls: [],
  });
  const [entryText, setEntryText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState("");
  const [showSiteCheckModal, setShowSiteCheckModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const email = String(user.email).trim().toLowerCase();
      const entries = await base44.entities.TimeEntry.list('-clock_in', 500);
      return entries.find(e => !e.clock_out && String(e.officer_email || '').trim().toLowerCase() === email) || null;
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0].trim() : '';

  const { data: reports } = useQuery({
    queryKey: ['myDailyActivityReports', user?.id],
    queryFn: () => base44.entities.DailyActivityReport.filter(
      { created_by_id: user.id },
      '-created_date'
    ),
    enabled: !!user?.id,
  });

  const { data: reportTodos } = useQuery({
    queryKey: ['myDARTodos'],
    queryFn: async () => {
      const todos = await base44.entities.ReportTodo.filter({
        officer_email: user?.email,
        report_type: 'daily_activity_report',
        completed: false
      });
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

  const parseHourlyEntries = (entries) => {
    if (!entries) return [];
    // Supports the current local 12-hour format and older 24-hour/Zulu entries.
    const lines = entries.split('\n').map(l => l.trim()).filter(Boolean);
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const timeMatch = line.match(/^(\d{1,2}:\d{2}(?:\s?[AP]M)?|\d{2}:\d{2})/i);
      if (!timeMatch) continue;
      const time = timeMatch[1].replace(/\s*([AP]M)$/i, ' $1').toUpperCase();
      const inlineText = line.slice(timeMatch[0].length).replace(/^Z\s*/i, '').trim();
      if (inlineText) {
        result.push({ time, text: inlineText });
      } else if (i + 1 < lines.length && !lines[i + 1].match(/^\d{1,2}:\d{2}(?:\s?[AP]M)?/i)) {
        result.push({ time, text: lines[i + 1] });
        i++;
      }
    }
    return result;
  };

  const getOfficerSignature = (officerRef) => {
    const officerFromUsers = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    const email = officerFromUsers?.email || officerRef;
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
    const rosterEntry = rosterEntries?.find(r => r.email === email && r.status === 'active');
    if (rosterEntry) {
      const lastName = rosterEntry.last_name || '';
      const unitNumber = rosterEntry.unit_number || '';
      if (lastName && unitNumber) {
        return `${lastName} Unit ${unitNumber}`;
      }
      return `${rosterEntry.first_name || ''} ${rosterEntry.last_name || ''}`.trim() || email;
    }

    const officer = officerFromUsers || allUsers?.find(u => u.email === email);
    if (officer?.last_name && officer?.unit_number) {
      return `${officer.last_name} Unit ${officer.unit_number}`;
    }
    return officer?.full_name || officer?.email || email;
  };

  useEffect(() => {
    if (activeEntry?.location) {
      const siteName = activeEntry.location.split(' - ')[0].trim();
      const matchingLocation = locations?.find(loc => loc.site_name === siteName);
      setFormData(prev => ({ ...prev, location: matchingLocation?.site_name || siteName }));
    }
  }, [activeEntry, locations]);

  const deleteDraftMutation = useMutation({
    mutationFn: (id) => base44.entities.DailyActivityReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myDailyActivityReports'] });
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: async ({ data, isDraft }) => {
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

      // Capture device timezone and GPS from the one app-wide location service.
      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let gpsLat = null;
      let gpsLng = null;
      try {
        const fix = getLiveLocation(15000) || await waitForLiveLocation({ maxAgeMs: 15000, timeoutMs: 3000 });
        gpsLat = fix.latitude;
        gpsLng = fix.longitude;
      } catch {}

      const gpsData = {};
      if (gpsLat != null && gpsLat !== '' && Number.isFinite(Number(gpsLat))) gpsData.gps_latitude = Number(gpsLat);
      if (gpsLng != null && gpsLng !== '' && Number.isFinite(Number(gpsLng))) gpsData.gps_longitude = Number(gpsLng);

      let locationToSubmit = data.location;
      if (!locationToSubmit && isAdmin) {
        locationToSubmit = "Admin - Remote Submission";
      } else if (!locationToSubmit && isDraft) {
        locationToSubmit = "Draft - Location TBD";
      } else if (!locationToSubmit && !isDraft) {
        locationToSubmit = "Unknown Location";
      }

      // Strip client-only fields before saving, convert numeric strings to numbers
      const { hourly_entries_array: _hourlyEntriesArray, patrol_count, visitors_logged, doors_checked, ...restData } = data;
      const saveData = { ...restData };
      if (patrol_count !== '' && patrol_count != null) saveData.patrol_count = Number(patrol_count);
      if (visitors_logged !== '' && visitors_logged != null) saveData.visitors_logged = Number(visitors_logged);
      if (doors_checked !== '' && doors_checked != null) saveData.doors_checked = Number(doors_checked);

      if (editingReport) {
        const updated = await base44.entities.DailyActivityReport.update(editingReport.id, {
          ...saveData,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress,
          signature_url: signatureUrl || data.signature_url || '',
          device_timezone: deviceTimezone,
          ...gpsData,
          shift_id: activeEntry?.id || editingReport?.shift_id || '',
          officer_email: user?.email || editingReport?.officer_email || '',
        });

        if (!isDraft) {
          if (editingTodoId) {
            await completeReportTodo(editingTodoId);
          } else {
            const todos = await base44.entities.ReportTodo.filter({
              officer_email: user.email,
              report_type: 'daily_activity_report',
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
        const report = await base44.entities.DailyActivityReport.create({
          ...saveData,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          officer_ip_address: ipAddress,
          signature_url: signatureUrl || '',
          device_timezone: deviceTimezone,
          ...gpsData,
          shift_id: activeEntry?.id || '',
          officer_email: user?.email || '',
        });
        return report;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['myDailyActivityReports'] });
      queryClient.invalidateQueries({ queryKey: ['myDARTodos'] });
      setSaving(false);
      
      if (!variables.isDraft) {
        toast.success('Report submitted successfully!');
        setShowForm(false);
        setEditingReport(null);
        setEditingTodoId(null);
        setSignatureUrl("");
        setShowSignaturePad(false);
        setFormData({
          report_date: format(new Date(), 'yyyy-MM-dd'),
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
          hourly_entries: "",
          hourly_entries_array: [],
          vehicles_noted: "",
          persons_of_interest: "",
          equipment_check: "",
          incidents: "",
          photo_urls: [],
        });
      } else {
        toast.success('Draft saved!');
      }
    },
    onError: (error) => {
      console.error('Error saving DAR:', error);
      setSaving(false);
      toast.error(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to save report. Please try again.');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.location) {
      alert('Please select a location before submitting the report.');
      return;
    }

    if (formData.hourly_entries_array.length === 0) {
      alert('Please add at least one hourly activity entry before submitting.');
      return;
    }

    setSaving(true);
    const entriesFormatted = formData.hourly_entries_array.map(e => `${e.time}\n${e.text}`).join('\n\n');
    saveReportMutation.mutate({ data: { ...formData, hourly_entries: entriesFormatted }, isDraft: false });
  };

  const handleSaveAsDraft = () => {
    if (!formData.report_date) {
      toast.error('Please select a report date before saving as draft.');
      return;
    }
    setSaving(true);
    const entriesFormatted = formData.hourly_entries_array.length > 0 
      ? formData.hourly_entries_array.map(e => `${e.time}\n${e.text}`).join('\n\n')
      : (formData.hourly_entries || 'Draft - entries pending');
    saveReportMutation.mutate({ data: { ...formData, hourly_entries: entriesFormatted }, isDraft: true });
  };

  const handleEditReport = (report, todoId = null) => {
    if (report.status === 'approved') {
      alert("This report has been approved and can no longer be edited.");
      return;
    }
    
    if (report.status !== 'draft' && String(report.created_by_id || '') !== String(user?.id || '')) {
      alert("You can only edit your own reports.");
      return;
    }
    
    setEditingReport(report);
    setEditingTodoId(todoId);
    setSignatureUrl(report.signature_url || "");
    setShowSignaturePad(false);
    const entriesArray = parseHourlyEntries(report.hourly_entries);
    setFormData({
      report_date: report.report_date,
      start_time: report.start_time,
      end_time: report.end_time,
      location: report.location,
      weather_conditions: report.weather_conditions || "",
      patrol_count: report.patrol_count || "",
      visitors_logged: report.visitors_logged || "",
      doors_checked: report.doors_checked || "",
      hourly_entries: report.hourly_entries,
      hourly_entries_array: entriesArray,
      vehicles_noted: report.vehicles_noted || "",
      persons_of_interest: report.persons_of_interest || "",
      equipment_check: report.equipment_check || "",
      incidents: report.incidents || "",
      photo_urls: Array.isArray(report.photo_urls) ? report.photo_urls : (report.photo_url ? [report.photo_url] : []),
    });
    setShowForm(true);
  };

  const sevenDaysAgo = subDays(new Date(), 7);
  const activeReports = reports?.filter(r => r.status !== 'draft' && isAfter(new Date(r.report_date), sevenDaysAgo)) || [];
  const archivedReports = reports?.filter(r => r.status !== 'draft' && !isAfter(new Date(r.report_date), sevenDaysAgo)) || [];
  const draftReports = reports?.filter(r => r.status === 'draft') || [];

  const printReport = (report) => {
    const printWindow = window.open('', '', 'width=850,height=1100');

    const officerName = getOfficerName(report.created_by_id);
    const displayReportDate = report.report_date ? format(new Date(report.report_date), 'MMMM d, yyyy') : '';

    // Convert to Zulu time
    const toZulu = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
    };
    
    const startTimeZulu = report.start_time ? report.start_time + 'Z' : '';
    const endTimeZulu = report.end_time ? report.end_time + 'Z' : '';
    const submittedZulu = toZulu(report.created_date);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Activity Report - ${officerName}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.3in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 7.5pt; line-height: 1.2; color: #1a1a1a; }
          
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
          
          .report-container { border: 2px solid #1e40af; border-radius: 4px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 10px; text-align: center; }
          .logo { width: 35px; height: 35px; object-fit: contain; margin: 0 auto 4px; background: white; border-radius: 4px; padding: 2px; }
          .title { font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 2px; }
          .subtitle { font-size: 8.5pt; font-weight: 500; opacity: 0.95; }
          .dcjs { font-size: 6pt; margin-top: 3px; opacity: 0.9; }

          .meta-bar { background: #f8fafc; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
          .meta-item { font-size: 6.5pt; }
          .meta-label { font-weight: 600; color: #475569; }
          .meta-value { color: #1e293b; }

          .content { padding: 8px; }
          .section { margin-bottom: 6px; }
          .section-title { background: #e0e7ff; color: #1e40af; font-weight: bold; font-size: 7.5pt; padding: 3px 6px; border-left: 3px solid #1e40af; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }

          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 3px; padding: 6px; margin: 3px 0; }
          .field-label { font-size: 6pt; font-weight: 600; color: #475569; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.2px; }
          .field-value { color: #1e293b; font-size: 7pt; white-space: pre-wrap; line-height: 1.3; }

          .signature-section { margin-top: 8px; padding: 6px; background: #f8fafc; border-radius: 3px; }
          .sig-line { border-bottom: 1.5px solid #1e40af; min-height: 20px; margin: 3px 0; font-family: 'Brush Script MT', cursive; font-size: 12pt; padding: 2px; color: #1e40af; }
          .sig-details { font-size: 5.5pt; color: #64748b; margin-top: 3px; }

          .footer { background: #1e293b; color: white; padding: 6px; text-align: center; font-size: 6pt; margin-top: 8px; border-radius: 0 0 3px 3px; }
          .footer strong { font-size: 7pt; display: block; margin-bottom: 2px; }
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
              <span class="meta-value">${displayReportDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Shift (Zulu):</span>
              <span class="meta-value">${startTimeZulu} - ${endTimeZulu}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Submitted (Zulu):</span>
              <span class="meta-value">${submittedZulu}</span>
            </div>
          </div>
          
          <div class="content">
            <div class="field-box">
              <div class="field-label">Location/Post Assignment</div>
              <div class="field-value">${report.location}</div>
            </div>
            
            ${report.weather_conditions || report.patrol_count || report.visitors_logged || report.doors_checked ? `
            <div class="section">
              <div class="section-title">Shift Statistics</div>
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 4px;">
                ${report.weather_conditions ? `
                <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 4px; text-align: center;">
                  <div style="font-size: 5.5pt; color: #64748b; font-weight: 600; margin-bottom: 1px;">WEATHER</div>
                  <div style="font-size: 7pt; font-weight: bold; color: #1e40af;">${report.weather_conditions}</div>
                </div>
                ` : ''}
                ${report.patrol_count ? `
                <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 4px; text-align: center;">
                  <div style="font-size: 5.5pt; color: #64748b; font-weight: 600; margin-bottom: 1px;">PATROLS</div>
                  <div style="font-size: 9pt; font-weight: bold; color: #1e40af;">${report.patrol_count}</div>
                </div>
                ` : ''}
                ${report.visitors_logged ? `
                <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 4px; text-align: center;">
                  <div style="font-size: 5.5pt; color: #64748b; font-weight: 600; margin-bottom: 1px;">VISITORS</div>
                  <div style="font-size: 9pt; font-weight: bold; color: #1e40af;">${report.visitors_logged}</div>
                </div>
                ` : ''}
                ${report.doors_checked ? `
                <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 4px; text-align: center;">
                  <div style="font-size: 5.5pt; color: #64748b; font-weight: 600; margin-bottom: 1px;">DOORS</div>
                  <div style="font-size: 9pt; font-weight: bold; color: #1e40af;">${report.doors_checked}</div>
                </div>
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            <div class="section-title">Activities & Observations</div>
             <div class="field-box">
               <div class="field-value" style="font-family: 'Courier New', monospace;">
                 ${report.hourly_entries.split('\n').map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('')}
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
            
            ${(report.photo_urls && report.photo_urls.length > 0) || report.photo_url ? `
              <div style="margin: 4px 0;">
                <div class="section-title">Photo Documentation</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px; margin-top: 3px;">
                  ${(report.photo_urls || (report.photo_url ? [report.photo_url] : [])).map(url => `
                    <img src="${url}" alt="Documentation" style="width: 100%; height: 100px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 3px;" />
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            <div class="signature-section">
              <div class="field-label">Officer Signature</div>
              ${report.signature_url
                ? `<div class="sig-line" style="min-height:40px;"><img src="${report.signature_url}" alt="Signature" style="height:36px;object-fit:contain;" /></div>`
                : `<div class="sig-line"></div>`
              }
              <div class="sig-details">
                Date: ____________________
              </div>
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

  // Auto-set date/time on mount
  useEffect(() => {
    const now = new Date();
    const localDate = format(now, 'yyyy-MM-dd');
    const localTime = format(now, 'HH:mm');
    setFormData(prev => ({
      ...prev,
      report_date: prev.report_date || localDate,
      start_time: prev.start_time || localTime,
    }));
  }, []);

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <SupervisorSiteCheckModal
        isOpen={showSiteCheckModal}
        onClose={() => setShowSiteCheckModal(false)}
        location={formData.location}
        currentEntries={formData.hourly_entries_array}
        onEntryAdded={(entry) => {
          setFormData(prev => ({
            ...prev,
            hourly_entries_array: [...prev.hourly_entries_array, entry]
          }));
          setShowSiteCheckModal(false);
        }}
        officerName={user?.full_name || user?.email}
        officerEmail={user?.email}
      />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-slate-600 hover:text-slate-900 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">Daily Activity Reports</h1>
              <p className="text-sm md:text-base text-slate-600">Document hourly activities during your shift</p>
            </div>
          </div>
          <Button
            onClick={() => {
              setEditingReport(null);
              setEditingTodoId(null);
              setShowForm(!showForm);
              if (!showForm) {
                setFormData({
                  report_date: format(new Date(), 'yyyy-MM-dd'),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                  start_time: "",
                  end_time: "",
                  location: isAdmin && !activeEntry
                    ? ""
                    : (activeEntry?.location ? activeEntry.location.split(' - ')[0] : ""),
                  weather_conditions: "",
                  patrol_count: "",
                  visitors_logged: "",
                  doors_checked: "",
                  hourly_entries: "",
                  hourly_entries_array: [],
                  vehicles_noted: "",
                  persons_of_interest: "",
                  equipment_check: "",
                  incidents: "",
                  photo_urls: [],
                });
                setSignatureUrl("");
                setShowSignaturePad(false);
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        {/* Clock-in not required to submit DARs */}

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className={editingReport ? "bg-gradient-to-r from-blue-50 to-purple-50" : "bg-gradient-to-r from-blue-50 to-indigo-50"}>
              <CardTitle className="flex items-center gap-2">
                {editingReport ? (
                  <>
                    <Pencil className="w-5 h-5 text-blue-600" />
                    Edit Daily Activity Report
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-blue-600" />
                    New Daily Activity Report
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                        <div className="grid md:grid-cols-3 gap-4">
                           <div className="space-y-2">
                             <Label htmlFor="report_date">Report Date *</Label>
                             <Input
                               id="report_date"
                               type="date"
                               value={formData.report_date}
                               onChange={(e) => setFormData({...formData, report_date: e.target.value})}
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
                      {currentSiteName && !locations?.some(loc => loc.site_name === currentSiteName) && (
                        <SelectItem value={currentSiteName}>{currentSiteName}</SelectItem>
                      )}
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
                   <Label>Hourly Activity Entries *</Label>
                   <div className="p-3 bg-[#111d2b] border border-slate-700 rounded-lg mb-3">
                     <p className="text-xs text-slate-200 font-semibold mb-2">Add timestamped entries</p>
                     <div className="space-y-3">
                       <div className="space-y-1">
                         <Label htmlFor="entryText" className="text-xs">Activity Description *</Label>
                         <Input
                           id="entryText"
                           placeholder="What did you do?"
                           value={entryText}
                           onChange={(e) => setEntryText(e.target.value)}
                         />
                         <p className="text-xs text-slate-400">Time will be auto-stamped from your device when you add the entry.</p>
                       </div>
                       <Button
                         type="button"
                         onClick={() => {
                           if (entryText) {
                             const autoTime = format(new Date(), 'h:mm a');
                             setFormData(prev => ({
                               ...prev,
                               hourly_entries_array: [...prev.hourly_entries_array, { time: autoTime, text: entryText }]
                             }));
                             setEntryText("");
                           } else {
                             alert("Please enter an activity description");
                           }
                         }}
                         variant="outline"
                         className="w-full"
                       >
                         <Plus className="w-4 h-4 mr-2" />
                         Add Entry
                         </Button>
                         <Button
                         type="button"
                         onClick={() => setShowSiteCheckModal(true)}
                         variant="outline"
                         className="w-full border-emerald-500/50 text-emerald-300 hover:bg-emerald-950/30"
                         >
                         <ShieldCheck className="w-4 h-4 mr-2" />
                         Supervisor Site Check
                         </Button>
                         </div>

                         {formData.hourly_entries_array.length > 0 && (
                     <div className="space-y-2">
                       <p className="text-sm font-semibold text-slate-200">Added Entries ({formData.hourly_entries_array.length})</p>
                       <div className="space-y-2">
                         {formData.hourly_entries_array.map((entry, idx) => {
                           const isSiteCheck = entry.text?.includes('arrived on site to conduct a site check') || entry.text?.includes('departed the site after conducting a site check');
                           return (
                           <div key={idx} className={`flex items-start justify-between gap-2 p-3 rounded border ${isSiteCheck ? 'bg-emerald-950/25 border-emerald-600/50' : 'bg-[#0d1825] border-slate-700'}`}>
                             <div className="flex-1">
                               {isSiteCheck && <p className="text-xs text-emerald-300 font-semibold mb-1">🔒 Supervisor Site Check</p>}
                               <p className="font-mono font-semibold text-slate-100">{entry.time}</p>
                               <p className="text-sm text-slate-300">{entry.text}</p>
                             </div>
                             {!isSiteCheck && (
                             <Button
                               type="button"
                               size="sm"
                               variant="ghost"
                               onClick={() => setFormData(prev => ({
                                 ...prev,
                                 hourly_entries_array: prev.hourly_entries_array.filter((_, i) => i !== idx)
                               }))}
                               className="text-red-600 hover:text-red-700"
                             >
                               ×
                             </Button>
                             )}
                           </div>
                           );
                         })}
                       </div>
                     </div>
                   )}

                   {formData.hourly_entries_array.length === 0 && (
                     <div className="p-4 bg-amber-950/20 border border-amber-600/40 rounded text-sm text-amber-200">
                       No entries added yet. Add at least one entry above.
                     </div>
                   )}
                   </div>
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
                  <Label htmlFor="photo">Photos (Optional - Multiple files allowed)</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length === 0) return;
                        setUploading(true);
                        try {
                          const newUrls = [];
                          for (const file of files) {
                            const result = await base44.integrations.Core.UploadFile({ file });
                            if (result && result.file_url) {
                              newUrls.push(result.file_url);
                            }
                          }
                          if (newUrls.length > 0) {
                            setFormData((prevData) => ({ 
                              ...prevData, 
                              photo_urls: [...(prevData.photo_urls || []), ...newUrls] 
                            }));
                          } else {
                            alert("Failed to upload photos. Please try again.");
                          }
                          e.target.value = '';
                        } catch (error) {
                          console.error("Error uploading files:", error);
                          alert(`Failed to upload photos: ${error.message || 'Unknown error'}`);
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading}
                      className="flex-1"
                    />
                    {uploading && <span className="text-sm text-slate-500">Uploading...</span>}
                  </div>
                  {formData.photo_urls && formData.photo_urls.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {formData.photo_urls.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              photo_urls: prev.photo_urls.filter((_, i) => i !== idx)
                            }))}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Signature Section */}
                <div className="space-y-3">
                  <Label>Officer Signature</Label>
                  {signatureUrl ? (
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <img src={signatureUrl} alt="Signature" className="h-12 object-contain" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setSignatureUrl("")}>
                        Clear Signature
                      </Button>
                    </div>
                  ) : (
                    <div>
                      {showSignaturePad ? (
                        <SignaturePad
                          officerName={user?.full_name || user?.email}
                          onSignatureComplete={(url) => {
                            setSignatureUrl(url);
                            setShowSignaturePad(false);
                          }}
                          onClose={() => setShowSignaturePad(false)}
                        />
                      ) : (
                        <Button type="button" variant="outline" onClick={() => setShowSignaturePad(true)} className="w-full border-dashed border-2 h-16 text-slate-500">
                          ✍️ Tap to Sign
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  {editingReport && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSaveAsDraft}
                      disabled={saving || uploading || saveReportMutation.isPending}
                      className="bg-slate-50 hover:bg-slate-100"
                    >
                      {saving ? 'Saving...' : 'Save Draft'}
                    </Button>
                  )}
                  {!editingReport && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSaveAsDraft}
                      disabled={saving || uploading || saveReportMutation.isPending}
                      className="bg-slate-50 hover:bg-slate-100"
                    >
                      {saving ? 'Saving...' : 'Save as Draft'}
                    </Button>
                  )}
                  <RequiredAIReportReview />
                  <Button
                    type="submit"
                    disabled={saveReportMutation.isPending || uploading || saving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {saveReportMutation.isPending ? 'Submitting...' : 'Submit Report'}
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
                          {format(new Date(report.report_date), 'MMM d, yyyy')} - {report.location}
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
            <TabsTrigger value="drafts" className="text-xs sm:text-sm">
              <Clock className="w-4 h-4 mr-2" />
              Drafts ({draftReports.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs sm:text-sm">
              <FileText className="w-4 h-4 mr-2" />
              Active ({activeReports.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="text-xs sm:text-sm">
              <Archive className="w-4 h-4 mr-2" />
              Archived ({archivedReports.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="drafts">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>My Draft Reports ({draftReports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {draftReports.map((report) => (
                    <div key={report.id} className="p-5 bg-amber-50 rounded-lg border-2 border-amber-300">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <Badge className="bg-amber-600 text-white mb-2">DRAFT</Badge>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.report_date), 'MMM d, yyyy')} at {report.location || 'No location'}
                          </p>
                          <p className="text-sm text-slate-600">
                            {report.start_time || 'No time'} to {report.end_time || 'No time'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleEditReport(report)}
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Continue
                          </Button>
                          <Button
                            onClick={async () => {
                              if (await confirmInApp('Delete this draft report?')) {
                                deleteDraftMutation.mutate(report.id);
                              }
                            }}
                            size="sm"
                            variant="destructive"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {report.hourly_entries && (
                        <p className="text-sm text-slate-600 line-clamp-2">{report.hourly_entries}</p>
                      )}
                    </div>
                  ))}
                  {draftReports.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No draft reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>My Recent Reports (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeReports.map((report) => (
                    <div key={report.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.report_date), 'MMM d, yyyy')} at {report.location}
                          </p>
                          <p className="text-sm text-slate-600">
                            {report.start_time} to {report.end_time}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={report.status} />
                          {report.status !== 'approved' && (
                            <Button
                              onClick={() => handleEditReport(report)}
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
                          <p className="text-xs text-slate-500 font-medium mb-1">Hourly Activities:</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap font-mono">{report.hourly_entries}</p>
                        </div>
                        {report.admin_notes && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <p className="text-xs text-red-700 font-medium mb-1">Admin Notes:</p>
                            <p className="text-sm text-red-900">{report.admin_notes}</p>
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t-2 border-slate-300">
                          <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                          {report.signature_url ? (
                            <img src={report.signature_url} alt="Officer Signature" className="h-12 object-contain" />
                          ) : (
                            <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                              {getOfficerSignature(report.created_by_id)}
                            </p>
                          )}
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
                    <p className="text-center text-slate-500 py-8">No recent reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="archived">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Archived Reports (Older than 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {archivedReports.map((report) => (
                    <div key={report.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200 opacity-75">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-slate-900 mb-1">
                            {format(new Date(report.report_date), 'MMM d, yyyy')} at {report.location}
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
                          <p className="text-xs text-slate-500 font-medium mb-1">Hourly Activities:</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap font-mono">{report.hourly_entries}</p>
                        </div>
                        <div className="mt-4 pt-4 border-t-2 border-slate-300">
                           <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                           {report.signature_url ? (
                             <img src={report.signature_url} alt="Officer Signature" className="h-12 object-contain" />
                           ) : (
                             <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                               {getOfficerSignature(report.created_by_id)}
                             </p>
                           )}
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
  );
}