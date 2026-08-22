import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, Plus, Clock, Pencil, Printer } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import RequiredAIReportReview from '@/components/reports/RequiredAIReportReview';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';
import {
  formatReportDateTime,
  openBlackPointReport,
  resolveReportTimeZone,
} from '@/lib/reportPrint';

export default function MaintenanceReports() {
  const [showForm, setShowForm] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [formData, setFormData] = useState({
    report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
    location: "",
    specific_location: "",
    issue_type: "other",
    description: "",
    affected_area: "",
    safety_concern: false,
    requires_immediate_attention: false,
    tenant_affected: "",
    priority: "medium",
    photo_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

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

  // Get current site name from active entry
  const currentSiteName = activeEntry?.location ? activeEntry.location.split(' - ')[0] : null;

  // Get ALL maintenance reports from all officers
  const { data: allReports } = useQuery({
    queryKey: ['allMaintenanceReports'],
    queryFn: () => base44.entities.MaintenanceReport.list('-created_date'),
    enabled: !!user,
    initialData: [], // Provide initial empty array
  });

  // Filter reports by current site
  const reportsToDisplay = React.useMemo(() => {
    if (!currentSiteName || !allReports) return [];
    return allReports.filter(report => report.location === currentSiteName);
  }, [currentSiteName, allReports]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'], // Changed query key to reflect filtering
    queryFn: async () => {
      const allLocations = await listDirectoryLocations('site_name');
      return allLocations.filter(loc => loc.active !== false); // Filter for active locations
    },
    initialData: [], // Provide initial empty array
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [], // Provide initial empty array
  });

  // Auto-select location when officer is clocked in, but not when editing
  useEffect(() => {
    if (!editingReportId && activeEntry?.location && locations) {
      // The activeEntry.location string format is "Site Name - Location Details"
      const siteName = activeEntry.location.split(' - ')[0];
      const matchingLocation = locations.find(loc => loc.site_name === siteName);
      if (matchingLocation) {
        setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
      }
    }
  }, [activeEntry, locations, editingReportId]); // Re-run when activeEntry, locations data, or editingReportId changes

  const createReportMutation = useMutation({
    mutationFn: async (data) => {
      // Get officer's IP address
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      const report = await base44.entities.MaintenanceReport.create({
        ...data,
        officer_ip_address: ipAddress,
      });
      
      // Note: Cannot send emails to external site contacts due to platform limitations
      
      return report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMaintenanceReports'] }); // Changed from 'maintenanceReports'
      setShowForm(false);
      setEditingReportId(null); // Reset editing state
      setFormData({
        report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
        location: "",
        specific_location: "",
        issue_type: "other",
        description: "",
        affected_area: "",
        safety_concern: false,
        requires_immediate_attention: false,
        tenant_affected: "",
        priority: "medium",
        photo_url: "",
      });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // Get officer's IP address
      let ipAddress = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        ipAddress = ipData.ip;
      } catch (error) {
        console.error('Failed to get IP address:', error);
      }

      // When resubmitting a rejected report, its status should be set back to 'reported'
      const updatedData = { 
        ...data, 
        status: 'reported',
        officer_ip_address: ipAddress,
      };
      return await base44.entities.MaintenanceReport.update(id, updatedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allMaintenanceReports'] });
      setShowForm(false);
      setEditingReportId(null); // Reset editing state
      setFormData({
        report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
        location: "",
        issue_type: "other",
        description: "",
        priority: "medium",
        photo_url: "",
      });
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, photo_url: file_url });
    } catch (error) {
      console.error("Error uploading file:", error);
    }
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingReportId) {
      updateReportMutation.mutate({ id: editingReportId, data: formData });
    } else {
      createReportMutation.mutate(formData);
    }
  };

  const editReport = (report) => {
    setEditingReportId(report.id);
    setShowForm(true);
    setFormData({
      report_date: new Date(report.report_date).toISOString(),
      location: report.location,
      specific_location: report.specific_location || "",
      issue_type: report.issue_type,
      description: report.description,
      affected_area: report.affected_area || "",
      safety_concern: report.safety_concern || false,
      requires_immediate_attention: report.requires_immediate_attention || false,
      tenant_affected: report.tenant_affected || "",
      priority: report.priority,
      photo_url: report.photo_url || "",
    });
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 border-blue-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    urgent: "bg-red-100 text-red-800 border-red-200",
  };

  const statusColors = {
    reported: "bg-slate-100 text-slate-800 border-slate-200",
    in_progress: "bg-blue-100 text-blue-800 border-blue-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200", // Added rejected status color
  };

  const getOfficerSignature = (officerRef) => {
    const officer = allUsers?.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
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

  const printReport = (report) => {
    const locationRecord = locations?.find(location => location.site_name === report.location);
    const timeZone = resolveReportTimeZone(locationRecord);
    const creator = allUsers?.find(officer => String(officer.id) === String(report.created_by_id)
      || String(officer.email || '').toLowerCase() === String(report.created_by_id || '').toLowerCase());
    const officerName = creator
      ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') || creator.email
      : getOfficerSignature(report.created_by_id);

    openBlackPointReport({
      title: 'Maintenance Report',
      subtitle: 'Property Condition and Safety Documentation',
      reportNumber: report.report_number || report.id || '',
      status: report.status || report.priority || '',
      timeZone,
      meta: [
        { label: 'Priority', value: String(report.priority || '').toUpperCase() },
        { label: 'Reported', value: formatReportDateTime(report.report_date || report.created_date, timeZone) },
        { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
      ],
      sections: [
        {
          title: 'Location and Issue',
          fields: [
            { label: 'Site Location', value: report.location },
            { label: 'Specific Location', value: report.specific_location },
            { label: 'Issue Type', value: String(report.issue_type || '').replaceAll('_', ' ').toUpperCase() },
            { label: 'Affected Area', value: report.affected_area },
            { label: 'Description', value: report.description, wide: true },
            { label: 'Linked CAD Call', value: report.linked_call_number, wide: true },
          ],
        },
        {
          title: 'Impact and Safety',
          fields: [
            { label: 'Safety Concern', value: report.safety_concern ? 'Yes' : 'No' },
            { label: 'Immediate Attention Required', value: report.requires_immediate_attention ? 'Yes' : 'No' },
            { label: 'Tenant / Area Affected', value: report.tenant_affected, wide: true },
            { label: 'Administrative Notes', value: report.admin_notes, wide: true },
          ],
        },
      ],
      photos: report.photo_url ? [report.photo_url] : [],
      officer: {
        name: officerName,
        signatureName: getOfficerSignature(report.created_by_id),
        email: creator?.email || '',
        badge: creator?.badge_number || '',
        unit: creator?.unit_number || '',
        ip: report.officer_ip_address || '',
      },
      signedAt: report.officer_signed_at || report.created_date,
      signatureUrl: report.officer_signature_url || report.signature_url || '',
      footerNote: 'DCJS License 11-5175.',
    });
  };

  const legacyPrintReport = (report) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const reportDate = report.report_date ? format(new Date(report.report_date), 'MMMM d, yyyy h:mm a') : '';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Maintenance Report - ${report.location}</title>
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
            background: #475569;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 9999;
          }
          .back-button:hover { background: #334155; }
          
          .report-container { border: 3px solid #64748b; border-radius: 8px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #475569 0%, #64748b 100%); color: white; padding: 20px; text-align: center; }
          .logo { width: 60px; height: 60px; object-fit: contain; margin: 0 auto 10px; background: white; border-radius: 8px; padding: 5px; }
          .title { font-size: 20pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; }
          .subtitle { font-size: 12pt; font-weight: 500; opacity: 0.95; }
          .dcjs { font-size: 8pt; margin-top: 8px; opacity: 0.9; }
          
          .meta-bar { background: #f8fafc; padding: 12px 20px; border-bottom: 2px solid #e2e8f0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .meta-item { font-size: 8.5pt; }
          .meta-label { font-weight: 600; color: #475569; display: block; }
          .meta-value { color: #1e293b; }
          
          .priority-banner { padding: 10px; text-align: center; font-weight: bold; font-size: 11pt; }
          .priority-urgent { background: #fee2e2; color: #991b1b; border: 2px solid #dc2626; }
          .priority-high { background: #fed7aa; color: #9a3412; border: 2px solid #ea580c; }
          .priority-medium { background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; }
          .priority-low { background: #dbeafe; color: #1e40af; border: 2px solid #3b82f6; }
          
          .content { padding: 20px; }
          .section { margin-bottom: 18px; }
          .section-title { background: #f1f5f9; color: #475569; font-weight: bold; font-size: 10pt; padding: 6px 10px; border-left: 4px solid #64748b; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; margin: 8px 0; }
          .field-label { font-size: 8pt; font-weight: 600; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
          .field-value { color: #1e293b; font-size: 9.5pt; white-space: pre-wrap; line-height: 1.5; }
          
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          
          .alert-box { background: #fef3c7; border: 2px solid #f59e0b; padding: 10px; border-radius: 4px; margin: 10px 0; }
          .alert-box strong { color: #92400e; }
          
          .signature-section { margin-top: 25px; padding: 15px; background: #f8fafc; border-radius: 6px; }
          .sig-line { border-bottom: 2px solid #64748b; min-height: 40px; margin: 8px 0; font-family: 'Brush Script MT', cursive; font-size: 18pt; padding: 5px; color: #475569; }
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
            <div class="title">MAINTENANCE REPORT</div>
            <div class="subtitle">Facility Maintenance Request</div>
          </div>
          
          <div class="meta-bar">
            <div class="meta-item">
              <span class="meta-label">Report Date</span>
              <span class="meta-value">${reportDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Issue Type</span>
              <span class="meta-value">${report.issue_type?.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Status</span>
              <span class="meta-value">${report.status?.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
          </div>

          <div class="priority-banner priority-${report.priority}">
            PRIORITY: ${report.priority?.toUpperCase()} ${report.requires_immediate_attention ? '⚠️ IMMEDIATE ATTENTION REQUIRED' : ''}
          </div>
          
          <div class="content">
            ${report.safety_concern || report.requires_immediate_attention ? `
            <div class="alert-box">
              <strong>⚠️ ALERT:</strong>
              ${report.safety_concern ? ' SAFETY CONCERN' : ''}
              ${report.safety_concern && report.requires_immediate_attention ? ' |' : ''}
              ${report.requires_immediate_attention ? ' REQUIRES IMMEDIATE ATTENTION' : ''}
            </div>
            ` : ''}

            <div class="section">
              <div class="section-title">Location Information</div>
              <div class="field-box">
                <div class="field-label">Site Location</div>
                <div class="field-value">${report.location}</div>
              </div>
              ${report.specific_location ? `
              <div class="field-box">
                <div class="field-label">Specific Location</div>
                <div class="field-value">${report.specific_location}</div>
              </div>
              ` : ''}
              ${report.affected_area ? `
              <div class="field-box">
                <div class="field-label">Affected Area/Scope</div>
                <div class="field-value">${report.affected_area}</div>
              </div>
              ` : ''}
              ${report.tenant_affected ? `
              <div class="field-box">
                <div class="field-label">Tenant/Unit Affected</div>
                <div class="field-value">${report.tenant_affected}</div>
              </div>
              ` : ''}
            </div>

            <div class="section">
              <div class="section-title">Issue Details</div>
              <div class="field-box">
                <div class="field-value">${report.description}</div>
              </div>
            </div>

            ${report.photo_url ? `
            <div class="photo-section">
              <div class="section-title">Photo Documentation</div>
              <img src="${report.photo_url}" alt="Maintenance issue" />
            </div>
            ` : ''}
            
            <div class="signature-section">
              <div class="field-label">Reporting Officer Signature</div>
              <div class="sig-line"></div>
              <div class="sig-details">Date: ____________________</div>
            </div>
          </div>
          
          <div class="footer">
            <div style="margin-top: 3px;">For Property Management Use Only</div>
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

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Maintenance Reports</h1>
            <p className="text-slate-600">Report and track maintenance issues</p>
          </div>
          <Button
            onClick={() => {
              if (showForm) { // If closing the form
                setEditingReportId(null);
                setFormData({
                    report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                    location: "",
                    specific_location: "",
                    issue_type: "other",
                    description: "",
                    affected_area: "",
                    safety_concern: false,
                    requires_immediate_attention: false,
                    tenant_affected: "",
                    priority: "medium",
                    photo_url: "",
                });
              } else { // If opening the form
                setEditingReportId(null); // Ensure not in editing mode when starting a new report
                setFormData({
                    report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                    location: "",
                    specific_location: "",
                    issue_type: "other",
                    description: "",
                    affected_area: "",
                    safety_concern: false,
                    requires_immediate_attention: false,
                    tenant_affected: "",
                    priority: "medium",
                    photo_url: "",
                });
                // Attempt to pre-fill location if user is clocked in
                if (activeEntry?.location && locations) {
                  const siteName = activeEntry.location.split(' - ')[0];
                  const matchingLocation = locations.find(loc => loc.site_name === siteName);
                  if (matchingLocation) {
                    setFormData(prev => ({ ...prev, location: matchingLocation.site_name }));
                  }
                }
              }
              setShowForm(!showForm);
            }}
            className="bg-slate-700 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-slate-700" />
                {editingReportId ? 'Edit Maintenance Report' : 'New Maintenance Report'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <ActiveCallLinkField formData={formData} setFormData={setFormData} />
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="report_date">Date & Time *</Label>
                    <Input
                      id="report_date"
                      type="datetime-local"
                      value={formData.report_date.slice(0, 16)}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const newDate = new Date(dateValue);
                          if (!isNaN(newDate.getTime())) {
                            setFormData({...formData, report_date: newDate.toISOString()});
                          }
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Site Location *</Label>
                    <Select
                      value={formData.location}
                      onValueChange={(value) => setFormData({...formData, location: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(loc => (
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
                      placeholder="Building, floor, room number..."
                      value={formData.specific_location}
                      onChange={(e) => setFormData({...formData, specific_location: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="issue_type">Issue Type *</Label>
                    <Select
                      value={formData.issue_type}
                      onValueChange={(value) => setFormData({...formData, issue_type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lighting">Lighting</SelectItem>
                        <SelectItem value="lock_door">Lock/Door</SelectItem>
                        <SelectItem value="hvac">HVAC</SelectItem>
                        <SelectItem value="plumbing">Plumbing</SelectItem>
                        <SelectItem value="electrical">Electrical</SelectItem>
                        <SelectItem value="structural">Structural</SelectItem>
                        <SelectItem value="safety_hazard">Safety Hazard</SelectItem>
                        <SelectItem value="landscaping">Landscaping</SelectItem>
                        <SelectItem value="parking_lot">Parking Lot</SelectItem>
                        <SelectItem value="elevator">Elevator</SelectItem>
                        <SelectItem value="alarm_system">Alarm System</SelectItem>
                        <SelectItem value="camera_system">Camera System</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority *</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({...formData, priority: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Issue Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the maintenance issue in detail..."
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    required
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="affected_area">Affected Area/Scope</Label>
                  <Input
                    id="affected_area"
                    placeholder="e.g., Entire hallway, 3 units, main entrance..."
                    value={formData.affected_area}
                    onChange={(e) => setFormData({...formData, affected_area: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant_affected">Tenant/Unit Affected</Label>
                  <Input
                    id="tenant_affected"
                    placeholder="Tenant name or unit number..."
                    value={formData.tenant_affected}
                    onChange={(e) => setFormData({...formData, tenant_affected: e.target.value})}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="safety_concern"
                      checked={formData.safety_concern}
                      onCheckedChange={(checked) => setFormData({...formData, safety_concern: checked})}
                    />
                    <Label htmlFor="safety_concern" className="cursor-pointer">
                      Safety concern
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requires_immediate_attention"
                      checked={formData.requires_immediate_attention}
                      onCheckedChange={(checked) => setFormData({...formData, requires_immediate_attention: checked})}
                    />
                    <Label htmlFor="requires_immediate_attention" className="cursor-pointer">
                      Requires immediate attention
                    </Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo">Photo (Optional)</Label>
                  <div className="flex gap-3">
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
                    <div className="mt-2">
                      <img
                        src={formData.photo_url}
                        alt="Issue"
                        className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200"
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        setShowForm(false);
                        setEditingReportId(null); // Reset editing state on cancel
                        setFormData({
                            report_date: new Date().toISOString(),
    linked_call_id: "",
    linked_call_number: "",
    linked_call_type: "",
    linked_call_location: "",
                            location: "",
                            specific_location: "",
                            issue_type: "other",
                            description: "",
                            affected_area: "",
                            safety_concern: false,
                            requires_immediate_attention: false,
                            tenant_affected: "",
                            priority: "medium",
                            photo_url: "",
                        });
                    }}
                  >
                    Cancel
                  </Button>
                  <RequiredAIReportReview />
                  <Button
                    type="submit"
                    disabled={createReportMutation.isPending || updateReportMutation.isPending}
                    className="bg-slate-700 hover:bg-slate-800"
                  >
                    {editingReportId
                      ? (updateReportMutation.isPending ? 'Updating...' : 'Update Report')
                      : (createReportMutation.isPending ? 'Submitting...' : 'Submit Report')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>
              {currentSiteName
                ? `Maintenance Reports at ${currentSiteName} (${reportsToDisplay.length})`
                : 'Maintenance Reports (Clock in to view site reports)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentSiteName ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 text-lg">Clock in to a site to view maintenance reports</p>
                <p className="text-slate-500 text-sm mt-2">You'll see all reports filed at your current site</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reportsToDisplay.map((report) => (
                  <div key={report.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={priorityColors[report.priority]}>
                            {report.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className={statusColors[report.status]}>
                            {report.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="font-semibold text-slate-900 mb-1">
                          {report.issue_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        <p className="text-sm text-slate-600">
                          {report.report_date ? format(new Date(report.report_date), 'MMM d, yyyy h:mm a') : 'Date N/A'} - {report.location}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 mb-3">{report.description}</p>
                    {report.photo_url && (
                      <img
                        src={report.photo_url}
                        alt="Issue"
                        className="w-full max-w-md h-48 object-cover rounded-lg border border-slate-200"
                      />
                    )}
                    
                    <div className="mt-4 pt-4 border-t-2 border-slate-300">
                      <p className="text-xs text-slate-500 mb-2">Officer Signature:</p>
                      <p className="text-2xl font-serif italic text-slate-700" style={{ fontFamily: 'Brush Script MT, cursive' }}>
                        {getOfficerSignature(report.created_by_id)}
                      </p>
                      {report.officer_ip_address && (
                        <p className="text-xs text-slate-400 mt-1">
                          IP: {report.officer_ip_address} | Signed: {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      {report.status === 'rejected' && String(report.created_by_id || '') === String(user?.id || '') && (
                        <Button
                          onClick={() => editReport(report)}
                          size="sm"
                          variant="outline"
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit & Resubmit
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
                ))}
                {reportsToDisplay.length === 0 && (
                  <p className="text-center text-slate-500 py-8">No maintenance reports at {currentSiteName} yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}