import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, UserX, Car, Shield, Eye, Briefcase, MapPin, Mail } from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/c29aab328_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";
const DCJS_ID = "DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection";

export default function ClientReports() {
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedArchiveType, setSelectedArchiveType] = useState("shift");
  const [viewingReport, setViewingReport] = useState(null);
  const [viewReportType, setViewReportType] = useState(null);
  const [selectedClientLocation, setSelectedClientLocation] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);
  const effectiveLocation = selectedClientLocation || clientLocations[0] || "";

  const { data: reports } = useQuery({
    queryKey: ['clientReports', effectiveLocation, startDate, endDate],
    queryFn: async () => {
      if (!effectiveLocation) return null;

      const [allShift, allDAR, allIncident, allTrespass, allParking, allCriminal, allSummons] = await Promise.all([
        base44.entities.ShiftReport.filter({ location: effectiveLocation }),
        base44.entities.DailyActivityReport.filter({ location: effectiveLocation }),
        base44.entities.IncidentReport.filter({ location: effectiveLocation }),
        base44.entities.TrespassingNotice.filter({ location: effectiveLocation }),
        base44.entities.ParkingViolation.filter({ location: effectiveLocation }),
        base44.entities.CriminalComplaint.filter({ location: effectiveLocation }),
        base44.entities.Summons.filter({ location: effectiveLocation }),
      ]);

      const filterByDate = (reportList, dateField) => {
        return reportList.filter(report => {
          const reportDate = report[dateField] ? (report[dateField].split('T')[0] || report[dateField]) : null;
          return reportDate && reportDate >= startDate && reportDate <= endDate && report.status === 'approved';
        });
      };

      return {
        shift: filterByDate(allShift, 'shift_date'),
        daily_activity: filterByDate(allDAR, 'report_date'),
        incident: filterByDate(allIncident, 'incident_date'),
        trespass: filterByDate(allTrespass, 'notice_date'),
        parking: filterByDate(allParking, 'violation_date'),
        criminal: filterByDate(allCriminal, 'offense_date'),
        summons: filterByDate(allSummons, 'offense_date'),
      };
    },
    enabled: !!effectiveLocation,
  });

  const reportOfficerEmails = useMemo(() => {
    if (!reports) return [];
    return [...new Set(Object.values(reports).flat().map(report => report.officer_email || report.reporting_officer_email || report.primary_officer_email || report.created_by).filter(Boolean))];
  }, [reports]);

  const { data: officerDirectory = [] } = useQuery({
    queryKey: ['clientReportOfficerDirectory', reportOfficerEmails.join(',')],
    queryFn: async () => {
      const response = await base44.functions.invoke('getClientOfficerDirectory', { officerEmails: reportOfficerEmails });
      return response?.data?.officers || response?.officers || [];
    },
    enabled: reportOfficerEmails.length > 0,
  });

  const getReportOfficerEmail = (report) => report?.officer_email || report?.reporting_officer_email || report?.primary_officer_email || report?.created_by || '';
  const getOfficerName = (email) => {
    const officer = officerDirectory.find(item => item.email === email);
    return officer ? `${officer.rank || 'Officer'} ${officer.last_name || ''}`.trim() : 'Officer';
  };
  const getOfficerSignature = (report) => getOfficerName(getReportOfficerEmail(report));

  const handleView = (type, report) => {
    setViewingReport(report);
    setViewReportType(type);
  };

  const requestReportMutation = useMutation({
    mutationFn: async ({ report, reportType }) => {
      const adminUsers = allUsers?.filter(u => u.role === 'admin') || [];
      
      const reportTypeName = reportType === 'shift' ? 'Shift Report' :
                              reportType === 'incident' ? 'Incident Report' :
                              reportType === 'trespass' ? 'Trespass Notice' :
                              reportType === 'parking' ? 'Parking Violation' :
                              reportType === 'criminal' ? 'Criminal Complaint' :
                              reportType === 'summons' ? 'VA Summons' : 'Report';

      const reportDate = report.shift_date || report.incident_date || report.notice_date || 
                         report.violation_date || report.offense_date || 'N/A';

      for (const admin of adminUsers) {
        await base44.integrations.Core.SendEmail({
          from_name: "BPS Connect Client Portal",
          to: admin.email,
          subject: `Report Request from ${user?.full_name || user?.email}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">📧 Report Request</h1>
              </div>
              
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 2px solid #e5e7eb;">
                <p style="font-size: 16px; margin-bottom: 20px;">A client has requested a copy of a report be emailed to them.</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #7c3aed; margin: 20px 0;">
                  <h3 style="color: #7c3aed; margin-top: 0;">Client Information</h3>
                  <p><strong>Name:</strong> ${user?.full_name || 'N/A'}</p>
                  <p><strong>Email:</strong> ${user?.email}</p>
                  <p><strong>Location:</strong> ${effectiveLocation}</p>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                  <h3 style="color: #3b82f6; margin-top: 0;">Requested Report</h3>
                  <p><strong>Type:</strong> ${reportTypeName}</p>
                  <p><strong>Date:</strong> ${reportDate ? format(new Date(reportDate), 'MMMM d, yyyy') : 'N/A'}</p>
                  <p><strong>Officer:</strong> ${getOfficerName(report.created_by)}</p>
                  <p><strong>Report ID:</strong> ${report.id}</p>
                </div>

                <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #1e40af; font-weight: bold;">📝 Action Required:</p>
                  <p style="margin: 5px 0 0 0; color: #1e3a8a;">
                    Please email the requested ${reportTypeName} to ${user?.email} at your earliest convenience.
                  </p>
                </div>
              </div>
            </div>
          `
        });
      }
    },
    onSuccess: () => {
      alert('Report request sent to administrators. You will receive the report via email shortly.');
    },
    onError: (error) => {
      alert('Failed to send request. Please try again.');
      console.error('Error requesting report:', error);
    }
  });

  const printClientReport = (report, type, allUsersList) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const officerName = getOfficerName(getReportOfficerEmail(report));
    const officerSig = getOfficerSignature(report);
    
    let reportTitle = '';
    let reportContent = '';
    
    if (type === 'shift') {
      reportTitle = 'SHIFT ACTIVITY REPORT';
      const shiftDate = report.shift_date ? format(new Date(report.shift_date), 'MMMM d, yyyy') : '';
      reportContent = `
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
        </div>
      `;
    } else if (type === 'incident') {
      reportTitle = 'INCIDENT REPORT';
      const incidentDate = report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : '';
      reportContent = `
        <div class="content">
          <div class="section">
            <div class="section-title">Incident Information</div>
            <div class="field-box">
              <div class="field-label">Report Number</div>
              <div class="field-value">${report.report_number || 'N/A'}</div>
            </div>
            <div class="field-box">
              <div class="field-label">Location</div>
              <div class="field-value">${report.location}</div>
            </div>
            ${report.specific_location ? `
            <div class="field-box">
              <div class="field-label">Specific Location</div>
              <div class="field-value">${report.specific_location}</div>
            </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">Incident Type & Severity</div>
            <div class="field-box">
              <div class="field-label">Incident Type</div>
              <div class="field-value">${report.incident_type?.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
            <div class="field-box">
              <div class="field-label">Severity Level</div>
              <div class="field-value">${report.severity?.toUpperCase()}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Incident Description</div>
            <div class="field-box">
              <div class="field-value">${report.description}</div>
            </div>
          </div>

          ${report.action_taken ? `
          <div class="section">
            <div class="section-title">Action Taken</div>
            <div class="field-box">
              <div class="field-value">${report.action_taken}</div>
            </div>
          </div>
          ` : ''}

          ${report.persons_involved || report.victims || report.witnesses ? `
          <div class="section">
            <div class="section-title">Persons Involved</div>
            ${report.persons_involved ? `
            <div class="field-box">
              <div class="field-label">Involved Parties</div>
              <div class="field-value">${report.persons_involved}</div>
            </div>
            ` : ''}
            ${report.victims ? `
            <div class="field-box">
              <div class="field-label">Victims</div>
              <div class="field-value">${report.victims}</div>
            </div>
            ` : ''}
            ${report.witnesses ? `
            <div class="field-box">
              <div class="field-label">Witnesses</div>
              <div class="field-value">${report.witnesses}</div>
            </div>
            ` : ''}
          </div>
          ` : ''}

          ${report.police_notified || report.ems_notified || report.fire_notified ? `
          <div class="section">
            <div class="section-title">Emergency Services Notified</div>
            <div class="field-box">
              ${report.police_notified ? '<div class="field-value">✓ Police Department</div>' : ''}
              ${report.ems_notified ? '<div class="field-value">✓ EMS/Medical</div>' : ''}
              ${report.fire_notified ? '<div class="field-value">✓ Fire Department</div>' : ''}
              ${report.police_report_number ? `<div class="field-label" style="margin-top: 8px;">Police Report #</div><div class="field-value">${report.police_report_number}</div>` : ''}
            </div>
          </div>
          ` : ''}
        </div>
      `;
    } else if (type === 'parking') {
      reportTitle = 'PARKING VIOLATION';
      const violationDate = report.violation_date ? format(new Date(report.violation_date), 'MMMM d, yyyy') : '';
      reportContent = `
        <div class="content">
          <div class="section">
            <div class="section-title">Citation Information</div>
            <div class="field-box">
              <div class="field-label">Citation Number</div>
              <div class="field-value">${report.citation_number || 'N/A'}</div>
            </div>
            <div class="field-box">
              <div class="field-label">Call Number</div>
              <div class="field-value">${report.call_number || 'N/A'}</div>
            </div>
            <div class="field-box">
              <div class="field-label">Location</div>
              <div class="field-value">${report.location}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Vehicle Information</div>
            <div class="field-box">
              <div class="field-label">License Plate</div>
              <div class="field-value">${report.license_plate} (${report.license_state})</div>
            </div>
            <div class="field-box">
              <div class="field-label">Vehicle</div>
              <div class="field-value">${report.vehicle_make} ${report.vehicle_model} - ${report.vehicle_color}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Violation Details</div>
            <div class="field-box">
              <div class="field-label">Violation Type</div>
              <div class="field-value">${report.violation_type?.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
            ${report.description ? `
            <div class="field-box">
              <div class="field-label">Description</div>
              <div class="field-value">${report.description}</div>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    } else if (type === 'trespass') {
      reportTitle = 'TRESPASS NOTICE';
      const noticeDate = report.notice_date ? format(new Date(report.notice_date), 'MMMM d, yyyy h:mm a') : '';
      reportContent = `
        <div class="content">
          <div class="section">
            <div class="section-title">Notice Information</div>
            <div class="field-box">
              <div class="field-label">Location</div>
              <div class="field-value">${report.location}</div>
            </div>
            <div class="field-box">
              <div class="field-label">Duration</div>
              <div class="field-value">${report.duration || 'Permanent'}</div>
            </div>
            ${report.expiration_date ? `
            <div class="field-box">
              <div class="field-label">Expiration Date</div>
              <div class="field-value">${format(new Date(report.expiration_date), 'MMMM d, yyyy')}</div>
            </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">Subject Information</div>
            <div class="field-box">
              <div class="field-label">Name</div>
              <div class="field-value">${report.subject_name}</div>
            </div>
            ${report.subject_description ? `
            <div class="field-box">
              <div class="field-label">Physical Description</div>
              <div class="field-value">${report.subject_description}</div>
            </div>
            ` : ''}
            ${report.subject_id ? `
            <div class="field-box">
              <div class="field-label">ID Number</div>
              <div class="field-value">${report.subject_id}</div>
            </div>
            ` : ''}
            ${report.vehicle_info ? `
            <div class="field-box">
              <div class="field-label">Vehicle Information</div>
              <div class="field-value">${report.vehicle_info}</div>
            </div>
            ` : ''}
          </div>

          <div class="section">
            <div class="section-title">Reason for Trespass Notice</div>
            <div class="field-box">
              <div class="field-value">${report.reason}</div>
            </div>
          </div>

          ${report.police_notified ? `
          <div class="section">
            <div class="section-title">Police Notification</div>
            <div class="field-box">
              <div class="field-value">✓ Police Department Notified</div>
              ${report.police_report_number ? `<div class="field-label" style="margin-top: 8px;">Police Report #</div><div class="field-value">${report.police_report_number}</div>` : ''}
            </div>
          </div>
          ` : ''}
        </div>
      `;
    } else if (type === 'criminal') {
      reportTitle = 'Criminal Complaint';
      const offenseDate = report.offense_date ? format(new Date(report.offense_date), 'MMMM d, yyyy') : '';
      reportContent = `
        <div class="section">
          <div class="field-row">
            <div>
              <div class="field-label">OFFENSE DATE</div>
              <div class="field-value">${offenseDate}</div>
            </div>
            <div>
              <div class="field-label">OFFENSE TIME</div>
              <div class="field-value">${report.offense_time}</div>
            </div>
          </div>
          <div class="field-full">
            <div class="field-label">LOCATION</div>
            <div class="field-value">${report.location}</div>
          </div>
          <div class="field-row">
            <div>
              <div class="field-label">ACCUSED</div>
              <div class="field-value">${report.accused_first_name} ${report.accused_last_name}</div>
            </div>
            <div>
              <div class="field-label">VIOLATION CODE</div>
              <div class="field-value">${report.violation_code}</div>
            </div>
          </div>
          <div class="field-full">
            <div class="field-label">FACTS BASIS</div>
            <div class="field-value" style="min-height: 80px; white-space: pre-wrap;">${report.facts_basis}</div>
          </div>
        </div>
      `;
    } else if (type === 'summons') {
      reportTitle = 'VA Summons';
      const offenseDate = report.offense_date ? format(new Date(report.offense_date), 'MMMM d, yyyy') : '';
      const courtDate = report.court_date ? format(new Date(report.court_date), 'MMMM d, yyyy') : 'N/A';
      reportContent = `
        <div class="section">
          <div class="field-row">
            <div>
              <div class="field-label">OFFENSE DATE</div>
              <div class="field-value">${offenseDate}</div>
            </div>
            <div>
              <div class="field-label">OFFENSE TIME</div>
              <div class="field-value">${report.offense_time}</div>
            </div>
          </div>
          <div class="field-full">
            <div class="field-label">LOCATION</div>
            <div class="field-value">${report.location}</div>
          </div>
          <div class="field-row">
            <div>
              <div class="field-label">VIOLATOR</div>
              <div class="field-value">${report.violator_first_name} ${report.violator_last_name}</div>
            </div>
            <div>
              <div class="field-label">VIOLATION CODE</div>
              <div class="field-value">${report.violation_code}</div>
            </div>
          </div>
          <div class="field-full">
            <div class="field-label">VIOLATION DESCRIPTION</div>
            <div class="field-value" style="min-height: 50px; white-space: pre-wrap;">${report.violation_description}</div>
          </div>
          <div class="section-title">COURT INFORMATION</div>
          <div class="field-row">
            <div>
              <div class="field-label">COURT DATE</div>
              <div class="field-value">${courtDate}</div>
            </div>
            <div>
              <div class="field-label">COURT TIME</div>
              <div class="field-value">${report.court_time || 'N/A'}</div>
            </div>
          </div>
          <div class="field-full">
            <div class="field-label">COURT LOCATION</div>
            <div class="field-value">${report.court_location || 'N/A'}</div>
          </div>
        </div>
      `;
    } else {
      reportTitle = 'Unknown Report Type';
      reportContent = `<div class="section"><p>Report content for this type (${type}) is not available for printing.</p></div>`;
    }
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} - ${officerName}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.4in; }
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
            <img src="${LOGO_URL}" alt="Black Point Protection" class="logo" />
            <div class="title">${reportTitle}</div>
            <div class="subtitle">Security Documentation</div>
            <div class="dcjs">${DCJS_ID}</div>
          </div>
          
          <div class="meta-bar">
            <div class="meta-item">
              <span class="meta-label">Report Date:</span>
              <span class="meta-value">${type === 'shift' ? (report.shift_date ? format(new Date(report.shift_date), 'MMMM d, yyyy') : '') : type === 'incident' ? (report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : '') : type === 'trespass' ? (report.notice_date ? format(new Date(report.notice_date), 'MMMM d, yyyy h:mm a') : '') : type === 'parking' ? (report.violation_date ? format(new Date(report.violation_date), 'MMMM d, yyyy') : '') : ''}</span>
            </div>
            ${type === 'shift' ? `
            <div class="meta-item">
              <span class="meta-label">Shift:</span>
              <span class="meta-value">${report.start_time} - ${report.end_time}</span>
            </div>
            ` : ''}
            <div class="meta-item">
              <span class="meta-label">Submitted:</span>
              <span class="meta-value">${report.created_date ? format(new Date(report.created_date), 'M/d/yy h:mm a') : 'N/A'}</span>
            </div>
          </div>
          
          ${reportContent}
          
          ${report.photo_url ? `
          <div class="photo-section">
            <div class="section-title">Photo Documentation</div>
            <img src="${report.photo_url}" alt="Report documentation" />
          </div>
          ` : ''}
          
          <div class="signature-section">
            <div class="field-label">Officer Signature</div>
            <div class="sig-line">${officerSig}</div>
            <div class="sig-details">
              ${officerName} | ${report.officer_ip_address ? `IP: ${report.officer_ip_address} | ` : ''}Electronically Signed: ${report.created_date ? format(new Date(report.created_date), 'MMM d, yyyy h:mm a') : 'N/A'}
            </div>
          </div>
          
          <div class="footer">
            <strong>BLACK POINT PROTECTION</strong>
            <div style="margin-top: 5px;">${DCJS_ID}</div>
            <div style="margin-top: 3px;">Confidential Document - For Official Use Only</div>
          </div>
        </div>
        
        <script>window.onload = function() { setTimeout(() => { window.print(); }, 500); }</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
  };


  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Briefcase className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact support to assign a location to your account.</p>
      </div>
    );
  }

  const archiveTypes = [
    { value: 'shift', label: 'Shift Reports', icon: FileText },
    { value: 'daily_activity', label: 'Daily Activity Reports', icon: FileText },
    { value: 'incident', label: 'Incident Reports', icon: AlertTriangle },
    { value: 'trespass', label: 'Trespass Notices', icon: UserX },
    { value: 'parking', label: 'Parking Violations', icon: Car },
    { value: 'criminal', label: 'Criminal Complaints', icon: Shield },
    { value: 'summons', label: 'VA Summons', icon: FileText },
  ];

  const currentArchiveData = reports?.[selectedArchiveType] || [];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        {clientLocations.length > 1 && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <MapPin className="w-6 h-6 text-purple-600" />
                <div className="flex-1">
                  <Label className="text-sm font-semibold text-purple-900 mb-2 block">
                    Select Location to View Reports
                  </Label>
                  <Select value={selectedClientLocation} onValueChange={setSelectedClientLocation}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select a location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locName) => (
                        <SelectItem key={locName} value={locName}>
                          {locName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">All Reports</h1>
          <p className="text-slate-600">View approved security reports for {effectiveLocation}</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-4">
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
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Security Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={selectedArchiveType} onValueChange={setSelectedArchiveType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {archiveTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label} ({reports?.[type.value]?.length || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {currentArchiveData.map((report) => (
                  <div key={report.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{getOfficerName(getReportOfficerEmail(report))}</h4>
                        <p className="text-sm text-slate-600">
                          {format(new Date(
                            report.shift_date || report.incident_date || report.notice_date || 
                            report.violation_date || report.complaint_date || report.offense_date
                          ), 'MMMM d, yyyy')}
                        </p>
                        {report.incident_type && (
                          <p className="text-sm text-slate-600 mt-1">
                            Type: {report.incident_type.replace(/_/g, ' ').toUpperCase()}
                          </p>
                        )}
                        {report.subject_name && (
                          <p className="text-sm text-slate-600 mt-1">
                            Subject: {report.subject_name}
                          </p>
                        )}
                        {report.license_plate && (
                          <p className="text-sm text-slate-600 mt-1">
                            Vehicle: {report.license_plate}
                          </p>
                        )}
                        {report.violator_first_name && (
                          <p className="text-sm text-slate-600 mt-1">
                            Defendant: {report.violator_first_name} {report.violator_last_name}
                          </p>
                        )}
                        <Badge className="mt-2 bg-green-100 text-green-800">Approved</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => requestReportMutation.mutate({ report, reportType: selectedArchiveType })}
                          disabled={requestReportMutation.isPending}
                          className="text-purple-600 hover:bg-purple-50"
                        >
                          <Mail className="w-4 h-4 mr-1" />
                          Request Report
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleView(selectedArchiveType, report)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {currentArchiveData.length === 0 && (
                  <p className="text-center text-slate-500 py-8">No reports of this type in the selected date range</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Report Dialog */}
      <Dialog open={!!viewingReport} onOpenChange={() => { setViewingReport(null); setViewReportType(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>
                {viewReportType === 'shift' && 'Shift Report'}
                {viewReportType === 'incident' && 'Incident Report'}
                {viewReportType === 'trespass' && 'Trespass Notice'}
                {viewReportType === 'parking' && 'Parking Violation'}
                {viewReportType === 'criminal' && 'Criminal Complaint'}
                {viewReportType === 'summons' && 'VA Summons'}
              </span>
              {viewingReport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestReportMutation.mutate({ report: viewingReport, reportType: viewReportType })}
                  disabled={requestReportMutation.isPending}
                  className="text-purple-600 hover:bg-purple-50"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  Request via Email
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewingReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Officer</p>
                  <p className="font-medium">{getOfficerName(getReportOfficerEmail(viewingReport))}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Location</p>
                  <p className="font-medium">{viewingReport.location}</p>
                </div>
                {viewingReport.shift_date && (
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="font-medium">{format(new Date(viewingReport.shift_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {viewingReport.incident_date && (
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="font-medium">{format(new Date(viewingReport.incident_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {viewingReport.notice_date && (
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="font-medium">{format(new Date(viewingReport.notice_date), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                )}
                {viewingReport.violation_date && (
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="font-medium">{format(new Date(viewingReport.violation_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {viewingReport.offense_date && (viewReportType === 'criminal' || viewReportType === 'summons') && (
                  <div>
                    <p className="text-sm text-slate-500">Date</p>
                    <p className="font-medium">{format(new Date(viewingReport.offense_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
              </div>

              {/* Shift Report Details */}
              {viewReportType === 'shift' && (
                <>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Shift Time</p>
                    <p className="font-medium">{viewingReport.start_time} - {viewingReport.end_time}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Activities</p>
                    <p className="whitespace-pre-wrap">{viewingReport.activities}</p>
                  </div>
                  {viewingReport.incidents && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Incidents</p>
                      <p className="whitespace-pre-wrap">{viewingReport.incidents}</p>
                    </div>
                  )}
                </>
              )}

              {/* Daily Activity Report Details */}
              {viewReportType === 'daily_activity' && (
                <>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Report Date</p>
                    <p className="font-medium">{viewingReport.report_date ? format(new Date(viewingReport.report_date), 'MMM d, yyyy') : ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Shift Time</p>
                    <p className="font-medium">{viewingReport.start_time} - {viewingReport.end_time}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Hourly Activity Log</p>
                    <p className="whitespace-pre-wrap font-mono text-sm bg-slate-50 p-3 rounded border">{viewingReport.hourly_entries}</p>
                  </div>
                  {viewingReport.incidents && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Incidents</p>
                      <p className="whitespace-pre-wrap">{viewingReport.incidents}</p>
                    </div>
                  )}
                </>
              )}

              {/* Incident Report Details */}
              {viewReportType === 'incident' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Type</p>
                      <p className="font-medium">{viewingReport.incident_type?.replace(/_/g, ' ').toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Severity</p>
                      <Badge className={
                        viewingReport.severity === 'critical' ? 'bg-red-600' :
                        viewingReport.severity === 'high' ? 'bg-orange-600' :
                        viewingReport.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
                      }>
                        {viewingReport.severity?.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Description</p>
                    <p className="whitespace-pre-wrap">{viewingReport.description}</p>
                  </div>
                  {viewingReport.action_taken && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Action Taken</p>
                      <p className="whitespace-pre-wrap">{viewingReport.action_taken}</p>
                    </div>
                  )}
                </>
              )}

              {/* Trespass Notice Details */}
              {viewReportType === 'trespass' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Subject Name</p>
                      <p className="font-medium">{viewingReport.subject_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Duration</p>
                      <p className="font-medium">{viewingReport.duration || 'Permanent'}</p>
                    </div>
                  </div>
                  {viewingReport.subject_description && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Description</p>
                      <p className="whitespace-pre-wrap">{viewingReport.subject_description}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Reason</p>
                    <p className="whitespace-pre-wrap">{viewingReport.reason}</p>
                  </div>
                </>
              )}

              {/* Parking Violation Details */}
              {viewReportType === 'parking' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">License Plate</p>
                      <p className="font-medium">{viewingReport.license_plate} ({viewingReport.license_state})</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Violation Type</p>
                      <p className="font-medium">{viewingReport.violation_type?.replace(/_/g, ' ').toUpperCase()}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Vehicle</p>
                    <p className="font-medium">{viewingReport.vehicle_make} {viewingReport.vehicle_model} ({viewingReport.vehicle_color})</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Description</p>
                    <p className="whitespace-pre-wrap">{viewingReport.description}</p>
                  </div>
                </>
              )}

              {/* Criminal Complaint Details */}
              {viewReportType === 'criminal' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Accused</p>
                      <p className="font-medium">{viewingReport.accused_first_name} {viewingReport.accused_last_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Violation Code</p>
                      <p className="font-medium">{viewingReport.violation_code}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Facts</p>
                    <p className="whitespace-pre-wrap">{viewingReport.facts_basis}</p>
                  </div>
                </>
              )}

              {/* Summons Details */}
              {viewReportType === 'summons' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Violator</p>
                      <p className="font-medium">{viewingReport.violator_first_name} {viewingReport.violator_last_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Violation Code</p>
                      <p className="font-medium">{viewingReport.violation_code}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Violation Description</p>
                    <p className="whitespace-pre-wrap">{viewingReport.violation_description}</p>
                  </div>
                  {viewingReport.court_date && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Court Information</p>
                      <p className="font-medium">{format(new Date(viewingReport.court_date), 'MMM d, yyyy')} at {viewingReport.court_time}</p>
                      <p className="text-sm text-slate-600">{viewingReport.court_location}</p>
                    </div>
                  )}
                </>
              )}

              {viewingReport.photo_url && (
                <div>
                  <p className="text-sm text-slate-500 mb-2">Photo</p>
                  <img src={viewingReport.photo_url} alt="Report photo" className="w-full rounded-lg" />
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-slate-500 mb-2">Officer Signature</p>
                {viewingReport.signature_url ? (
                  <img src={viewingReport.signature_url} alt="Officer Signature" className="h-16 object-contain" />
                ) : (
                  <p className="text-2xl font-serif italic">{getOfficerSignature(viewingReport)}</p>
                )}
                {viewingReport.officer_ip_address && viewingReport.created_date && (
                  <p className="text-xs text-slate-400 mt-1">
                    IP: {viewingReport.officer_ip_address} | Signed: {format(new Date(viewingReport.created_date), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}