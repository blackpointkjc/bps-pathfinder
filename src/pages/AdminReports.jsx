import { findDirectoryUser, getCurrentDirectoryUser, listDirectoryLocations, listDirectoryUsers, primaryDirectoryEmail } from '@/lib/appDirectory';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Check, Printer, FileText, AlertTriangle, UserX, Eye, Car, X, Mail, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import { openVirginiaSummonsPrint } from "@/utils/virginiaSummonsPrint";
import { openVirginiaCriminalComplaintPrint } from "@/utils/virginiaCriminalComplaintPrint";
import { openTrespassNoticePrint, resolvePoliceDepartment } from "@/utils/trespassNoticePrint";
import {
  formatReportClock,
  formatReportDate,
  formatReportDateTime,
  openBlackPointReport,
  reportTimeZoneLabel,
  resolveReportTimeZone,
} from '@/lib/reportPrint';
import {
  MobileResponsiveDialog,
  MobileResponsiveDialogContent,
  MobileResponsiveDialogHeader,
  MobileResponsiveDialogTitle,
} from "../components/MobileResponsiveDialog";


export default function AdminReports() {
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedArchiveType, setSelectedArchiveType] = useState("shift");
  const [selectedReviewType, setSelectedReviewType] = useState("all");
  const [viewingReport, setViewingReport] = useState(null);
  const [viewReportType, setViewReportType] = useState(null);
  const [rejectingReport, setRejectingReport] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const reportReviewRoles = new Set((user?.additional_roles || []).map(role => String(role).trim().toLowerCase()));
  const canReviewReports = user?.role === 'admin' || reportReviewRoles.has('full_access') || reportReviewRoles.has('report_review');

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
  });

  const { data: locations } = useQuery({
    queryKey: ['allLocations'],
    queryFn: () => listDirectoryLocations('site_name'),
  });

  const { data: reports } = useQuery({
    queryKey: ['allReportsForReview', startDate, endDate, selectedLocation],
    queryFn: async () => {
      const [allShift, allDAR, allIncident] = await Promise.all([
        base44.entities.ShiftReport.list('-created_date'),
        base44.entities.DailyActivityReport.list('-created_date'),
        base44.entities.IncidentReport.list('-created_date'),
      ]);
      const [allTrespass, allParking, allCriminal] = await Promise.all([
        base44.entities.TrespassingNotice.list('-created_date'),
        base44.entities.ParkingViolation.list('-created_date'),
        base44.entities.CriminalComplaint.list('-created_date'),
      ]);
      const allSummons = await base44.entities.Summons.list('-created_date');
      const allDispatcherLogs = await base44.entities.DispatcherShiftReport.list('-created_date');

      const filterData = (reportList, dateField, reviewStatuses, archiveStatuses) => {
        const review = [];
        const archive = [];

        reportList.forEach(report => {
          const reportDate = report[dateField] ? (report[dateField].split('T')[0] || report[dateField]) : null;
          const dateMatch = reportDate && reportDate >= startDate && reportDate <= endDate;
          const locationMatch = selectedLocation === 'all' || report.location === selectedLocation;

          // Pending reports show regardless of date - only filter by location
          if (reviewStatuses.includes(report.status)) {
            if (locationMatch) {
              review.push(report);
            }
          } else if (archiveStatuses.includes(report.status)) {
            // Archived reports need both date and location match
            if (dateMatch && locationMatch) {
              archive.push(report);
            }
          }
        });
        return { review, archive };
      };

      const shiftData = filterData(allShift, 'shift_date', ['submitted'], ['approved']);
      const darData = filterData(allDAR, 'report_date', ['submitted'], ['approved']);
      // Older records may still carry the legacy "pending" review state. Treat it
      // exactly like submitted so a report can never disappear from the review queue.
      const incidentData = filterData(allIncident, 'incident_date', ['submitted', 'pending'], ['approved']);
      const trespassData = filterData(allTrespass, 'notice_date', ['active'], ['approved']);
      const parkingData = filterData(allParking, 'violation_date', ['issued'], ['approved']);
      const criminalData = filterData(allCriminal, 'offense_date', ['submitted'], ['approved']);
      const summonsData = filterData(allSummons, 'offense_date', ['issued'], ['appeared', 'paid', 'dismissed', 'failed_to_appear']);
      const dispatcherData = filterData(allDispatcherLogs, 'shift_date', ['submitted'], ['approved']);

      return {
        shift: shiftData.review,
        daily_activity: darData.review,
        incident: incidentData.review,
        trespass: trespassData.review,
        parking: parkingData.review,
        criminal: criminalData.review,
        summons: summonsData.review,
        dispatcher_log: dispatcherData.review,

        shiftArchive: shiftData.archive,
        darArchive: darData.archive,
        incidentArchive: incidentData.archive,
        trespassArchive: trespassData.archive,
        parkingArchive: parkingData.archive,
        criminalArchive: criminalData.archive,
        summonsArchive: summonsData.archive,
        dispatcher_logArchive: dispatcherData.archive,
      };
    },
    enabled: !!user && canReviewReports,
  });

  const approveReportMutation = useMutation({
    mutationFn: async ({ type, id }) => {
      const response = await base44.functions.invoke('manage-report-review', {
        action: 'approve',
        type,
        reportId: id,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      if (!payload.report) throw new Error('The report was not approved.');
      return payload.report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allReportsForReview'] });
      alert('Report approved successfully!');
    },
    onError: (error) => {
      alert('Failed to approve report: ' + (error?.message || 'Unknown error'));
    },
  });

  const rejectReportMutation = useMutation({
    mutationFn: async ({ type, id, reason }) => {
      const response = await base44.functions.invoke('manage-report-review', {
        action: 'reject',
        type,
        reportId: id,
        reason,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      if (!payload.report) throw new Error('The report was not sent back for revision.');
      return payload.report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allReportsForReview'] });
      setRejectingReport(null);
      setRejectReason("");
      alert('Report sent back for revision!');
    },
    onError: (error) => {
      alert('Failed to send report back: ' + (error?.message || 'Unknown error'));
    },
  });

  const handleAction = (action, type, report) => {
    if (action === 'approve') {
      approveReportMutation.mutate({ type, id: report.id, report });
    } else if (action === 'reject') {
      setRejectingReport({ type, report });
    } else if (action === 'view') {
      setViewingReport(report);
      setViewReportType(type);
    }
  };

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    rejectReportMutation.mutate({
      type: rejectingReport.type,
      id: rejectingReport.report.id,
      reason: rejectReason
    });
  };

  const resolveOfficer = (officerRef) => findDirectoryUser(
    [...(allUsers || []), user].filter(Boolean),
    officerRef
  );

  const getOfficerEmail = (officerRef) => primaryDirectoryEmail(resolveOfficer(officerRef));

  const getOfficerName = (officerRef) => {
    const officer = resolveOfficer(officerRef);
    return officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email : 'Unknown Officer';
  };

  const getOfficerSignature = (officerRef) => {
    const officer = resolveOfficer(officerRef);
    if (officer?.rank && officer?.last_name && officer?.unit_number) {
      return `${officer.rank} ${officer.last_name} Unit ${officer.unit_number}`;
    }
    if (officer?.rank && officer?.last_name) {
      return `${officer.rank} ${officer.last_name}`;
    }
    return `${officer?.first_name || ''} ${officer?.last_name || ''}`.trim() || officer?.email || 'Unknown Officer';
  };

  const printReport = (report, type) => {
    const creatorRef = report.created_by_id || report.created_by;
    const officerName = getOfficerName(creatorRef);
    const officer = resolveOfficer(creatorRef);
    const locationRecord = locations?.find(location => location.site_name === report.location);
    const timeZone = resolveReportTimeZone(locationRecord, report.device_timezone || 'America/New_York');
    const zoneLabel = reportTimeZoneLabel(timeZone, report.created_date);

    if (type === 'summons') {
      openVirginiaSummonsPrint(report, {
        officerName: report.officer_name || officerName,
        badge: report.officer_code_badge || officer?.badge_number || '',
        signatureName: getOfficerSignature(creatorRef),
        timeZone,
      });
      return;
    }
    if (type === 'trespass') {
      const officerFullName = officer
        ? [officer.first_name, officer.last_name].filter(Boolean).join(' ')
        : officerName;
      openTrespassNoticePrint(report, {
        jurisdiction: 'VA',
        locationRecord: locationRecord || { site_name: report.location, division: 'Virginia', time_zone: timeZone },
        propertyName: locationRecord?.site_name || report.location,
        propertyAddress: locationRecord?.address || report.location,
        senderName: 'Black Point Protection',
        senderAddress: locationRecord?.address || report.location,
        officerName: officerFullName,
        signatureName: getOfficerSignature(creatorRef),
        policeDepartment: resolvePoliceDepartment(locationRecord || { site_name: report.location, division: 'Virginia' }),
        timeZone,
      });
      return;
    }
    if (type === 'criminal') {
      const complainantName = officer?.last_name && officer?.first_name
        ? `${officer.last_name.toUpperCase()}, ${officer.first_name}${officer.middle_name ? ` ${officer.middle_name}` : ''}`
        : (report.complainant_name || officerName);
      openVirginiaCriminalComplaintPrint(report, {
        displayLocation: locationRecord?.address || report.location,
        officerName,
        complainantName,
        signatureName: getOfficerSignature(creatorRef),
        timeZone,
      });
      return;
    }

    const configurations = {
      daily_activity: {
        title: 'Daily Activity Report',
        subtitle: 'Officer Shift Activity and Patrol Record',
        reportNumber: report.report_number || report.id,
        meta: [
          { label: 'Report Date', value: formatReportDate(report.report_date, timeZone) },
          { label: `Shift (${zoneLabel})`, value: `${formatReportClock(report.start_time)} – ${formatReportClock(report.end_time)}` },
          { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        ],
        sections: [
          { title: 'Assignment and Statistics', fields: [
            { label: 'Location / Post', value: report.location, wide: true },
            { label: 'Weather', value: report.weather_conditions },
            { label: 'Patrols', value: report.patrol_count },
            { label: 'Visitors Logged', value: report.visitors_logged },
            { label: 'Doors Checked', value: report.doors_checked },
          ] },
          { title: 'Hourly Activity Log', fields: [
            { label: 'Activities and Observations', value: report.hourly_entries, wide: true },
            { label: 'Incidents', value: report.incidents, wide: true },
            { label: 'Vehicles Noted', value: report.vehicles_noted, wide: true },
            { label: 'Persons of Interest', value: report.persons_of_interest, wide: true },
            { label: 'Equipment Status', value: report.equipment_check, wide: true },
          ] },
        ],
      },
      shift: {
        title: 'Shift Report',
        subtitle: 'Officer Operations and Activity Summary',
        reportNumber: report.report_number || report.id,
        meta: [
          { label: 'Shift Date', value: formatReportDate(report.shift_date, timeZone) },
          { label: `Shift (${zoneLabel})`, value: `${formatReportClock(report.start_time)} – ${formatReportClock(report.end_time)}` },
          { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        ],
        sections: [
          { title: 'Assignment and Statistics', fields: [
            { label: 'Location / Post', value: report.location, wide: true },
            { label: 'Weather', value: report.weather_conditions },
            { label: 'Patrol Count', value: report.patrol_count },
            { label: 'Visitors Logged', value: report.visitors_logged },
            { label: 'Doors Checked', value: report.doors_checked },
          ] },
          { title: 'Shift Activity', fields: [
            { label: 'Activities', value: report.activities, wide: true },
            { label: 'Incidents', value: report.incidents, wide: true },
            { label: 'Vehicles Noted', value: report.vehicles_noted, wide: true },
            { label: 'Persons of Interest', value: report.persons_of_interest, wide: true },
            { label: 'Equipment Status', value: report.equipment_check, wide: true },
          ] },
        ],
      },
      incident: {
        title: 'Incident Report',
        subtitle: 'Security Incident Documentation',
        reportNumber: report.report_number || report.id,
        meta: [
          { label: 'Call Number', value: report.call_number || report.linked_call_number || 'Not linked' },
          { label: 'Incident Date', value: formatReportDate(report.incident_date, timeZone) },
          { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        ],
        sections: [
          { title: 'Incident Information', fields: [
            { label: 'Location', value: report.location },
            { label: 'Specific Location', value: report.specific_location },
            { label: 'Incident Type', value: String(report.incident_type || '').replaceAll('_', ' ').toUpperCase() },
            { label: 'Severity', value: String(report.severity || '').toUpperCase() },
            { label: `Time Occurred (${zoneLabel})`, value: formatReportClock(report.incident_time) },
            { label: `Time Discovered (${zoneLabel})`, value: formatReportClock(report.discovered_time) },
          ] },
          { title: 'Incident Narrative', fields: [
            { label: 'Description', value: report.description, wide: true },
            { label: 'Action Taken', value: report.action_taken, wide: true },
            { label: 'Suspect Description', value: report.suspect_description },
            { label: 'Suspect Vehicle', value: report.suspect_vehicle },
            { label: 'Victims', value: report.victims },
            { label: 'Witnesses', value: report.witnesses },
          ] },
          { title: 'Response and Damage', fields: [
            { label: 'Police Notified', value: report.police_notified ? 'Yes' : 'No' },
            { label: 'Police Report Number', value: report.police_report_number },
            { label: 'EMS Notified', value: report.ems_notified ? 'Yes' : 'No' },
            { label: 'Fire Notified', value: report.fire_notified ? 'Yes' : 'No' },
            { label: 'Injury Details', value: report.injury_details, wide: true },
            { label: 'Damage Details', value: report.damage_details, wide: true },
          ] },
        ],
      },
      parking: {
        title: 'Parking Violation Report',
        subtitle: 'Vehicle and Property Enforcement Record',
        reportNumber: report.citation_number || report.id,
        meta: [
          { label: 'Violation Date', value: formatReportDate(report.violation_date, timeZone) },
          { label: `Violation Time (${zoneLabel})`, value: formatReportClock(report.violation_time) },
          { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        ],
        sections: [
          { title: 'Violation Information', fields: [
            { label: 'Location', value: report.location },
            { label: 'Violation Type', value: String(report.violation_type || '').replaceAll('_', ' ').toUpperCase() },
            { label: 'Description', value: report.description, wide: true },
          ] },
          { title: 'Vehicle Information', fields: [
            { label: 'Vehicle', value: [report.vehicle_year, report.vehicle_make, report.vehicle_model].filter(Boolean).join(' ') },
            { label: 'Color', value: report.vehicle_color },
            { label: 'License Plate', value: report.license_plate },
            { label: 'State', value: report.license_state },
          ] },
        ],
      },
      dispatcher_log: {
        title: 'Dispatcher Shift Log',
        subtitle: 'Dispatch Operations Summary',
        reportNumber: report.id,
        meta: [
          { label: 'Shift Date', value: formatReportDate(report.shift_date, timeZone) },
          { label: `Shift (${zoneLabel})`, value: `${formatReportClock(report.shift_start)} – ${formatReportClock(report.shift_end)}` },
          { label: 'Submitted', value: formatReportDateTime(report.created_date, timeZone) },
        ],
        sections: [
          { title: 'Dispatcher', fields: [
            { label: 'Dispatcher', value: report.dispatcher_name, wide: true },
            { label: 'Shift Summary', value: report.summary, wide: true },
          ] },
          ...(report.dispatch_log?.length ? [{
            title: 'Dispatched Calls',
            fields: (report.dispatch_log || []).map(entry => ({
              label: entry.call_number || 'Unlinked',
              value: [entry.incident_type, entry.location, entry.notes].filter(Boolean).join(' — '),
              wide: true,
            })),
          }] : []),
        ],
      },
    };

    const configuration = configurations[type];
    if (!configuration) return;
    openBlackPointReport({
      ...configuration,
      status: report.status || '',
      timeZone,
      photos: report.photo_urls || (report.photo_url ? [report.photo_url] : []),
      officer: {
        name: officerName,
        signatureName: getOfficerSignature(creatorRef),
        email: officer?.email || '',
        badge: officer?.badge_number || '',
        unit: officer?.unit_number || '',
        ip: report.officer_ip_address || '',
      },
      signedAt: report.officer_signed_at || report.created_date,
      signatureUrl: report.officer_signature_url || report.signature_url || '',
      footerNote: 'DCJS: 11-30423.',
    });
  };

  const legacyPrintReport = (report, type) => {
    const officerName = getOfficerName(report.created_by_id || report.created_by);
    if (type === 'summons') {
      openVirginiaSummonsPrint(report, {
        officerName: report.officer_name || officerName,
        badge: report.officer_code_badge || '',
      });
      return;
    }
    if (type === 'trespass') {
      const creatorRef = report.created_by_id || report.created_by;
      const officer = allUsers?.find(u => String(u.id) === String(creatorRef) || String(u.email || '').toLowerCase() === String(creatorRef || '').toLowerCase());
      const site = locations?.find(loc => loc.site_name === report.location);
      const officerFullName = officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() : officerName;
      openTrespassNoticePrint(report, {
        jurisdiction: 'VA',
        locationRecord: site || { site_name: report.location, division: 'Virginia' },
        propertyName: site?.site_name || report.location,
        propertyAddress: site?.address || report.location,
        senderName: 'Black Point Protection',
        senderAddress: site?.address || report.location,
        officerName: officerFullName,
        signatureName: '',
        policeDepartment: resolvePoliceDepartment(site || { site_name: report.location, division: 'Virginia' }),
      });
      return;
    }
    if (type === 'criminal') {
      const creatorRef = report.created_by_id || report.created_by;
      const officer = allUsers?.find(u => String(u.id) === String(creatorRef) || String(u.email || '').toLowerCase() === String(creatorRef || '').toLowerCase());
      const complainantName = officer?.last_name && officer?.first_name
        ? `${officer.last_name.toUpperCase()}, ${officer.first_name}${officer.middle_name ? ` ${officer.middle_name}` : ''}`
        : (report.complainant_name || officerName);
      const site = locations?.find(loc => loc.site_name === report.location);
      openVirginiaCriminalComplaintPrint(report, {
        displayLocation: site?.address || report.location,
        officerName,
        complainantName,
        signatureName: '',
      });
      return;
    }

    const printWindow = window.open('', '', 'width=850,height=1100');
    // Convert to Zulu time
    const toZulu = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
    };

    let reportTitle = '';
    let reportSubtitle = '';
    let metaInfo = '';
    let reportContent = '';

    if (type === 'daily_activity') {
      reportTitle = 'SHIFT ACTIVITY REPORT';
      reportSubtitle = 'Daily Operations Summary';
      const reportDate = report.report_date ? format(new Date(report.report_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Report Date:</span> <span class="meta-value">${reportDate}</span></div>
        <div class="meta-item"><span class="meta-label">Shift:</span> <span class="meta-value">${report.start_time} - ${report.end_time}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
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
          <div class="field-value">${report.hourly_entries}</div>
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
      `;
    } else if (type === 'shift') {
      reportTitle = 'SHIFT REPORT';
      reportSubtitle = 'Officer Activity Summary';
      const shiftDate = report.shift_date ? format(new Date(report.shift_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Shift Date:</span> <span class="meta-value">${shiftDate}</span></div>
        <div class="meta-item"><span class="meta-label">Shift:</span> <span class="meta-value">${report.start_time} - ${report.end_time}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div class="field-box">
          <div class="field-label">Location/Post Assignment</div>
          <div class="field-value">${report.location}</div>
        </div>

        <div class="section-title">Shift Activities</div>
        <div class="field-box">
          <div class="field-value">${report.activities}</div>
        </div>

        ${report.incidents ? `
        <div class="section">
          <div class="section-title">Incidents</div>
          <div class="field-box">
            <div class="field-value">${report.incidents}</div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (type === 'incident') {
      reportTitle = 'INCIDENT REPORT';
      reportSubtitle = 'Security Incident Documentation';
      const incidentDate = report.incident_date ? format(new Date(report.incident_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Report #:</span> <span class="meta-value">${report.report_number || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Date:</span> <span class="meta-value">${incidentDate} at ${report.incident_time}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div class="field-box">
          <div class="field-label">Location</div>
          <div class="field-value">${report.location}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Incident Type</div>
            <div class="field-value">${report.incident_type?.replace(/_/g, ' ').toUpperCase() || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Severity</div>
            <div class="field-value">${report.severity?.toUpperCase() || ''}</div>
          </div>
        </div>

        <div class="section-title">Incident Description</div>
        <div class="field-box">
          <div class="field-value">${report.description}</div>
        </div>

        ${report.action_taken ? `
        <div class="section">
          <div class="section-title">Action Taken</div>
          <div class="field-box">
            <div class="field-value">${report.action_taken}</div>
          </div>
        </div>
        ` : ''}

        ${report.suspect_description ? `
        <div class="section">
          <div class="section-title">Suspect Information</div>
          <div class="field-box">
            <div class="field-value">${report.suspect_description}</div>
          </div>
        </div>
        ` : ''}

        ${report.police_notified || report.ems_notified || report.fire_notified ? `
        <div class="section">
          <div class="section-title">Emergency Services Contacted</div>
          <div style="display: flex; gap: 8px; margin: 3px 0;">
            ${report.police_notified ? '<div style="background: #dbeafe; padding: 4px 8px; border-radius: 3px; font-size: 6.5pt; font-weight: 600;">POLICE</div>' : ''}
            ${report.ems_notified ? '<div style="background: #fef3c7; padding: 4px 8px; border-radius: 3px; font-size: 6.5pt; font-weight: 600;">EMS</div>' : ''}
            ${report.fire_notified ? '<div style="background: #fee2e2; padding: 4px 8px; border-radius: 3px; font-size: 6.5pt; font-weight: 600;">FIRE</div>' : ''}
          </div>
        </div>
        ` : ''}
      `;
    } else if (type === 'trespass') {
      reportTitle = 'TRESPASS NOTICE';
      reportSubtitle = 'Official Trespass Warning';
      const noticeDate = report.notice_date ? format(new Date(report.notice_date), 'MMMM d, yyyy h:mm a') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Notice Date:</span> <span class="meta-value">${noticeDate}</span></div>
        <div class="meta-item"><span class="meta-label">Duration:</span> <span class="meta-value">${report.duration || 'Permanent'}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Location</div>
            <div class="field-value">${report.location}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Subject Name</div>
            <div class="field-value">${report.subject_name}</div>
          </div>
        </div>

        ${report.subject_description ? `
        <div class="section">
          <div class="section-title">Physical Description</div>
          <div class="field-box">
            <div class="field-value">${report.subject_description}</div>
          </div>
        </div>
        ` : ''}

        ${report.vehicle_info ? `
        <div class="section">
          <div class="section-title">Vehicle Information</div>
          <div class="field-box">
            <div class="field-value">${report.vehicle_info}</div>
          </div>
        </div>
        ` : ''}

        <div class="section-title">Reason for Trespass Notice</div>
        <div class="field-box">
          <div class="field-value">${report.reason}</div>
        </div>
      `;
    } else if (type === 'parking') {
      reportTitle = 'PARKING VIOLATION';
      reportSubtitle = 'Citation Notice';
      const violationDate = report.violation_date ? format(new Date(report.violation_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Citation #:</span> <span class="meta-value">${report.citation_number || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Date:</span> <span class="meta-value">${violationDate} at ${report.violation_time}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Location</div>
            <div class="field-value">${report.location}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Violation Type</div>
            <div class="field-value">${report.violation_type?.replace(/_/g, ' ').toUpperCase() || ''}</div>
          </div>
        </div>

        <div class="section-title">Vehicle Information</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Vehicle</div>
            <div class="field-value">${report.vehicle_year || ''} ${report.vehicle_make || ''} ${report.vehicle_model || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Color</div>
            <div class="field-value">${report.vehicle_color || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">License Plate</div>
            <div class="field-value">${report.license_plate || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">State</div>
            <div class="field-value">${report.license_state || ''}</div>
          </div>
        </div>

        ${report.description ? `
        <div class="section">
          <div class="section-title">Description</div>
          <div class="field-box">
            <div class="field-value">${report.description}</div>
          </div>
        </div>
        ` : ''}
      `;
    } else if (type === 'criminal') {
      reportTitle = 'CRIMINAL COMPLAINT';
      reportSubtitle = 'Warrant Application';
      const offenseDate = report.offense_date ? format(new Date(report.offense_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Complaint #:</span> <span class="meta-value">${report.complaint_number || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Offense Date:</span> <span class="meta-value">${offenseDate}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div class="field-box">
          <div class="field-label">Location</div>
          <div class="field-value">${report.location}</div>
        </div>

        <div class="section-title">Accused Information</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Name</div>
            <div class="field-value">${report.accused_first_name || ''} ${report.accused_middle_name ? report.accused_middle_name + ' ' : ''}${report.accused_last_name || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Date of Birth</div>
            <div class="field-value">${report.accused_dob ? format(new Date(report.accused_dob), 'MM/dd/yyyy') : ''}</div>
          </div>
        </div>

        <div class="field-box">
          <div class="field-label">Address</div>
          <div class="field-value">${report.accused_address || ''}</div>
        </div>

        <div class="section-title">Violation</div>
        <div class="field-box">
          <div class="field-label">Violation Code</div>
          <div class="field-value">${report.violation_code || ''}</div>
        </div>

        <div class="section-title">Facts and Basis</div>
        <div class="field-box">
          <div class="field-value">${report.facts_basis || ''}</div>
        </div>
      `;
    } else if (type === 'summons') {
      reportTitle = 'VA UNIFORM SUMMONS';
      reportSubtitle = 'Commonwealth of Virginia';
      const offenseDate = report.offense_date ? format(new Date(report.offense_date), 'MMMM d, yyyy') : '';
      metaInfo = `
        <div class="meta-item"><span class="meta-label">Summons #:</span> <span class="meta-value">${report.summons_number || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Offense Date:</span> <span class="meta-value">${offenseDate} at ${report.offense_time}</span></div>
        <div class="meta-item"><span class="meta-label">Submitted (Zulu):</span> <span class="meta-value">${report.created_date ? toZulu(report.created_date) : 'N/A'}</span></div>
      `;
      reportContent = `
        <div class="field-box">
          <div class="field-label">Location</div>
          <div class="field-value">${report.location}</div>
        </div>

        <div class="section-title">Defendant Information</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Name</div>
            <div class="field-value">${report.violator_first_name || ''} ${report.violator_middle_name ? report.violator_middle_name + ' ' : ''}${report.violator_last_name || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Date of Birth</div>
            <div class="field-value">${report.violator_dob ? format(new Date(report.violator_dob), 'MM/dd/yyyy') : ''}</div>
          </div>
        </div>

        <div class="field-box">
          <div class="field-label">Address</div>
          <div class="field-value">${report.violator_address || ''}${report.violator_city ? ', ' + report.violator_city : ''}${report.violator_state ? ', ' + report.violator_state : ''}${report.violator_zip ? ' ' + report.violator_zip : ''}</div>
        </div>

        <div class="field-box">
          <div class="field-label">Driver's License</div>
          <div class="field-value">${report.violator_dl_number || ''} (${report.violator_dl_state || ''})</div>
        </div>

        <div class="section-title">Vehicle Information</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Vehicle</div>
            <div class="field-value">${report.vehicle_year || ''} ${report.vehicle_make || ''} ${report.vehicle_model || ''}</div>
          </div>
          <div class="field-box">
            <div class="field-label">License Plate</div>
            <div class="field-value">${report.vehicle_plate || ''} (${report.vehicle_plate_state || ''})</div>
          </div>
        </div>

        <div class="section-title">Violation</div>
        <div class="field-box">
          <div class="field-label">Code</div>
          <div class="field-value">${report.violation_code || ''}</div>
        </div>
        <div class="field-box">
          <div class="field-label">Description</div>
          <div class="field-value">${report.violation_description || ''}</div>
        </div>

        ${report.court_date ? `
        <div class="section-title">Court Information</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin: 3px 0;">
          <div class="field-box">
            <div class="field-label">Court Date</div>
            <div class="field-value">${format(new Date(report.court_date), 'MMMM d, yyyy')}</div>
          </div>
          <div class="field-box">
            <div class="field-label">Time</div>
            <div class="field-value">${report.court_time || ''}</div>
          </div>
        </div>
        <div class="field-box">
          <div class="field-label">Court Location</div>
          <div class="field-value">${report.court_location || ''}</div>
        </div>
        ` : ''}
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} - ${officerName}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.2in; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 6.5pt; line-height: 1.1; color: #1a1a1a; }

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
          .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 6px; text-align: center; }
          .logo { width: 140px; height: auto; object-fit: contain; margin: 0 auto 4px; }
          .title { font-size: 11pt; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 1px; }
          .subtitle { font-size: 7pt; font-weight: 500; opacity: 0.95; }
          .dcjs { font-size: 5pt; margin-top: 2px; opacity: 0.9; }

          .meta-bar { background: #f8fafc; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
          .meta-item { font-size: 5.5pt; }
          .meta-label { font-weight: 600; color: #475569; }
          .meta-value { color: #1e293b; }

          .content { padding: 6px; }
          .section { margin-bottom: 4px; }
          .section-title { background: #e0e7ff; color: #1e40af; font-weight: bold; font-size: 6.5pt; padding: 2px 4px; border-left: 2px solid #1e40af; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.2px; }

          .field-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 2px; padding: 4px; margin: 2px 0; }
          .field-label { font-size: 5pt; font-weight: 600; color: #475569; margin-bottom: 1px; text-transform: uppercase; letter-spacing: 0.2px; }
          .field-value { color: #1e293b; font-size: 6pt; white-space: pre-wrap; line-height: 1.2; }

          .signature-section { margin-top: 4px; padding: 4px; background: #f8fafc; border-radius: 2px; }
          .sig-line { border-bottom: 1.5px solid #1e40af; min-height: 15px; margin: 2px 0; font-family: 'Brush Script MT', cursive; font-size: 10pt; padding: 1px; color: #1e40af; }
          .sig-details { font-size: 4.5pt; color: #64748b; margin-top: 2px; }

          .footer { background: #1e293b; color: white; padding: 4px; text-align: center; font-size: 5pt; margin-top: 4px; border-radius: 0 0 3px 3px; }
          .footer strong { font-size: 6pt; display: block; margin-bottom: 1px; }
        </style>
      </head>
      <body>
        <button class="back-button no-print" onclick="window.close()">← Back to App</button>

        <div class="report-container">
          <div class="header">
            <div class="title">${reportTitle}</div>
            <div class="subtitle">${reportSubtitle}</div>
          </div>

          <div class="meta-bar">
            ${metaInfo}
          </div>

          <div class="content">
            ${reportContent}

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

  if (!canReviewReports) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const sendEmailToClient = async (report, type) => {
    const location = locations?.find(loc => loc.site_name === report.location);
    if (!location?.assigned_client_email) {
      alert('No client email assigned to this location');
      return;
    }

    const creatorRef = report.created_by_id || report.created_by;
    const officer = allUsers?.find(u => String(u.id) === String(creatorRef) || String(u.email || '').toLowerCase() === String(creatorRef || '').toLowerCase());
    const officerName = officer ? `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email : 'Unknown Officer';
    
    let subject = '';
    let body = '';

    if (type === 'shift') {
      subject = `Shift Report - ${location.site_name} - ${format(new Date(report.shift_date), 'MMM d, yyyy')}`;
      body = `SHIFT REPORT\n\nSite: ${location.site_name}\nDate: ${format(new Date(report.shift_date), 'MMMM d, yyyy')}\nOfficer: ${officerName}\n\nACTIVITIES:\n${report.activities}\n\n${report.incidents ? `INCIDENTS:\n${report.incidents}\n\n` : ''}Login to BPSConnect.net to review the full report.`;
    } else if (type === 'daily_activity') {
      subject = `Daily Activity Report - ${location.site_name} - ${format(new Date(report.report_date), 'MMM d, yyyy')}`;
      body = `DAILY ACTIVITY REPORT\n\nSite: ${location.site_name}\nDate: ${format(new Date(report.report_date), 'MMMM d, yyyy')}\nOfficer: ${officerName}\n\nHOURLY ACTIVITIES:\n${report.hourly_entries}\n\nLogin to BPSConnect.net to review the full report.`;
    } else if (type === 'incident') {
      subject = `⚠️ Incident Report - ${report.incident_type.replace(/_/g, ' ').toUpperCase()} - ${location.site_name}`;
      body = `INCIDENT REPORT\n\nReport #: ${report.report_number}\nSite: ${location.site_name}\nDate: ${format(new Date(report.incident_date), 'MMMM d, yyyy')} at ${report.incident_time}\nOfficer: ${officerName}\nSeverity: ${report.severity.toUpperCase()}\n\nDESCRIPTION:\n${report.description}\n\nLogin to BPSConnect.net to review the full report.`;
    } else if (type === 'parking') {
      subject = `🚗 Parking Violation - ${report.license_plate} - ${location.site_name}`;
      body = `PARKING VIOLATION\n\nCitation #: ${report.citation_number}\nSite: ${location.site_name}\nDate: ${format(new Date(report.violation_date), 'MMMM d, yyyy')}\nOfficer: ${officerName}\nVehicle: ${report.vehicle_make} ${report.vehicle_model} (${report.license_plate})\n\nLogin to BPSConnect.net to review the full violation.`;
    } else if (type === 'trespass') {
      subject = `🚫 Trespass Notice - ${report.subject_name} - ${location.site_name}`;
      body = `TRESPASS NOTICE\n\nSite: ${location.site_name}\nDate: ${format(new Date(report.notice_date), 'MMMM d, yyyy')}\nOfficer: ${officerName}\nSubject: ${report.subject_name}\n\nReason:\n${report.reason}\n\nLogin to BPSConnect.net to review the full notice.`;
    }

    try {
      await base44.integrations.Core.SendEmail({
        from_name: "Black Point Protection",
        to: location.assigned_client_email,
        subject,
        body
      });
      alert('Email sent to client successfully!');
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email to client');
    }
  };

  const ReportCard = ({ report, type, icon: Icon, title }) => {
    const hasActions = ['submitted', 'pending', 'active', 'issued'].includes(report.status);
    const isApproved = ['approved', 'appeared', 'paid'].includes(report.status);
    const location = locations?.find(loc => loc.site_name === report.location);

    return (
      <Card className={`overflow-hidden border border-slate-700/70 bg-[#0d1724] text-slate-100 shadow-lg ${isApproved ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-400'}`}>
        <CardHeader className="border-b border-slate-800 bg-[#111d2b] p-4">
          <CardTitle className="flex flex-col gap-3 text-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                {title}
              </div>
              <div className="flex gap-2 flex-wrap">
                {location?.assigned_client_email && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendEmailToClient(report, type)}
                    className="text-purple-600 border-purple-300 hover:bg-purple-50"
                  >
                    <Mail className="w-4 h-4 mr-1" />
                    Email Client
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReport(report, type)}
                  className="hover:bg-gray-100"
                >
                  <Printer className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction('view', type, report)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                {hasActions && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => handleAction('reject', type, report)}
                      disabled={rejectReportMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleAction('approve', type, report)}
                      disabled={approveReportMutation.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </>
                )}
                {!hasActions && (
                  <Badge className={isApproved ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'}>
                    {report.status.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Officer</div><div className="mt-1 font-semibold text-white">{getOfficerName(report.created_by_id || report.created_by)}</div></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Property / Location</div><div className="mt-1 font-semibold text-white">{report.location || 'Not recorded'}</div></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Report Date</div><div className="mt-1 font-semibold text-white">{formatReportDate(report.shift_date || report.report_date || report.incident_date || report.notice_date || report.violation_date || report.complaint_date || report.offense_date || report.created_date, 'America/New_York')}</div></div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const archiveData = {
    shift: reports?.shiftArchive || [],
    daily_activity: reports?.darArchive || [],
    incident: reports?.incidentArchive || [],
    trespass: reports?.trespassArchive || [],
    parking: reports?.parkingArchive || [],
    criminal: reports?.criminalArchive || [],
    summons: reports?.summonsArchive || [],
    dispatcher_log: reports?.dispatcher_logArchive || [],
  };

  const archiveTypes = [
    { value: 'shift', label: 'Shift Reports', icon: FileText },
    { value: 'daily_activity', label: 'Daily Activity Reports', icon: FileText },
    { value: 'incident', label: 'Incident Reports', icon: AlertTriangle },
    { value: 'trespass', label: 'Trespass Notices', icon: UserX },
    { value: 'parking', label: 'Parking Violations', icon: Car },
    { value: 'criminal', label: 'Criminal Complaints', icon: Shield },
    { value: 'summons', label: 'VA Summons', icon: FileText },
    { value: 'dispatcher_log', label: 'Dispatcher Shift Logs', icon: ClipboardList },
  ];

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Report Review</h1>
          <p className="text-slate-600">Review and approve officer reports</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-3 gap-4 mb-4">
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
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations?.map(loc => (
                      <SelectItem key={loc.id} value={loc.site_name}>
                        {loc.site_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

          </CardContent>
        </Card>

        <div className="space-y-6">
          {(!reports?.shift?.length && !reports?.daily_activity?.length && !reports?.incident?.length && 
            !reports?.trespass?.length && !reports?.parking?.length && !reports?.criminal?.length && !reports?.summons?.length && !reports?.dispatcher_log?.length) && (
            <Card className="border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-xl font-semibold text-slate-600 mb-2">No Reports Pending Review</h3>
                <p className="text-slate-500">All reports have been reviewed or there are no reports in the selected date range and location.</p>
              </CardContent>
            </Card>
          )}

          {reports?.shift?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Shift Reports ({reports.shift.length})</h2>
              <div className="space-y-4">
                {reports.shift.map(report => (
                  <ReportCard key={report.id} report={report} type="shift" icon={FileText} title="Shift Report" />
                ))}
              </div>
            </div>
          )}

          {reports?.daily_activity?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Daily Activity Reports ({reports.daily_activity.length})</h2>
              <div className="space-y-4">
                {reports.daily_activity.map(report => (
                  <ReportCard key={report.id} report={report} type="daily_activity" icon={FileText} title="Daily Activity Report" />
                ))}
              </div>
            </div>
          )}

          {reports?.incident?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Incident Reports ({reports.incident.length})</h2>
              <div className="space-y-4">
                {reports.incident.map(report => (
                  <ReportCard key={report.id} report={report} type="incident" icon={AlertTriangle} title="Incident Report" />
                ))}
              </div>
            </div>
          )}

          {reports?.trespass?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Trespass Notices ({reports.trespass.length})</h2>
              <div className="space-y-4">
                {reports.trespass.map(report => (
                  <ReportCard key={report.id} report={report} type="trespass" icon={UserX} title="Trespass Notice" />
                ))}
              </div>
            </div>
          )}

          {reports?.parking?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Parking Violations ({reports.parking.length})</h2>
              <div className="space-y-4">
                {reports.parking.map(report => (
                  <ReportCard key={report.id} report={report} type="parking" icon={Car} title="Parking Violation" />
                ))}
              </div>
            </div>
          )}

          {reports?.criminal?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Criminal Complaints ({reports.criminal.length})</h2>
              <div className="space-y-4">
                {reports.criminal.map(report => (
                  <ReportCard key={report.id} report={report} type="criminal" icon={Shield} title="Criminal Complaint" />
                ))}
              </div>
            </div>
          )}

          {reports?.summons?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">VA Summons ({reports.summons.length})</h2>
              <div className="space-y-4">
                {reports.summons.map(report => (
                  <ReportCard key={report.id} report={report} type="summons" icon={FileText} title="VA Summons" />
                ))}
              </div>
            </div>
          )}

          {reports?.dispatcher_log?.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">Dispatcher Shift Logs ({reports.dispatcher_log.length})</h2>
              <div className="space-y-4">
                {reports.dispatcher_log.map(report => (
                  <ReportCard key={report.id} report={report} type="dispatcher_log" icon={ClipboardList} title="Dispatcher Shift Log" />
                ))}
              </div>
            </div>
          )}
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-600" />
              Archived Reports
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
                        {type.label} ({archiveData[type.value].length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {archiveData[selectedArchiveType].map((report) => (
                  <div key={report.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{getOfficerName(report.created_by_id || report.created_by)}</h4>
                        <p className="text-sm text-slate-600">
                         {format(new Date(
                           report.shift_date || report.report_date || report.incident_date || report.notice_date || 
                           report.violation_date || report.complaint_date || report.offense_date
                         ), 'MMM d, yyyy')} • {report.location}
                        </p>
                        <Badge className="mt-2 bg-green-100 text-green-800">Approved</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => printReport(report, selectedArchiveType)}>
                          <Printer className="w-4 h-4 mr-1" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleAction('view', selectedArchiveType, report)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {archiveData[selectedArchiveType].length === 0 && (
                  <p className="text-center text-slate-500 py-8">No archived reports of this type</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Report Dialog */}
      <MobileResponsiveDialog open={!!viewingReport} onOpenChange={() => { setViewingReport(null); setViewReportType(null); }}>
        <MobileResponsiveDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <MobileResponsiveDialogHeader>
            <MobileResponsiveDialogTitle>
              {viewReportType === 'shift' && 'Shift Report'}
              {viewReportType === 'daily_activity' && 'Daily Activity Report'}
              {viewReportType === 'incident' && 'Incident Report'}
              {viewReportType === 'trespass' && 'Trespass Notice'}
              {viewReportType === 'parking' && 'Parking Violation'}
              {viewReportType === 'criminal' && 'Criminal Complaint'}
              {viewReportType === 'summons' && 'VA Summons'}
              {viewReportType === 'dispatcher_log' && 'Dispatcher Shift Log'}
            </MobileResponsiveDialogTitle>
          </MobileResponsiveDialogHeader>
          {viewingReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Officer</p>
                  <p className="font-medium">{getOfficerName(viewingReport.created_by_id || viewingReport.created_by)}</p>
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
                    <p className="text-sm text-slate-500 mb-1">Shift Time</p>
                    <p className="font-medium">{viewingReport.start_time} - {viewingReport.end_time}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Hourly Activities</p>
                    <p className="whitespace-pre-wrap font-mono">{viewingReport.hourly_entries}</p>
                  </div>
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

              {/* Dispatcher Shift Log Details */}
              {viewReportType === 'dispatcher_log' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Dispatcher</p>
                      <p className="font-medium">{viewingReport.dispatcher_name || getOfficerName(viewingReport.created_by_id || viewingReport.created_by)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Shift Date</p>
                      <p className="font-medium">{viewingReport.shift_date ? format(new Date(viewingReport.shift_date), 'MMM d, yyyy') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Shift Hours</p>
                      <p className="font-medium">{[viewingReport.shift_start, viewingReport.shift_end].filter(Boolean).join(' – ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Calls Logged</p>
                      <p className="font-medium">{(viewingReport.dispatch_log || []).length}</p>
                    </div>
                  </div>
                  {viewingReport.summary && (
                    <div>
                      <p className="text-sm text-slate-500 mb-1">Shift Summary</p>
                      <p className="whitespace-pre-wrap">{viewingReport.summary}</p>
                    </div>
                  )}
                  {(viewingReport.dispatch_log || []).length > 0 && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Dispatched Calls</p>
                      <div className="space-y-2">
                        {viewingReport.dispatch_log.map((entry, idx) => (
                          <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-slate-900">{entry.call_number || 'Unlinked'}</div>
                              {entry.call_status && <Badge className="bg-slate-200 text-slate-700">{entry.call_status}</Badge>}
                            </div>
                            <div className="text-sm text-slate-600">{entry.incident_type}{entry.location ? ` — ${entry.location}` : ''}</div>
                            {entry.assigned_units?.length > 0 && (
                              <div className="text-xs text-slate-500 mt-1">
                                Assigned: {entry.assigned_units.map((u) => u.label || u.unit_id).join(', ')}
                              </div>
                            )}
                            {entry.notes && <div className="text-sm text-slate-600 whitespace-pre-wrap mt-1">{entry.notes}</div>}
                          </div>
                        ))}
                      </div>
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
                  <p className="text-2xl font-serif italic">{getOfficerSignature(viewingReport.created_by_id || viewingReport.created_by)}</p>
                )}
                {viewingReport.officer_ip_address && viewingReport.created_date && (
                  <p className="text-xs text-slate-400 mt-1">
                    IP: {viewingReport.officer_ip_address} | Signed: {format(new Date(viewingReport.created_date), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </div>
          )}
        </MobileResponsiveDialogContent>
      </MobileResponsiveDialog>

      {/* Reject Dialog */}
      <MobileResponsiveDialog open={!!rejectingReport} onOpenChange={(open) => { if (open) return; setRejectingReport(null); setRejectReason(""); }}>
        <MobileResponsiveDialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <MobileResponsiveDialogHeader>
            <MobileResponsiveDialogTitle>Send Report Back for Revision</MobileResponsiveDialogTitle>
          </MobileResponsiveDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Feedback for Officer</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain what needs to be fixed or changed..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setRejectingReport(null); setRejectReason(""); }}>
                Cancel
              </Button>
              <Button
                onClick={handleRejectSubmit}
                className="bg-red-600 hover:bg-red-700"
                disabled={rejectReportMutation.isPending}
              >
                Send Back for Revision
              </Button>
            </div>
          </div>
        </MobileResponsiveDialogContent>
      </MobileResponsiveDialog>
    </div>
  );
}