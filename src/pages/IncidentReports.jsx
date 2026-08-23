import { confirmInApp } from '@/lib/inAppDialog';
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { completeReportTodo } from '@/lib/reportTodoApi';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Plus, Clock, Pencil, Printer, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ReportAIEnhancer from "../components/ReportAIEnhancer";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import StructuredPeopleEditor from '@/components/reports/StructuredPeopleEditor';
import { toast } from 'sonner';
import { directoryUserMatches, findDirectoryUser, getCurrentDirectoryUser, listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import { listAllDispatchCallsForLinking } from '@/lib/reportCallLinking';
import CallLinkCombobox from '@/components/reports/CallLinkCombobox';
import {
  formatReportClock,
  formatReportDate,
  formatReportDateTime,
  openBlackPointReport,
  reportTimeZoneLabel,
  resolveReportTimeZone,
} from '@/lib/reportPrint';

// Build an incident description that references the CAD number instead of the
// upstream GRAC feed tag (e.g. "VANDALISM at ... [GRAC:abc]" -> "VANDALISM at ... [CAD:B1123]").
function buildCallDescription(raw, cadNumber) {
  const base = String(raw || '').replace(/\s*\[GRAC:[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const cad = String(cadNumber || '').trim();
  if (cad && /^B\d+$/i.test(cad)) {
    return base ? `${base} [CAD:${cad}]` : `[CAD:${cad}]`;
  }
  return base;
}

export default function IncidentReports() {
  const [showForm, setShowForm] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [formData, setFormData] = useState({
    incident_date: format(new Date(), 'yyyy-MM-dd'),
    incident_time: format(new Date(), 'HH:mm'),
    discovered_time: "",
    location: "",
    specific_location: "",
    incident_type: "other",
    description: "",
    suspect_description: "",
    suspect_vehicle: "",
    persons_involved: "",
    victims: "",
    witnesses: "",
    persons: [],
    injuries_reported: false,
    injury_details: "",
    property_damage: false,
    damage_details: "",
    estimated_value: "",
    action_taken: "",
    police_notified: false,
    ems_notified: false,
    fire_notified: false,
    police_report_number: "",
    severity: "medium",
    photo_url: "",
    linked_call_id: "",
    linked_call_number: "",
    linked_bolo_id: "",
    linked_bolo_number: "",
    primary_officer_id: "",
    primary_officer_name: "",
    backup_officer_ids: [],
  });

  // Check if we're creating a report from a call for service
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fromCall = urlParams.get('from_call');
    
    if (fromCall === 'true') {
      setFormData({
        ...formData,
        linked_call_id: urlParams.get('call_id') || '',
        linked_call_number: urlParams.get('call_number') || '',
        location: urlParams.get('location') || formData.location,
        incident_type: urlParams.get('incident_type') || formData.incident_type,
        incident_time: urlParams.get('incident_time') || formData.incident_time,
        description: buildCallDescription(urlParams.get('description') || formData.description, urlParams.get('call_number') || urlParams.get('call_id') || ''),
      });
      setShowForm(true);
    }
  }, []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const isAdmin = user?.role === 'admin';

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

  const canSubmit = isAdmin || !!activeEntry;
  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  const { data: allReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['allIncidentReports'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date'),
    enabled: !!user,
    initialData: [],
  });

  // Safely filter reports based on user's role and active entry for display
  const reportsPotentiallyVisible = React.useMemo(() => {
    if (!allReports || !user) return [];

    if (isAdmin) {
      // Admins see all reports (drafts and submitted)
      return allReports;
    } else {
      // Officers always retain access to every report they authored, including
      // submitted/approved reports after they clock out or move to another site.
      // Current-site reports remain visible for operational continuity.
      const officerReports = allReports.filter(report => {
        const isMyReport = String(report.created_by_id || '') === String(user.id)
          || String(report.primary_officer_id || '') === String(user.id)
          || directoryUserMatches(user, report.officer_email)
          || directoryUserMatches(user, report.created_by);
        const reportSite = String(report.location || '').split(':')[0].split(' - ')[0].trim().toLowerCase();
        const activeSite = String(currentSiteName || '').split(':')[0].split(' - ')[0].trim().toLowerCase();
        const isSubmittedAtMySite = report.status !== 'draft' && activeSite && reportSite === activeSite;
        return isMyReport || isSubmittedAtMySite;
      });
      return officerReports;
    }
  }, [allReports, currentSiteName, isAdmin, user]);

  const draftReports = reportsPotentiallyVisible.filter(r => r.status === 'draft' && (
    String(r.created_by_id || '') === String(user?.id || '') || directoryUserMatches(user, r.created_by || r.officer_email)
  )) || [];
  const submittedReports = reportsPotentiallyVisible.filter(r => r.status !== 'draft') || [];

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false);
    },
    initialData: [],
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const { data: activeBolos } = useQuery({
    queryKey: ['activeBolosForReports'],
    queryFn: async () => {
      const rows = await base44.entities.BOLOAlert.list('-created_date', 200);
      return (rows || []).filter(bolo => bolo.status === 'active');
    },
    initialData: [],
    refetchInterval: 15000,
  });

  const selectBolo = (boloId) => {
    if (boloId === 'none') {
      setFormData(prev => ({ ...prev, linked_bolo_id: '', linked_bolo_number: '' }));
      return;
    }
    const bolo = activeBolos.find(item => item.id === boloId);
    if (!bolo) return;
    setFormData(prev => ({ ...prev, linked_bolo_id: bolo.id, linked_bolo_number: bolo.bolo_number || bolo.id }));
  };

  const { data: activeDispatchCalls = [] } = useQuery({
    queryKey: ['dispatchCallsForIncidentReports'],
    queryFn: () => listAllDispatchCallsForLinking(1000),
    initialData: [],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const selectDispatchCall = (callId) => {
    if (callId === 'none') {
      setFormData(prev => ({ ...prev, linked_call_id: '', linked_call_number: '', primary_officer_id: '', primary_officer_name: '', backup_officer_ids: [] }));
      return;
    }
    const call = activeDispatchCalls.find(item => item.id === callId);
    if (!call) return;
    const primaryId = call.assigned_units?.[0] || '';
    const primary = allUsers.find(item => item.id === primaryId);
    setFormData(prev => ({
      ...prev,
      linked_call_id: call.id,
      linked_call_number: call.call_id || call.id,
      primary_officer_id: primaryId,
      primary_officer_name: primary ? `${primary.rank || ''} ${primary.first_name || ''} ${primary.last_name || ''}`.replace(/\s+/g, ' ').trim() : '',
      backup_officer_ids: call.assigned_units?.slice(1) || [],
      location: call.location || prev.location,
      description: buildCallDescription(prev.description || call.description || '', call.call_id || ''),
    }));
  };

  useEffect(() => {
    if (!isAdmin && !editingReportId && activeEntry?.location) {
      const siteName = activeEntry.location.split(' - ')[0].trim();
      const matchingLocation = locations?.find(loc => loc.site_name === siteName);
      setFormData(prev => ({ ...prev, location: matchingLocation?.site_name || siteName }));
    }
  }, [activeEntry, locations, editingReportId, isAdmin]);

  const generateReportNumber = () => {
    const formDate = format(new Date(formData.incident_date), 'yyyyMMdd');
    const existingToday = allReports?.filter(r => r.report_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(4, '0');
    return `VIR-${formDate}-${nextNum}`;
  };

  const generateCallNumber = () => {
    const formDate = format(new Date(formData.incident_date), 'yyyyMMdd');
    const existingToday = allReports?.filter(r => r.call_number?.includes(formDate)) || [];
    const nextNum = (existingToday.length + 1).toString().padStart(3, '0');
    return `C-${formDate}-${nextNum}`;
  };

  const deleteDraftMutation = useMutation({
    mutationFn: (id) => base44.entities.IncidentReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allIncidentReports'] });
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: async ({ data, isDraft }) => {
      // AI Analysis for severity and recommended actions
      let aiSeverity = data.severity;
      let supervisorAlert = false;

      if (!isDraft) {
        try {
          const aiAnalysis = await base44.integrations.Core.InvokeLLM({
            prompt: `Analyze this security incident and provide immediate recommendations.

INCIDENT DETAILS:
Type: ${data.incident_type}
Location: ${data.location}
Description: ${data.description}
${data.suspect_description ? `Suspect: ${data.suspect_description}` : ''}
${data.injuries_reported ? 'INJURIES REPORTED' : ''}
${data.property_damage ? 'PROPERTY DAMAGE' : ''}

Provide:
1. Severity assessment (low/medium/high/critical)
2. Whether supervisor should be alerted immediately (true/false)`,
            response_json_schema: {
              type: "object",
              properties: {
                severity: { type: "string" },
                alert_supervisor: { type: "boolean" }
              }
            }
          });

          aiSeverity = aiAnalysis.severity || data.severity;
          supervisorAlert = aiAnalysis.alert_supervisor;
        } catch (error) {
          console.error('AI analysis failed:', error);
        }
      }

      // Get officer's IP address
      let ipAddress = 'Unknown';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const ipResponse = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      const activeSiteName = activeEntry?.location?.split(' - ')[0]?.trim() || "";
      let locationToSubmit = String(data.location || activeSiteName).trim();
      if (!locationToSubmit) {
        locationToSubmit = isDraft
          ? "Draft - Location TBD"
          : (isAdmin ? "Admin - Remote Submission" : "Unknown Location");
      }

      // Drafts must satisfy the entity schema even when the officer has only
      // started the report. Placeholder values are removed when the draft is reopened.
      const dataToSave = {
        ...data,
        location: locationToSubmit,
        incident_time: isDraft ? (data.incident_time || "00:00") : data.incident_time,
        incident_type: isDraft ? (data.incident_type || "other") : data.incident_type,
        description: isDraft && !String(data.description || "").trim()
          ? "Draft - Description pending"
          : data.description,
      };

      if (editingReportId) {
        const updated = await base44.entities.IncidentReport.update(editingReportId, {
          ...dataToSave,
          severity: aiSeverity,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          was_rejected: false,
          admin_notes: null,
          officer_ip_address: ipAddress,
        });

        if (!isDraft) {
          if (editingTodoId) {
            await completeReportTodo(editingTodoId);
          } else if (user?.email) { // If no specific todoId, but it's a submission and user is known
            const todos = await base44.entities.ReportTodo.filter({
              officer_email: user.email,
              report_type: 'incident_report',
              report_id: editingReportId,
              completed: false
            });
            for (const todo of todos) {
              await completeReportTodo(todo.id);
            }
          }
        }
        return updated;
      } else {
        const newReportNumber = generateReportNumber();
        const newCallNumber = generateCallNumber();
        const report = await base44.entities.IncidentReport.create({
          ...dataToSave,
          severity: aiSeverity,
          report_number: newReportNumber,
          call_number: newCallNumber,
          location: locationToSubmit,
          status: isDraft ? "draft" : "submitted",
          officer_ip_address: ipAddress,
        });

        if (data.linked_call_id) {
          try {
            await base44.entities.ReportCallLink.create({
              call_id: data.linked_call_id,
              call_number: data.linked_call_number || '',
              report_type: 'IncidentReport',
              report_id: report.id,
              report_number: newReportNumber,
              primary_officer_id: data.primary_officer_id || '',
              primary_officer_name: data.primary_officer_name || '',
              linked_at: new Date().toISOString(),
              status: 'active',
            });
          } catch (linkError) {
            console.error('Failed to link report to call:', linkError);
          }
        }

        // Alert supervisors if critical
        if (supervisorAlert && !isDraft) {
          const supervisors = await listDirectoryUsers();
          const supervisorList = supervisors.filter(u => u.additional_roles?.includes('supervisor'));
          
          for (const supervisor of supervisorList) {
            await base44.entities.Notification.create({
              recipient_email: supervisor.email,
              type: 'training_reminder',
              title: '🚨 URGENT INCIDENT - Immediate Attention Required',
              message: `${data.incident_type.replace(/_/g, ' ')} at ${data.location}. AI assessed as ${aiSeverity} severity.`,
              priority: 'high',
              action_link: '/AdminReports',
            });
          }
        }

        return report;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['allIncidentReports'] });
      queryClient.invalidateQueries({ queryKey: ['myReportTodos'] });

      if (variables.isDraft) {
        toast.success('Draft saved successfully.');
      }
      resetForm();
      setSaving(false);
    },
    onError: (error) => {
      console.error('Error saving incident report:', error);
      setSaving(false);
      toast.error(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Failed to save report. Please try again.');
    }
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingReportId(null);
    setEditingTodoId(null);
    setFormData({
      incident_date: format(new Date(), 'yyyy-MM-dd'),
      incident_time: format(new Date(), 'HH:mm'),
      discovered_time: "",
      location: "",
      specific_location: "",
      incident_type: "other",
      description: "",
      suspect_description: "",
      suspect_vehicle: "",
      persons_involved: "",
      victims: "",
      witnesses: "",
      persons: [],
      injuries_reported: false,
      injury_details: "",
      property_damage: false,
      damage_details: "",
      estimated_value: "",
      action_taken: "",
      police_notified: false,
      ems_notified: false,
      fire_notified: false,
      police_report_number: "",
      severity: "medium",
      photo_url: "",
      linked_call_id: "",
      linked_call_number: "",
      linked_bolo_id: "",
      linked_bolo_number: "",
      primary_officer_id: "",
      primary_officer_name: "",
      backup_officer_ids: [],
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, photo_url: file_url });
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.description.includes('-') || (formData.action_taken && formData.action_taken.includes('-'))) {
      alert('Please do not use dashes (-) in your reports. Use bullets (•) or write in full sentences instead.');
      return;
    }

    saveReportMutation.mutate({ data: formData, isDraft: false });
  };

  const handleSaveAsDraft = () => {
    if (!formData.incident_date) {
      toast.error('Please select the incident date before saving as draft.');
      return;
    }
    setSaving(true);
    saveReportMutation.mutate({ data: formData, isDraft: true });
  };

  const handleEditReport = (report) => {
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

    setEditingReportId(report.id);
    // If report has an associated todo, set editingTodoId here
    // For now, it's not explicitly passed in the existing report object,
    // so it will remain null unless logic is added to fetch it.
    setFormData({
      incident_date: report.incident_date,
      incident_time: report.incident_time,
      discovered_time: report.discovered_time || "",
      location: report.location,
      specific_location: report.specific_location || "",
      incident_type: report.incident_type,
      description: report.status === 'draft' && report.description === 'Draft - Description pending'
        ? ''
        : buildCallDescription(report.description, report.linked_call_number || ''),
      suspect_description: report.suspect_description || "",
      suspect_vehicle: report.suspect_vehicle || "",
      persons_involved: report.persons_involved || "",
      victims: report.victims || "",
      witnesses: report.witnesses || "",
      persons: report.persons || [],
      injuries_reported: report.injuries_reported || false,
      injury_details: report.injury_details || "",
      property_damage: report.property_damage || false,
      damage_details: report.damage_details || "",
      estimated_value: report.estimated_value || "",
      action_taken: report.action_taken || "",
      police_notified: report.police_notified || false,
      ems_notified: report.ems_notified || false,
      fire_notified: report.fire_notified || false,
      police_report_number: report.police_report_number || "",
      severity: report.severity,
      photo_url: report.photo_url || "",
      linked_call_id: report.linked_call_id || "",
      linked_call_number: report.linked_call_number || "",
      linked_bolo_id: report.linked_bolo_id || "",
      linked_bolo_number: report.linked_bolo_number || "",
      primary_officer_id: report.primary_officer_id || "",
      primary_officer_name: report.primary_officer_name || "",
      backup_officer_ids: report.backup_officer_ids || [],
    });
    setShowForm(true);
  };

  const getOfficerSignature = (officerRef) => {
    const officer = findDirectoryUser([...(allUsers || []), user].filter(Boolean), officerRef);
    if (!officer) return String(officerRef || 'Unknown Officer');
    
    const rank = officer.rank || '';
    const lastName = officer.last_name || '';
    const unitNumber = officer.unit_number || '';
    
    if (rank && lastName && unitNumber) {
      return `${rank} ${lastName} Unit ${unitNumber}`;
    }
    if (rank && lastName) {
      return `${rank} ${lastName}`;
    }
    return `${officer?.first_name || ''} ${officer?.last_name || ''}`.trim() || officer?.email || 'Unknown Officer';
  };

  const getOfficerFullName = (officerRef) => {
    const officer = findDirectoryUser([...(allUsers || []), user].filter(Boolean), officerRef);
    return officer?.full_name || [officer?.first_name, officer?.last_name].filter(Boolean).join(' ') || officer?.email || String(officerRef || 'Unknown Officer');
  };

  const getOfficerEmail = (officerRef) => {
    const officer = findDirectoryUser([...(allUsers || []), user].filter(Boolean), officerRef);
    return officer?.email || '';
  };

  const severityColors = {
    low: "bg-blue-100 text-blue-800 border-blue-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200",
  };

  const printReport = (report) => {
    const locationRecord = locations?.find(location => location.site_name === report.location);
    const timeZone = resolveReportTimeZone(locationRecord);
    const zoneLabel = reportTimeZoneLabel(timeZone, report.created_date || report.incident_date);
    const creator = allUsers?.find(officer => String(officer.id) === String(report.created_by_id)
      || String(officer.email || '').toLowerCase() === String(report.created_by_id || '').toLowerCase());
    const officerName = getOfficerFullName(report.created_by_id);
    const people = Array.isArray(report.persons)
      ? report.persons.map(person => [
          person.role || person.type,
          person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
          person.description,
          person.contact,
        ].filter(Boolean).join(' — ')).filter(Boolean).join('\n')
      : '';

    openBlackPointReport({
      title: 'Incident Report',
      subtitle: 'Security Incident Documentation',
      reportNumber: report.report_number || '',
      status: report.status || report.severity || '',
      timeZone,
      meta: [
        { label: 'Call Number', value: report.call_number || report.linked_call_number || 'Not linked' },
        { label: 'Incident Date', value: formatReportDate(report.incident_date, timeZone) },
        { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
      ],
      sections: [
        {
          title: 'Incident Information',
          fields: [
            { label: 'Site Location', value: report.location },
            { label: 'Specific Location', value: report.specific_location },
            { label: 'Incident Type', value: String(report.incident_type || '').replaceAll('_', ' ').toUpperCase() },
            { label: 'Severity', value: String(report.severity || '').toUpperCase() },
            { label: `Time Occurred (${zoneLabel})`, value: formatReportClock(report.incident_time) },
            { label: `Time Discovered (${zoneLabel})`, value: formatReportClock(report.discovered_time) },
            { label: 'Linked CAD Call', value: report.linked_call_number, wide: true },
            { label: 'Linked BOLO', value: report.linked_bolo_number, wide: true },
          ],
        },
        {
          title: 'Incident Narrative',
          fields: [
            { label: 'Description', value: report.description, wide: true },
            { label: 'Action Taken', value: report.action_taken, wide: true },
          ],
        },
        {
          title: 'People and Vehicle Information',
          fields: [
            { label: 'Structured People', value: people, wide: true },
            { label: 'Persons Involved', value: report.persons_involved, wide: true },
            { label: 'Victims', value: report.victims },
            { label: 'Witnesses', value: report.witnesses },
            { label: 'Suspect Description', value: report.suspect_description },
            { label: 'Suspect Vehicle', value: report.suspect_vehicle },
          ],
        },
        {
          title: 'Injuries and Property',
          fields: [
            { label: 'Injuries Reported', value: report.injuries_reported ? 'Yes' : 'No' },
            { label: 'Property Damage', value: report.property_damage ? 'Yes' : 'No' },
            { label: 'Injury Details', value: report.injury_details, wide: true },
            { label: 'Damage Details', value: report.damage_details, wide: true },
            { label: 'Estimated Value', value: report.estimated_value },
          ],
        },
        {
          title: 'Emergency Response',
          fields: [
            { label: 'Police Notified', value: report.police_notified ? 'Yes' : 'No' },
            { label: 'Police Report Number', value: report.police_report_number },
            { label: 'EMS Notified', value: report.ems_notified ? 'Yes' : 'No' },
            { label: 'Fire Notified', value: report.fire_notified ? 'Yes' : 'No' },
          ],
        },
      ],
      photos: report.photo_url ? [report.photo_url] : [],
      officer: {
        name: officerName,
        signatureName: getOfficerSignature(report.created_by_id),
        email: getOfficerEmail(report.created_by_id),
        badge: creator?.badge_number || '',
        unit: creator?.unit_number || '',
        ip: report.officer_ip_address || '',
      },
      signedAt: report.officer_signed_at || report.created_date,
      signatureUrl: report.officer_signature_url || report.signature_url || '',
      footerNote: 'DCJS: 11-30423.',
    });
  };

  const legacyPrintReport = (report) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const officerName = getOfficerFullName(report.created_by_id);
    const officerSig = getOfficerSignature(report.created_by_id);
    
    // Convert to Zulu time
    const toZulu = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
    };
    
    const incidentDate = report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : '';
    const incidentTimeZulu = report.incident_time ? report.incident_time + 'Z' : '';
    const discoveredTimeZulu = report.discovered_time ? report.discovered_time + 'Z' : '';
    const submittedZulu = report.created_date ? toZulu(report.created_date) : 'N/A';
    
    // HTML-escape user-controlled fields before interpolating into the print template
    // to prevent stored XSS via document.write().
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const e = {
      report_number: esc(report.report_number || 'N/A'),
      call_number: esc(report.call_number || 'N/A'),
      severity: esc(report.severity),
      severityClass: esc(report.severity),
      location: esc(report.location),
      specific_location: esc(report.specific_location),
      incident_type: esc(report.incident_type?.replace(/_/g, ' ').toUpperCase()),
      description: esc(report.description),
      suspect_description: esc(report.suspect_description),
      suspect_vehicle: esc(report.suspect_vehicle),
      victims: esc(report.victims),
      persons_involved: esc(report.persons_involved),
      witnesses: esc(report.witnesses),
      injury_details: esc(report.injury_details),
      damage_details: esc(report.damage_details),
      estimated_value: esc(report.estimated_value),
      action_taken: esc(report.action_taken),
      police_report_number: esc(report.police_report_number),
      photo_url: esc(report.photo_url),
      officer_ip_address: esc(report.officer_ip_address),
      created_by: esc(getOfficerEmail(report.created_by_id)),
      officer_name: esc(officerName),
      officer_sig: esc(officerSig),
    };
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Incident Report - ${report.report_number || 'VIR'}</title>
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
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover { background: #b91c1c; }
          
          .report-container { border: 3px solid #dc2626; border-radius: 8px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 20px; text-align: center; }
          .logo { width: 60px; height: 60px; object-fit: contain; margin: 0 auto 10px; background: white; border-radius: 8px; padding: 5px; }
          .title { font-size: 20pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; }
          .subtitle { font-size: 12pt; font-weight: 500; opacity: 0.95; }
          .dcjs { font-size: 8pt; margin-top: 8px; opacity: 0.9; }
          
          .meta-bar { background: #fef2f2; padding: 12px 20px; border-bottom: 2px solid #fecaca; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .meta-item { font-size: 8.5pt; }
          .meta-label { font-weight: 600; color: #991b1b; display: block; }
          .meta-value { color: #1e293b; }
          
          .severity-banner { padding: 10px; text-align: center; font-weight: bold; font-size: 11pt; }
          .severity-critical { background: #fee2e2; color: #991b1b; border: 2px solid #dc2626; }
          .severity-high { background: #fed7aa; color: #9a3412; border: 2px solid #ea580c; }
          .severity-medium { background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; }
          .severity-low { background: #dbeafe; color: #1e40af; border: 2px solid #3b82f6; }
          
          .content { padding: 20px; }
          .section { margin-bottom: 18px; }
          .section-title { background: #fee2e2; color: #dc2626; font-weight: bold; font-size: 10pt; padding: 6px 10px; border-left: 4px solid #dc2626; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; margin: 8px 0; }
          .field-label { font-size: 8pt; font-weight: 600; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
          .field-value { color: #1e293b; font-size: 9.5pt; white-space: pre-wrap; line-height: 1.5; }
          
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          
          .signature-section { margin-top: 25px; padding: 15px; background: #f8fafc; border-radius: 6px; }
          .sig-line { border-bottom: 2px solid #dc2626; min-height: 40px; margin: 8px 0; font-family: 'Brush Script MT', cursive; font-size: 18pt; padding: 5px; color: #dc2626; }
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
            <div class="title">INCIDENT REPORT</div>
            <div class="subtitle">Security Incident Documentation</div>
          </div>
          
          <div class="meta-bar">
            <div class="meta-item">
              <span class="meta-label">Report #</span>
              <span class="meta-value">${e.report_number}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Call #</span>
              <span class="meta-value">${e.call_number}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Submitted (Zulu)</span>
              <span class="meta-value">${submittedZulu}</span>
            </div>
          </div>

          <div class="severity-banner severity-${e.severityClass}">
            SEVERITY: ${e.severity} ${report.severity === 'critical' ? '🚨' : ''}
          </div>
          
          <div class="content">
            <div class="section">
              <div class="section-title">Incident Information</div>
              <div class="grid-2">
                <div class="field-box">
                  <div class="field-label">Date of Incident</div>
                  <div class="field-value">${incidentDate}</div>
                </div>
                <div class="field-box">
                  <div class="field-label">Time Occurred (Zulu)</div>
                  <div class="field-value">${incidentTimeZulu}</div>
                </div>
              </div>
              ${report.discovered_time ? `
              <div class="field-box">
                <div class="field-label">Time Discovered (Zulu)</div>
                <div class="field-value">${discoveredTimeZulu}</div>
              </div>
              ` : ''}
              <div class="grid-2">
                <div class="field-box">
                  <div class="field-label">Site Location</div>
                  <div class="field-value">${e.location}</div>
                </div>
                ${report.specific_location ? `
                <div class="field-box">
                  <div class="field-label">Specific Location</div>
                  <div class="field-value">${e.specific_location}</div>
                </div>
                ` : ''}
              </div>
              <div class="field-box">
                <div class="field-label">Incident Type</div>
                <div class="field-value">${e.incident_type}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Incident Description</div>
              <div class="field-box">
                <div class="field-value">${e.description}</div>
              </div>
            </div>

            ${report.suspect_description || report.suspect_vehicle ? `
            <div class="section">
              <div class="section-title">Suspect Information</div>
              ${report.suspect_description ? `
              <div class="field-box">
                <div class="field-label">Suspect Description</div>
                <div class="field-value">${e.suspect_description}</div>
              </div>
              ` : ''}
              ${report.suspect_vehicle ? `
              <div class="field-box">
                <div class="field-label">Suspect Vehicle</div>
                <div class="field-value">${e.suspect_vehicle}</div>
              </div>
              ` : ''}
            </div>
            ` : ''}

            ${report.victims || report.persons_involved || report.witnesses ? `
            <div class="section">
              <div class="section-title">Persons Information</div>
              ${report.victims ? `
              <div class="field-box">
                <div class="field-label">Victim(s)</div>
                <div class="field-value">${e.victims}</div>
              </div>
              ` : ''}
              ${report.persons_involved ? `
              <div class="field-box">
                <div class="field-label">Other Persons Involved</div>
                <div class="field-value">${e.persons_involved}</div>
              </div>
              ` : ''}
              ${report.witnesses ? `
              <div class="field-box">
                <div class="field-label">Witnesses</div>
                <div class="field-value">${e.witnesses}</div>
              </div>
              ` : ''}
            </div>
            ` : ''}

            ${report.injuries_reported || report.property_damage ? `
            <div class="section">
              <div class="section-title">Damage & Injuries</div>
              ${report.injuries_reported && report.injury_details ? `
              <div class="field-box">
                <div class="field-label">⚠️ Injuries Reported</div>
                <div class="field-value">${e.injury_details}</div>
              </div>
              ` : ''}
              ${report.property_damage && report.damage_details ? `
              <div class="field-box">
                <div class="field-label">Property Damage</div>
                <div class="field-value">${e.damage_details}</div>
              </div>
              ${report.estimated_value ? `
              <div class="field-box">
                <div class="field-label">Estimated Value</div>
                <div class="field-value">$${e.estimated_value}</div>
              </div>
              ` : ''}
              ` : ''}
            </div>
            ` : ''}

            ${report.action_taken ? `
            <div class="section">
              <div class="section-title">Action Taken</div>
              <div class="field-box">
                <div class="field-value">${e.action_taken}</div>
              </div>
            </div>
            ` : ''}

            <div class="section">
              <div class="section-title">Emergency Services Notification</div>
              <div class="grid-2">
                <div class="field-box">
                  <div class="field-label">Police</div>
                  <div class="field-value">${report.police_notified ? '✓ YES' : '✗ NO'}${report.police_report_number ? ` - Report #${e.police_report_number}` : ''}</div>
                </div>
                <div class="field-box">
                  <div class="field-label">EMS</div>
                  <div class="field-value">${report.ems_notified ? '✓ YES' : '✗ NO'}</div>
                </div>
                <div class="field-box">
                  <div class="field-label">Fire Department</div>
                  <div class="field-value">${report.fire_notified ? '✓ YES' : '✗ NO'}</div>
                </div>
              </div>
            </div>

            ${report.photo_url ? `
            <div class="photo-section">
              <div class="section-title">Photo Evidence</div>
              <img src="${e.photo_url}" alt="Incident scene" />
            </div>
            ` : ''}
            
            <div class="signature-section">
              <div class="field-label">Reporting Officer Signature</div>
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

  if (reportsLoading) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-600">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Incident Reports</h1>
            <p className="text-sm md:text-base text-slate-600">Document and track incidents</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-red-600 hover:bg-red-700 w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Incident
          </Button>
        </div>

        {!canSubmit && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You must be clocked in to submit an incident report. Please clock in at your assigned location first.
            </AlertDescription>
          </Alert>
        )}

        {showForm && canSubmit && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
              <CardTitle className="flex items-center gap-2">
                {editingReportId ? (
                  <>
                    <Pencil className="w-5 h-5 text-red-600" />
                    Edit Incident Report
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    New Incident Report
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="incident_date">Date of Incident *</Label>
                    <Input
                      id="incident_date"
                      type="date"
                      value={formData.incident_date}
                      onChange={(e) => setFormData({...formData, incident_date: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="incident_time">Time Occurred *</Label>
                    <Input
                      id="incident_time"
                      type="time"
                      value={formData.incident_time}
                      onChange={(e) => setFormData({...formData, incident_time: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discovered_time">Time Discovered</Label>
                    <Input
                      id="discovered_time"
                      type="time"
                      value={formData.discovered_time}
                      onChange={(e) => setFormData({...formData, discovered_time: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Link to Call for Service (active + history)</Label>
                    <CallLinkCombobox
                      calls={activeDispatchCalls}
                      value={formData.linked_call_id || ''}
                      onSelect={selectDispatchCall}
                      placeholder="Search active or cleared calls by CAD number…"
                    />
                    {formData.linked_call_id && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="rounded-md border bg-slate-50 p-3 text-sm">
                          <strong>CAD:</strong> {formData.linked_call_number} · <strong>Primary:</strong> {formData.primary_officer_name || 'Assigned unit pending'}
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => selectDispatchCall('none')} className="h-8 px-2 text-xs text-slate-500 hover:text-red-500">
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Attach Active BOLO</Label>
                    <Select value={formData.linked_bolo_id || 'none'} onValueChange={selectBolo}>
                      <SelectTrigger><SelectValue placeholder="Select an active BOLO" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No linked BOLO</SelectItem>
                        {activeBolos.map(bolo => (
                          <SelectItem key={bolo.id} value={bolo.id}>
                            {bolo.bolo_number || bolo.id.slice(-8)} — {bolo.title} {bolo.subject_name ? `— ${bolo.subject_name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.linked_bolo_id && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        <strong>BOLO:</strong> {formData.linked_bolo_number}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Site Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
                      required
                    >
                      <SelectTrigger id="location">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentSiteName && !locations?.some(loc => loc.site_name === currentSiteName) && (
                          <SelectItem value={currentSiteName}>{currentSiteName}</SelectItem>
                        )}
                        {locations?.map(loc => (
                          <SelectItem key={loc.id} value={loc.site_name}>
                            {loc.site_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specific_location">Specific Location</Label>
                    <Input
                      id="specific_location"
                      placeholder="Building, floor, unit number..."
                      value={formData.specific_location}
                      onChange={(e) => setFormData({...formData, specific_location: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="incident_type">Incident Type *</Label>
                    <Select
                      value={formData.incident_type}
                      onValueChange={(value) => setFormData({...formData, incident_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="theft">Theft</SelectItem>
                        <SelectItem value="vandalism">Vandalism</SelectItem>
                        <SelectItem value="assault">Assault</SelectItem>
                        <SelectItem value="trespassing">Trespassing</SelectItem>
                        <SelectItem value="medical">Medical Emergency</SelectItem>
                        <SelectItem value="fire">Fire</SelectItem>
                        <SelectItem value="shooting">Shooting</SelectItem>
                        <SelectItem value="vehicle_pursuit">Vehicle Pursuit</SelectItem>
                        <SelectItem value="property_damage">Property Damage</SelectItem>
                        <SelectItem value="disturbance">Disturbance</SelectItem>
                        <SelectItem value="suspicious_activity">Suspicious Activity</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="severity">Severity *</Label>
                    <Select
                      value={formData.severity}
                      onValueChange={(value) => setFormData({...formData, severity: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Incident Description *</Label>
                    <ReportAIEnhancer
                      text={formData.description}
                      onEnhanced={(enhanced) => setFormData({...formData, description: enhanced})}
                      fieldName="incident description"
                    />
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Detailed description of the incident..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    required
                    rows={6}
                  />
                </div>
                <StructuredPeopleEditor
                  title="Persons Involved"
                  value={formData.persons || []}
                  defaultRole="Suspect"
                  allowedRoles={['Suspect','Victim','Witness','Complainant','Reporting Party','Other']}
                  onChange={(persons) => {
                    const describe = (p) => [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') + (p.description ? ` — ${p.description}` : '');
                    setFormData({
                      ...formData,
                      persons,
                      suspect_description: persons.filter(p => p.role === 'Suspect').map(describe).join('\n'),
                      victims: persons.filter(p => p.role === 'Victim').map(describe).join('\n'),
                      witnesses: persons.filter(p => p.role === 'Witness').map(describe).join('\n'),
                      persons_involved: persons.filter(p => !['Suspect','Victim','Witness'].includes(p.role)).map(describe).join('\n'),
                    });
                  }}
                />

                <div className="space-y-2">
                  <Label htmlFor="suspect_vehicle">Suspect / Involved Vehicle</Label>
                  <Input
                    id="suspect_vehicle"
                    placeholder="Make, model, color, license plate..."
                    value={formData.suspect_vehicle}
                    onChange={(e) => setFormData({...formData, suspect_vehicle: e.target.value})}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="injuries_reported"
                      checked={formData.injuries_reported}
                      onCheckedChange={(checked) => setFormData({...formData, injuries_reported: checked})}
                    />
                    <Label htmlFor="injuries_reported" className="cursor-pointer">
                      Injuries reported
                    </Label>
                  </div>

                  {formData.injuries_reported && (
                    <Textarea
                      placeholder="Describe injuries..."
                      value={formData.injury_details}
                      onChange={(e) => setFormData({...formData, injury_details: e.target.value})}
                      rows={2}
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="property_damage"
                      checked={formData.property_damage}
                      onCheckedChange={(checked) => setFormData({...formData, property_damage: checked})}
                    />
                    <Label htmlFor="property_damage" className="cursor-pointer">
                      Property damage occurred
                    </Label>
                  </div>

                  {formData.property_damage && (
                    <div className="space-y-3">
                      <Textarea
                        placeholder="Describe property damage..."
                        value={formData.damage_details}
                        onChange={(e) => setFormData({...formData, damage_details: e.target.value})}
                        rows={2}
                      />
                      <Input
                        placeholder="Estimated value of damage/loss"
                        value={formData.estimated_value}
                        onChange={(e) => setFormData({...formData, estimated_value: e.target.value})}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="action_taken">Action Taken</Label>
                    <ReportAIEnhancer
                      text={formData.action_taken}
                      onEnhanced={(enhanced) => setFormData({...formData, action_taken: enhanced})}
                      fieldName="action taken"
                    />
                  </div>
                  <Textarea
                    id="action_taken"
                    placeholder="Actions taken by officer..."
                    value={formData.action_taken}
                    onChange={(e) => setFormData({...formData, action_taken: e.target.value})}
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
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="police_notified"
                      checked={formData.police_notified}
                      onCheckedChange={(checked) => setFormData({...formData, police_notified: checked})}
                    />
                    <Label htmlFor="police_notified" className="cursor-pointer">
                      Police notified
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ems_notified"
                      checked={formData.ems_notified}
                      onCheckedChange={(checked) => setFormData({...formData, ems_notified: checked})}
                    />
                    <Label htmlFor="ems_notified" className="cursor-pointer">
                      EMS notified
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fire_notified"
                      checked={formData.fire_notified}
                      onCheckedChange={(checked) => setFormData({...formData, fire_notified: checked})}
                    />
                    <Label htmlFor="fire_notified" className="cursor-pointer">
                      Fire Dept notified
                    </Label>
                  </div>
                </div>

                {formData.police_notified && (
                  <div className="space-y-2">
                    <Label htmlFor="police_report_number">Police Report Number</Label>
                    <Input
                      id="police_report_number"
                      placeholder="Enter police department report number"
                      value={formData.police_report_number}
                      onChange={(e) => setFormData({...formData, police_report_number: e.target.value})}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveAsDraft}
                    disabled={saving || uploading || saveReportMutation.isPending}
                    className="bg-slate-50"
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  <RequiredAIReportReview />
                  <Button
                    type="submit"
                    disabled={saveReportMutation.isPending || uploading || saving}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {saveReportMutation.isPending ? 'Submitting...' : (editingReportId ? 'Update Report' : 'Submit Report')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Add Drafts section before incident history */}
        {draftReports.length > 0 && (
          <Card className="border-l-4 border-l-amber-600 shadow-lg bg-amber-50">
            <CardHeader>
              <CardTitle className="text-amber-900">My Draft Reports ({draftReports.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {draftReports.map((report) => (
                <div key={report.id} className="p-4 bg-white rounded-lg border-2 border-amber-300">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge className="bg-amber-600 text-white mb-2">DRAFT</Badge>
                      <p className="font-semibold text-slate-900">
                        {report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : 'Date N/A'} at {report.location}
                      </p>
                      <p className="text-sm text-slate-600 mt-1">{report.incident_type.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleEditReport(report)}
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
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
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>
              {currentSiteName
                ? `Incident History at ${currentSiteName} (${submittedReports.length})`
                : (isAdmin ? `All Incident History (${submittedReports.length})` : 'Incident History (Clock in to view site reports)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentSiteName && !isAdmin && submittedReports.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 text-lg">Clock in to a site to view incident reports</p>
                <p className="text-slate-500 text-sm mt-2">You'll see all reports filed at your current site</p>
              </div>
            ) : (
              <div className="space-y-4">
                {submittedReports.map((report) => (
                  <div key={report.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
                          <div className="flex flex-wrap gap-2">
                            {report.report_number && (
                              <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 font-mono">
                                {report.report_number}
                              </Badge>
                            )}
                            {report.call_number && (
                              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 font-mono">
                                {report.call_number}
                              </Badge>
                            )}
                            <Badge variant="outline" className={severityColors[report.severity]}>
                              {report.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">
                              {report.incident_type.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {report.police_notified && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                Police Notified {report.police_report_number && `(#${report.police_report_number})`}
                              </Badge>
                            )}
                            {report.status === 'rejected' && (
                              <Badge className="bg-red-100 text-red-800 border-red-200">
                                REJECTED
                              </Badge>
                            )}
                            {report.status === 'pending' && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                PENDING
                              </Badge>
                            )}
                            {report.status === 'approved' && (
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                APPROVED
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="font-semibold text-slate-900 mb-1">
                          Date of Incident: {report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : 'Date N/A'}
                        </p>
                        <p className="text-sm text-slate-600">
                          Time of Incident: {report.incident_time || 'N/A'}
                        </p>
                        <p className="text-sm text-slate-600">Location: {report.location}</p>
                        <p className="text-sm text-slate-600">Reporting Officer: {getOfficerSignature(report.created_by_id)}</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 mb-3">{report.description}</p>
                    {report.photo_url && (
                      <img
                        src={report.photo_url}
                        alt="Incident"
                        className="w-full max-w-md rounded-lg border border-slate-200 mb-3 object-cover max-h-64"
                      />
                    )}
                    {report.action_taken && (
                      <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                        <p className="text-xs text-slate-500 font-medium mb-1">Action Taken:</p>
                        <p className="text-sm text-slate-700">{report.action_taken}</p>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                        {String(report.created_by_id || '') === String(user?.id || '') && report.status !== 'approved' && (
                            <Button
                            onClick={() => handleEditReport(report)}
                            size="sm"
                            variant="outline"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit Report
                            </Button>
                        )}
                        <Button
                            onClick={() => printReport(report)}
                            size="sm"
                            variant="outline"
                            className="text-blue-700 border-blue-300 hover:bg-blue-50"
                        >
                            <Printer className="w-4 h-4 mr-1" />
                            Print Report
                        </Button>
                    </div>

                    <div className="mt-4 pt-4 border-t-2 border-slate-300">
                      <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                      <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                        {getOfficerSignature(report.created_by_id)}
                      </p>
                      {report.officer_ip_address && (
                        <p className="text-xs text-slate-400 mt-1">
                          IP: {report.officer_ip_address} | Signed: {formatReportDateTime(report.created_date, resolveReportTimeZone(locations?.find(location => location.site_name === report.location)))}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                      <span>•</span>
                      <span>Richmond, VA</span>
                      <span>•</span>
                      <span>Reported by ${getOfficerEmail(report.created_by_id) || 'N/A'}</span>
                    </div>
                  </div>
                ))}
                {submittedReports.length === 0 && draftReports.length === 0 && (
                  <p className="text-center text-slate-500 py-8">
                    {currentSiteName ? `No submitted incident reports for ${currentSiteName} yet` : 'No submitted incident reports yet'}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}