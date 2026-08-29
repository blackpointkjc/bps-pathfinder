import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Archive, AlertCircle, User, UserX, Phone, Mail, MessageSquare, Clock, Printer } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


import {
  MobileResponsiveDialog,
  MobileResponsiveDialogContent,
  MobileResponsiveDialogHeader,
  MobileResponsiveDialogTitle,
} from "../components/MobileResponsiveDialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDirectoryUsers } from '@/lib/appDirectory';
import { formatReportDateTime, openBlackPointReport } from '@/lib/reportPrint';

export default function AdminConfidentialReports() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allReports } = useQuery({
    queryKey: ['allConfidentialReports'],
    queryFn: () => base44.entities.ConfidentialReport.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const markViewedMutation = useMutation({
    mutationFn: ({ id, notes, status }) => base44.entities.ConfidentialReport.update(id, {
      viewed: true,
      reviewed_by: user?.email,
      reviewed_date: new Date().toISOString(),
      admin_notes: notes || undefined,
      status: status || undefined
    }),
    onMutate: async ({ id, notes, status }) => {
      // Cancel pending queries
      await queryClient.cancelQueries({ queryKey: ['allConfidentialReports'] });

      // Snapshot the previous state
      const previousReports = queryClient.getQueryData(['allConfidentialReports']);

      // Update UI optimistically
      queryClient.setQueryData(['allConfidentialReports'], (old) => {
        if (!old) return old;
        return old.map((r) => {
          if (r.id === id) {
            return {
              ...r,
              viewed: true,
              reviewed_by: user?.email,
              reviewed_date: new Date().toISOString(),
              admin_notes: notes || r.admin_notes,
              status: status || r.status,
            };
          }
          return r;
        });
      });

      return { previousReports };
    },
    onError: (err, variables, context) => {
      if (context?.previousReports) {
        queryClient.setQueryData(['allConfidentialReports'], context.previousReports);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allConfidentialReports'] });
      setShowDialog(false);
      setSelectedReport(null);
      setAdminNotes("");
      setNewStatus("");
    },
  });

  const archiveReportMutation = useMutation({
    mutationFn: (id) => base44.entities.ConfidentialReport.update(id, {
      archived: true,
      status: 'resolved'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allConfidentialReports'] });
      setShowDialog(false);
      setSelectedReport(null);
    },
  });

  const getAdminName = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Admin';
    const admin = allUsers.find(u => u.email === email);
    if (!admin) return 'Admin';
    if (admin.first_name && admin.last_name) {
      return `${admin.first_name} ${admin.last_name}`;
    }
    return admin.full_name || 'Admin';
  };

  const getOfficerName = (officerRef) => {
    if (!officerRef || !allUsers || allUsers.length === 0) return 'Officer';
    const officer = allUsers.find(u => String(u.id) === String(officerRef) || String(u.email || '').toLowerCase() === String(officerRef || '').toLowerCase());
    if (!officer) return 'Officer';
    if (officer.first_name && officer.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return officer.full_name || 'Officer';
  };

  const handleViewReport = (report) => {
    setSelectedReport(report);
    setAdminNotes(report.admin_notes || "");
    setNewStatus(report.status || "new");
    setShowDialog(true);
  };

  const handleMarkViewed = () => {
    if (selectedReport) {
      markViewedMutation.mutate({
        id: selectedReport.id,
        notes: adminNotes,
        status: newStatus
      });
    }
  };

  const handleArchive = async () => {
    if (selectedReport && await confirmInApp("Move this report to inactive? This marks it as resolved.")) {
      archiveReportMutation.mutate(selectedReport.id);
    }
  };

  const printReport = (report) => {
    const creatorRef = report.created_by_id || report.created_by;
    const creator = allUsers?.find(officer => String(officer.id) === String(creatorRef)
      || String(officer.email || '').toLowerCase() === String(creatorRef || '').toLowerCase());
    const officerName = report.anonymous ? "ANONYMOUS SUBMISSION" : getOfficerName(creatorRef);
    const reportTypeLabels = {
      workplace_concern: "Workplace Concern",
      safety_issue: "Safety Issue",
      policy_concern: "Policy Concern",
      team_issue: "Team Issue",
      management_concern: "Management Concern",
      other: "Other"
    };
    const contactMethodLabels = {
      email: "Email",
      phone: "Phone Call",
      in_person: "In-Person Meeting",
      no_contact: "No Follow-Up Needed"
    };
    const timeZone = 'America/New_York';

    openBlackPointReport({
      title: 'Confidential Report',
      subtitle: 'Restricted Internal Review Record',
      reportNumber: report.report_number || report.id || '',
      status: report.status || 'new',
      timeZone,
      meta: [
        { label: 'Report Type', value: reportTypeLabels[report.report_type] || report.report_type },
        { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        { label: 'Identity', value: report.anonymous ? 'Anonymous' : 'Named submission' },
      ],
      sections: [
        { title: 'Submission Details', fields: [
          { label: 'Reporting Officer', value: officerName },
          { label: 'Preferred Contact', value: contactMethodLabels[report.preferred_contact_method] || report.preferred_contact_method },
          { label: 'Linked CAD Call', value: report.linked_call_number, wide: true },
          { label: 'Concern', value: report.description, wide: true },
        ] },
        { title: 'Administrative Review', fields: [
          { label: 'Reviewed By', value: report.reviewed_by },
          { label: 'Reviewed Date', value: formatReportDateTime(report.reviewed_date, timeZone) },
          { label: 'Administrative Notes', value: report.admin_notes, wide: true },
        ] },
      ],
      officer: {
        name: officerName,
        signatureName: report.anonymous ? 'Anonymous authenticated submission' : officerName,
        email: report.anonymous ? '' : creator?.email || '',
        badge: report.anonymous ? '' : creator?.badge_number || '',
        unit: report.anonymous ? '' : creator?.unit_number || '',
      },
      signedAt: report.created_date,
      footerNote: 'Confidential — authorized personnel only.',
    });
  };

  const legacyPrintReport = (report) => {
    const officerName = report.anonymous ? "ANONYMOUS SUBMISSION" : getOfficerName(report.created_by_id || report.created_by);
    const reportTypeLabels = {
      workplace_concern: "Workplace Concern",
      safety_issue: "Safety Issue",
      policy_concern: "Policy Concern",
      team_issue: "Team Issue",
      management_concern: "Management Concern",
      other: "Other"
    };

    const contactMethodLabels = {
      email: "Email",
      phone: "Phone Call",
      in_person: "In-Person Meeting",
      no_contact: "No Follow-Up Needed"
    };

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Confidential Report - ${format(new Date(report.created_date), 'MMM d, yyyy')}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.5in; }
          body {
            font-family: Arial, sans-serif;
            padding: 0;
            margin: 0;
            line-height: 1.5;
            color: #000;
            font-size: 11px;
          }
          .container {
            max-width: 7.5in;
            margin: 0 auto;
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .header {
            text-align: center;
            margin-bottom: 12px;
            border-bottom: 3px solid #dc2626;
            padding-bottom: 10px;
          }
          .header img { width: 250px; height: auto; object-fit: contain; margin-bottom: 10px; }
          .header h1 {
            margin: 5px 0;
            font-size: 20px;
            color: #dc2626;
            font-weight: bold;
          }
          .header .subtitle {
            font-size: 12px;
            color: #666;
            margin: 3px 0;
          }
          .confidential-banner {
            background: #dc2626;
            color: white;
            padding: 10px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 15px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 12px;
            padding: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          .info-item {
            padding: 5px;
          }
          .info-label {
            font-weight: bold;
            font-size: 9px;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 3px;
          }
          .info-value {
            font-size: 11px;
            color: #1e293b;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .status-new { background: #dbeafe; color: #1e40af; }
          .status-reviewed { background: #fef3c7; color: #92400e; }
          .status-investigating { background: #fed7aa; color: #9a3412; }
          .status-resolved { background: #d1fae5; color: #065f46; }
          .anonymous-notice {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            padding: 10px;
            margin: 10px 0;
            font-weight: bold;
            color: #92400e;
            font-size: 10px;
          }
          .section {
            margin: 10px 0;
            page-break-inside: avoid;
          }
          .section-title {
            font-weight: bold;
            font-size: 11px;
            margin-bottom: 5px;
            color: #1e293b;
            text-transform: uppercase;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 3px;
          }
          .section-content {
            padding: 10px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            white-space: pre-wrap;
            line-height: 1.6;
            font-size: 10px;
          }
          .admin-section {
            margin-top: 12px;
            padding: 10px;
            background: #f1f5f9;
            border: 2px solid #94a3b8;
            page-break-inside: avoid;
          }
          .footer {
            margin-top: auto;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 9px;
            color: #64748b;
          }
          @media print {
            body { padding: 0; }
            .container { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CONFIDENTIAL REPORT</h1>
            <div class="subtitle">Richmond, VA</div>
          </div>

          <div class="confidential-banner">
            ⚠️ CONFIDENTIAL - FOR MANAGEMENT USE ONLY - DO NOT DISTRIBUTE
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Report ID</div>
              <div class="info-value">#${report.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Submission Date</div>
              <div class="info-value">${format(new Date(report.created_date), 'MMMM d, yyyy h:mm a')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Submitted By</div>
              <div class="info-value">${officerName}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Report Type</div>
              <div class="info-value">${reportTypeLabels[report.report_type]}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Current Status</div>
              <div class="info-value">
                <span class="status-badge status-${report.status}">${report.status.toUpperCase()}</span>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Contact Method</div>
              <div class="info-value">${contactMethodLabels[report.preferred_contact_method]}</div>
            </div>
          </div>

          ${report.anonymous ? `
          <div class="anonymous-notice">
            🔒 ANONYMOUS SUBMISSION - Officer identity is protected and not recorded
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Detailed Description</div>
            <div class="section-content">${report.description}</div>
          </div>

          ${report.admin_notes ? `
          <div class="admin-section">
            <div class="section-title" style="border-color: #94a3b8;">Admin Notes (Internal Only)</div>
            <div class="section-content" style="background: #ffffff;">${report.admin_notes}</div>
          </div>
          ` : ''}

          ${report.reviewed_by ? `
          <div class="section">
            <div class="section-title">Review History</div>
            <div class="section-content">
              <p><strong>Reviewed By:</strong> ${getAdminName(report.reviewed_by)}</p>
              <p><strong>Review Date:</strong> ${format(new Date(report.reviewed_date), 'MMMM d, yyyy h:mm a')}</p>
              <p><strong>Status at Review:</strong> ${report.status.toUpperCase()}</p>
            </div>
          </div>
          ` : ''}

          <div class="footer">
            <p>This document contains confidential information intended only for authorized management personnel.</p>
            <p>Unauthorized disclosure or distribution is prohibited.</p>
            <p>Printed on ${format(new Date(), 'MMMM d, yyyy')} at ${format(new Date(), 'h:mm a')}</p>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const activeReports = allReports?.filter(r => !r.archived) || [];
  const archivedReports = allReports?.filter(r => r.archived) || [];
  const newReports = activeReports.filter(r => !r.viewed);
  const investigatingReports = activeReports.filter(r => r.status === 'investigating');
  const resolvedReportsForNewCard = archivedReports; // These are reports that are archived and have 'resolved' status

  const reportTypeLabels = {
    workplace_concern: "Workplace Concern",
    safety_issue: "Safety Issue",
    policy_concern: "Policy Concern",
    team_issue: "Team Issue",
    management_concern: "Management Concern",
    other: "Other"
  };

  const statusColors = {
    new: "bg-blue-100 text-blue-800 border-blue-200",
    reviewed: "bg-yellow-100 text-yellow-800 border-yellow-200",
    investigating: "bg-orange-100 text-orange-800 border-orange-200",
    resolved: "bg-green-100 text-green-800 border-green-200"
  };

  const contactIcons = {
    email: <Mail className="w-4 h-4" />,
    phone: <Phone className="w-4 h-4" />,
    in_person: <MessageSquare className="w-4 h-4" />,
    no_contact: <UserX className="w-4 h-4" />
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-white mb-2">Admin Access Required</h2>
        <p className="text-slate-400">You don't have permission to access confidential reports.</p>
      </div>
    );
  }

  return (
    <div className="confidential-reports-page min-h-screen bg-[radial-gradient(circle_at_top_left,_#251020_0,_#07101c_42%,_#050a12_100%)] p-3 text-slate-100 sm:p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-br from-[#251523] via-[#101725] to-[#07101c] p-5 shadow-2xl md:p-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10"><Shield className="h-6 w-6 text-rose-300" /></div>
            <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.2em] text-rose-300">Protected Command Channel</div><h1 className="mt-1 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">Confidential Reports</h1><p className="mt-1 text-sm text-slate-400">Review, investigate, document, and resolve confidential officer concerns.</p></div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
            <CardHeader className="border-b border-blue-900/50 bg-blue-950/25">
              <CardTitle className="text-blue-300 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                New Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-4xl font-bold text-blue-300">{newReports.length}</p>
              <p className="text-sm text-blue-600 mt-1">Awaiting review</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
            <CardHeader className="border-b border-amber-900/50 bg-amber-950/25">
              <CardTitle className="text-amber-300 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Active Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-4xl font-bold text-amber-300">{activeReports.length}</p>
              <p className="text-sm text-amber-600 mt-1">Being handled</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
            <CardHeader className="border-b border-emerald-900/50 bg-emerald-950/25">
              <CardTitle className="text-emerald-300 text-sm flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Resolved
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-4xl font-bold text-emerald-300">{archivedReports.length}</p>
              <p className="text-sm text-green-600 mt-1">Completed</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
          <CardHeader>
            <CardTitle>Reviewed Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="investigating" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-slate-700 bg-[#0b1725] p-1">
                <TabsTrigger value="investigating">
                  Investigating ({investigatingReports.length})
                </TabsTrigger>
                <TabsTrigger value="resolved">
                  Resolved ({resolvedReportsForNewCard.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="investigating" className="space-y-3 pt-4">
                {investigatingReports.map((report) => (
                  <Card key={report.id} className="border-l-4 border-l-orange-500">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-orange-100 text-orange-800">Investigating</Badge>
                            <Badge variant="outline">{reportTypeLabels[report.report_type]}</Badge>
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{report.description}</p>
                          {report.admin_notes && (
                            <div className="mt-2 p-2 bg-slate-950/50 rounded">
                              <p className="text-xs text-slate-500">Admin Notes:</p>
                              <p className="text-sm text-slate-300">{report.admin_notes}</p>
                            </div>
                          )}
                          {report.reviewed_by && (
                            <p className="text-xs text-slate-500 mt-2">
                              Reviewed by {getAdminName(report.reviewed_by)} on {format(new Date(report.reviewed_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewReport(report)}
                        >
                          Update
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {investigatingReports.length === 0 && (
                  <p className="text-center py-8 text-slate-500">No reports under investigation</p>
                )}
              </TabsContent>

              <TabsContent value="resolved" className="space-y-3 pt-4">
                {resolvedReportsForNewCard.map((report) => (
                  <Card key={report.id} className="border-l-4 border-l-green-500">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-green-100 text-green-800">Resolved</Badge>
                            <Badge variant="outline">{reportTypeLabels[report.report_type]}</Badge>
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{report.description}</p>
                          {report.admin_notes && (
                            <div className="mt-2 p-2 bg-slate-950/50 rounded">
                              <p className="text-xs text-slate-500">Resolution Notes:</p>
                              <p className="text-sm text-slate-300">{report.admin_notes}</p>
                            </div>
                          )}
                          {report.reviewed_by && (
                            <p className="text-xs text-slate-500 mt-2">
                              Resolved by {getAdminName(report.reviewed_by)} on {format(new Date(report.reviewed_date), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {resolvedReportsForNewCard.length === 0 && (
                  <p className="text-center py-8 text-slate-500">No resolved reports</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-slate-700 bg-[#0b1725] p-1">
            <TabsTrigger value="active">
              Active Reports ({activeReports.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Resolved Reports ({archivedReports.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
              <CardHeader>
                <CardTitle>Active Confidential Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeReports.map((report) => (
                    <div
                      key={report.id}
                      className={`p-5 rounded-lg border-l-4 ${
                        !report.viewed ? 'bg-blue-50 border-l-blue-500' : 'bg-slate-950/50 border-l-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {!report.viewed && (
                              <Badge className="bg-blue-600 text-white">NEW</Badge>
                            )}
                            <Badge variant="outline" className={statusColors[report.status]}>
                              {report.status.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">
                              {reportTypeLabels[report.report_type]}
                            </Badge>
                            {report.anonymous ? (
                              <Badge variant="outline" className="bg-slate-100 text-slate-800">
                                <UserX className="w-3 h-3 mr-1" />
                                Anonymous
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-50 text-green-800">
                                <User className="w-3 h-3 mr-1" />
                                {getOfficerName(report.created_by_id || report.created_by)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 mb-2">
                            Submitted {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-300 line-clamp-2">
                            {report.description}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleViewReport(report)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printReport(report)}
                            className="bg-slate-950/50 text-slate-800 border-slate-200 hover:bg-slate-100"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </Button>
                        </div>
                      </div>
                      {report.viewed && report.reviewed_by && (
                        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
                          Reviewed by {getAdminName(report.reviewed_by)} on {format(new Date(report.reviewed_date), 'MMM d, yyyy')}
                        </div>
                      )}
                    </div>
                  ))}
                  {activeReports.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No active reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived">
            <Card className="overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0d1725] text-slate-100 shadow-xl">
              <CardHeader>
                <CardTitle>Resolved Confidential Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {archivedReports.map((report) => (
                    <div
                      key={report.id}
                      className="p-5 bg-slate-950/50 rounded-lg border border-slate-200 opacity-75"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              RESOLVED
                            </Badge>
                            <Badge variant="outline">
                              {reportTypeLabels[report.report_type]}
                            </Badge>
                            {report.anonymous ? (
                              <Badge variant="outline" className="bg-slate-100 text-slate-800">
                                <UserX className="w-3 h-3 mr-1" />
                                Anonymous
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-green-50 text-green-800">
                                <User className="w-3 h-3 mr-1" />
                                {getOfficerName(report.created_by_id || report.created_by)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 mb-2">
                            Submitted {format(new Date(report.created_date), 'MMM d, yyyy h:mm a')}
                          </p>
                          <p className="text-sm text-slate-300 line-clamp-2">
                            {report.description}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewReport(report)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printReport(report)}
                            className="bg-slate-950/50 text-slate-800 border-slate-200 hover:bg-slate-100"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {archivedReports.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No resolved reports</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <MobileResponsiveDialog open={showDialog} onOpenChange={setShowDialog}>
        <MobileResponsiveDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <MobileResponsiveDialogHeader>
            <MobileResponsiveDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Confidential Report Details
            </MobileResponsiveDialogTitle>
          </MobileResponsiveDialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Submitted By</p>
                  <p className="text-sm font-semibold text-white">
                    {selectedReport.anonymous ? (
                      <span className="flex items-center gap-1">
                        <UserX className="w-4 h-4" />
                        Anonymous
                      </span>
                    ) : (
                      getOfficerName(selectedReport.created_by_id || selectedReport.created_by)
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Submission Date</p>
                  <p className="text-sm font-semibold text-white">
                    {format(new Date(selectedReport.created_date), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Concern Type</p>
                  <p className="text-sm font-semibold text-white">
                    {reportTypeLabels[selectedReport.report_type]}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Preferred Contact</p>
                  <p className="text-sm font-semibold text-white flex items-center gap-1">
                    {contactIcons[selectedReport.preferred_contact_method]}
                    {selectedReport.preferred_contact_method.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="status" className="text-sm font-semibold text-slate-300 mb-2 block">
                  Report Status
                </Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="admin_notes" className="text-sm font-semibold text-slate-300 mb-2 block">
                  Admin Notes (Internal Only)
                </Label>
                <Textarea
                  id="admin_notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this report, follow-up actions, etc..."
                  rows={4}
                />
              </div>

              {selectedReport.reviewed_by && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700">
                    Previously reviewed by {getAdminName(selectedReport.reviewed_by)} on{' '}
                    {format(new Date(selectedReport.reviewed_date), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => printReport(selectedReport)}
                  className="bg-slate-950/50 text-slate-800 border-slate-200 hover:bg-slate-100"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                >
                  Close
                </Button>
                {!selectedReport.archived && (
                  <>
                    <Button
                      onClick={handleMarkViewed}
                      disabled={markViewedMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {markViewedMutation.isPending ? 'Saving...' : 'Mark as Reviewed'}
                    </Button>
                    <Button
                      onClick={handleArchive}
                      disabled={archiveReportMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      {archiveReportMutation.isPending ? 'Archiving...' : 'Move to Inactive'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </MobileResponsiveDialogContent>
      </MobileResponsiveDialog>
    </div>
  );
}