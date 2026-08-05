
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Printer, FileText, Clock, MapPin, Phone, Mail } from "lucide-react";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/f3af01307_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

export default function AdminClientReports() {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState("all");
  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState("");
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState("all");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('support'),
  });

  const { data: locations } = useQuery({
    queryKey: ['allLocations'],
    queryFn: () => base44.entities.Location.list('site_name'),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('support'),
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      const today = format(new Date(), 'yyyy-MM-dd');
      return periods.filter(p => p.start_date <= today);
    },
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('support'),
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['clientTimeEntries', selectedLocation, selectedOfficer, startDate, endDate, selectedPayrollPeriod],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      return entries.filter(entry => {
        if (!entry.clock_out) return false;
        const entryDate = entry.clock_in.split('T')[0];
        const dateMatch = entryDate >= startDate && entryDate <= endDate;
        const siteName = entry.location.split(' - ')[0];
        const locationMatch = !selectedLocation || siteName === selectedLocation;
        const officerMatch = selectedOfficer === 'all' || entry.officer_email === selectedOfficer; 
        return dateMatch && locationMatch && officerMatch;
      });
    },
    enabled: (user?.role === 'admin' || user?.additional_roles?.includes('support')) && !!selectedLocation,
  });

  const { data: clientReports, isLoading: isLoadingClientReports } = useQuery({
    queryKey: ['allClientReports', selectedLocation, selectedOfficer, startDate, endDate, selectedReportType, locations, allUsers],
    queryFn: async () => {
      if (!selectedLocation || !locations || !allUsers) return []; 
      const reports = await base44.entities.ClientReport.list('-created_date');
      const locationId = locations.find(loc => loc.site_name === selectedLocation)?.id;
      if (!locationId) return [];
      return reports.filter(report => {
        const reportDate = format(parseISO(report.created_date), 'yyyy-MM-dd');
        const dateMatch = reportDate >= startDate && reportDate <= endDate;
        const locationMatch = report.location_id === locationId;
        const officerMatch = selectedOfficer === 'all' || report.officer_email === selectedOfficer;
        const typeMatch = selectedReportType === 'all' || report.type === selectedReportType;
        return dateMatch && locationMatch && officerMatch && typeMatch;
      }).map(report => ({
        ...report,
        date: report.created_date,
        location: selectedLocation,
        officer_name: getOfficerName(report.officer_email),
      }));
    },
    enabled: (user?.role === 'admin' || user?.additional_roles?.includes('support')) && !!selectedLocation && !!locations && !!allUsers,
  });

  const selectedLocationData = locations?.find(loc => loc.site_name === selectedLocation);
  const selectedPeriodData = payrollPeriods?.find(p => p.id === selectedPayrollPeriod);

  const emailReportToClientMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLocationData?.assigned_client_email) {
        throw new Error("No client email assigned to this location");
      }

      const reportData = getClientReportData();
      const grandTotal = Object.values(reportData).reduce((sum, d) => sum + d.totalHours, 0);

      // Create styled HTML that looks like the printed version
      const reportHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .logo { width: 100px; margin-bottom: 10px; }
            .header h1 { margin: 10px 0; font-size: 28px; }
            .header .site { font-size: 20px; font-weight: bold; color: #2563eb; margin: 10px 0; }
            .summary { background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
            .summary .total { font-size: 36px; font-weight: bold; color: #1e40af; }
            .officer-section { margin: 30px 0; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
            .officer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; }
            .officer-name { font-size: 20px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
            td { padding: 10px; border-bottom: 1px solid #f3f4f6; }
            tfoot { background: #f3f4f6; font-weight: bold; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #000; text-align: center; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BLACK POINT PROTECTION</h1>
            <p>Richmond, VA</p>
            <h2 style="margin-top: 20px;">HOURS REPORT</h2>
            <p class="site">${selectedLocation}</p>
            ${selectedLocationData?.address ? `<p>${selectedLocationData.address}</p>` : ''}
            ${selectedPeriodData ? `<p style="color: #7c3aed; font-weight: bold;">${selectedPeriodData.period_name}</p>` : ''}
            <p>${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}</p>
            <p>Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          </div>

          <div class="summary">
            <p style="font-size: 14px; color: #1e40af; margin-bottom: 10px;">Total Hours for Period</p>
            <div class="total">${grandTotal.toFixed(2)} hours</div>
            <p style="font-size: 12px; color: #1e40af; margin-top: 10px;">${Object.keys(reportData).length} officer(s)</p>
          </div>

          ${Object.entries(reportData).map(([officerEmail, data]) => `
            <div class="officer-section">
              <div class="officer-header">
                <div class="officer-name">${getOfficerName(officerEmail)}</div>
                <div style="text-align: right;">
                  <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${data.totalHours.toFixed(2)} hrs</div>
                  ${data.overtimeHours > 0 ? `<div style="font-size: 14px; color: #ea580c; font-weight: bold;">+${data.overtimeHours.toFixed(2)} OT hrs</div>` : ''}
                </div>
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th style="text-align: right;">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.entries.map(entry => `
                    <tr>
                      <td>${format(new Date(entry.clock_in), 'MMM d, yyyy')}</td>
                      <td>${format(new Date(entry.clock_in), 'h:mm a')}</td>
                      <td>${format(new Date(entry.clock_out), 'h:mm a')}</td>
                      <td style="text-align: right; font-weight: 500;">${entry.hours.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="text-align: right;">Subtotal:</td>
                    <td style="text-align: right;">${data.totalHours.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `).join('')}

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 20px; font-weight: bold;">GRAND TOTAL:</span>
              <span style="font-size: 28px; font-weight: bold;">${grandTotal.toFixed(2)} hours</span>
            </div>
          </div>

          <div class="footer">
            <p><strong>Black Point Protection</strong></p>
            <p>Richmond, VA | This report is for billing purposes</p>
            ${selectedLocationData?.site_email ? `<p>Site Contact: ${selectedLocationData.site_email}</p>` : ''}
          </div>
        </body>
        </html>
      `;

      await base44.integrations.Core.SendEmail({
        from_name: "Black Point Protection",
        to: selectedLocationData.assigned_client_email,
        subject: `Hours Report - ${selectedLocation} - ${format(new Date(startDate), 'MMM d')} to ${format(new Date(endDate), 'MMM d, yyyy')}`,
        body: reportHTML
      });
    },
    onSuccess: () => {
      alert('Report successfully sent to client!');
    },
    onError: (error) => {
      alert(`Error sending report: ${error.message}`);
    }
  });

  const hasAccess = user?.role === 'admin' || user?.additional_roles?.includes('support');

  const handlePayrollPeriodChange = (value) => {
    setSelectedPayrollPeriod(value);
    if (value && value !== "custom") {
      const period = payrollPeriods?.find(p => p.id === value);
      if (period) {
        setStartDate(period.start_date);
        setEndDate(period.end_date);
        setUseCustomDates(false);
      }
    } else if (value === "custom") {
      setUseCustomDates(true);
    }
  };

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

  const getOfficerPhone = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    return officer?.mobile_phone;
  };

  const calculateHours = (clockIn, clockOut) => {
    const diff = new Date(clockOut) - new Date(clockIn);
    return diff / 1000 / 60 / 60;
  };

  const getClientReportData = () => {
    const grouped = {};
    timeEntries?.forEach(entry => {
      if (!grouped[entry.officer_email]) {
        grouped[entry.officer_email] = {
          entries: [],
          totalHours: 0,
          regularHours: 0,
          overtimeHours: 0
        };
      }
      
      const hours = calculateHours(entry.clock_in, entry.clock_out);
      grouped[entry.officer_email].entries.push({
        ...entry,
        hours
      });
    });

    Object.keys(grouped).forEach(officer => {
      const totalHours = grouped[officer].entries.reduce((sum, e) => sum + e.hours, 0);
      grouped[officer].totalHours = totalHours;
      grouped[officer].regularHours = Math.min(totalHours, 40);
      grouped[officer].overtimeHours = Math.max(totalHours - 40, 0);
    });

    return grouped;
  };

  const handlePrint = () => {
    window.print();
  };

  const printClientReport = () => {
    const printWindow = window.open('', '', 'width=1000,height=800');
    
    const reportsHTML = clientReports?.map(report => {
      const reportType = report.type === 'shift' ? 'Shift Report' :
                        report.type === 'incident' ? 'Incident Report' :
                        report.type === 'trespass' ? 'Trespass Notice' :
                        report.type === 'parking' ? 'Parking Violation' :
                        report.type === 'maintenance' ? 'Maintenance Report' : 'Report';
      
      return `
        <div class="report-item">
          <div class="report-header">
            <div class="report-type">${reportType}</div>
            <div class="report-date">${format(new Date(report.date), 'MMM d, yyyy h:mm a')}</div>
          </div>
          <div class="report-body">
            <div class="report-field"><strong>Location:</strong> ${report.location}</div>
            <div class="report-field"><strong>Officer:</strong> ${report.officer_name}</div>
            ${report.description ? `<div class="report-field"><strong>Description:</strong> ${report.description}</div>` : ''}
            ${report.subject_name ? `<div class="report-field"><strong>Subject:</strong> ${report.subject_name}</div>` : ''}
            ${report.license_plate ? `<div class="report-field"><strong>Vehicle:</strong> ${report.license_plate}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Client Reports - ${selectedLocation}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.4in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 9pt; }
          .header { text-align: center; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 2px solid #000; page-break-after: avoid; }
          .logo { width: 50px; height: 50px; margin: 0 auto 6px; display: block; }
          .header h1 { font-size: 18pt; margin: 4px 0; }
          .header .site { font-size: 12pt; font-weight: bold; margin: 4px 0; }
          .report-item { margin: 8px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px; page-break-inside: avoid; }
          .report-header { display: flex; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
          .report-type { font-weight: bold; font-size: 10pt; }
          .report-date { font-size: 8pt; color: #666; }
          .report-body { padding-left: 8px; }
          .report-field { margin: 3px 0; font-size: 8pt; }
          .report-field strong { display: inline-block; width: 100px; }
          .footer { margin-top: 12px; padding-top: 8px; border-top: 2px solid #000; text-align: center; font-size: 8pt; }
          .page-header { display: none; }
          @media print {
            .page-header {
              display: block;
              position: running(header);
              text-align: center;
              padding: 6px 0;
              border-bottom: 1px solid #000;
            }
            @page { @top-center { content: element(header); } }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Client Activity Report</h1>
          <div class="site">${selectedLocation}</div>
          <div>${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}</div>
        </div>

        <div class="page-header">
          <strong>Client Report - ${selectedLocation}</strong> | ${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d, yyyy')}
        </div>

        ${reportsHTML || '<p style="text-align: center; padding: 20px;">No reports found</p>'}

        <div class="footer">
          <strong>BLACK POINT PROTECTION</strong> | Richmond, VA | Printed: ${format(new Date(), 'MMM d, yyyy h:mm a')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const reportData = getClientReportData();
  const grandTotal = Object.values(reportData).reduce((sum, d) => sum + d.totalHours, 0);
  
  const officersAtSelectedLocation = Array.from(new Set(
    timeEntries
      ?.filter(entry => entry.location.split(' - ')[0] === selectedLocation)
      .map(entry => entry.officer_email)
  )).map(email => allUsers?.find(u => u.email === email))
    .filter(Boolean)
    .sort((a, b) => a.first_name.localeCompare(b.first_name));

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-4 print:mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Client Reports</h1>
            <p className="text-slate-600">Generate hours and activity reports for client sites</p>
          </div>
        </div>

        <Card className="border-none shadow-lg print:hidden">
          <CardHeader>
            <CardTitle>Report Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Location *</Label>
                <Select 
                  value={selectedLocation} 
                  onValueChange={(value) => {
                    setSelectedLocation(value);
                    setSelectedOfficer('all');
                  }}
                >
                  <SelectTrigger>
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
                <Label>Officer</Label>
                <Select 
                  value={selectedOfficer} 
                  onValueChange={setSelectedOfficer}
                  disabled={!selectedLocation}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All officers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Officers</SelectItem>
                    {officersAtSelectedLocation.map((officer) => (
                      <SelectItem key={officer.id} value={officer.email}>
                        {getOfficerName(officer.email)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payroll Period</Label>
                <Select value={selectedPayrollPeriod} onValueChange={handlePayrollPeriodChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period or custom..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom Date Range</SelectItem>
                    {payrollPeriods?.map((period) => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.period_name} ({format(parseISO(period.start_date), 'M/d/yyyy')} - {format(parseISO(period.end_date), 'M/d/yyyy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(useCustomDates || !selectedPayrollPeriod) && (
              <div className="grid md:grid-cols-2 gap-4 mt-4">
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
            )}
            
            <div className="space-y-2 mt-4">
              <Label>Activity Report Type</Label>
              <Select 
                value={selectedReportType} 
                onValueChange={setSelectedReportType}
                disabled={!selectedLocation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="shift">Shift Report</SelectItem>
                  <SelectItem value="incident">Incident Report</SelectItem>
                  <SelectItem value="trespass">Trespass Notice</SelectItem>
                  <SelectItem value="parking">Parking Violation</SelectItem>
                  <SelectItem value="maintenance">Maintenance Report</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 mt-4 flex-wrap">
              <Button 
                onClick={handlePrint} 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!selectedLocation}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Hours Report
              </Button>
              <Button 
                onClick={printClientReport} 
                className="bg-green-600 hover:bg-green-700"
                disabled={!selectedLocation || isLoadingClientReports}
              >
                <FileText className="w-4 h-4 mr-2" />
                Print Activity Reports
              </Button>
              {selectedLocationData?.assigned_client_email && (
                <Button
                  onClick={() => emailReportToClientMutation.mutate()}
                  className="bg-purple-600 hover:bg-purple-700"
                  disabled={!selectedLocation || emailReportToClientMutation.isPending}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {emailReportToClientMutation.isPending ? 'Sending...' : 'Email to Client'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedLocation && (
          <div className="print:block">
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-slate-200">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">BLACK POINT PROTECTION</h2>
                  <p className="text-slate-600">Richmond, VA</p>
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">HOURS REPORT</h3>
                  <p className="text-lg font-semibold text-blue-900 mb-2">{selectedLocation}</p>
                  {selectedLocationData?.address && (
                    <p className="text-sm text-slate-600 mb-2">{selectedLocationData.address}</p>
                  )}
                  {selectedPeriodData && (
                    <p className="text-base font-semibold text-purple-900 mb-1">{selectedPeriodData.period_name}</p>
                  )}
                  <p className="text-slate-600">
                    {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')}
                  </p>
                  <p className="text-slate-600">
                    Generated: {format(new Date(), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>

              <div className="mb-6 bg-blue-50 p-4 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-blue-700 font-medium">Total Hours for Period</p>
                  <p className="text-3xl font-bold text-blue-900">{grandTotal.toFixed(2)} hours</p>
                  <p className="text-xs text-blue-600 mt-1">{Object.keys(reportData).length} officer(s)</p>
                </div>
              </div>

              <div className="space-y-6">
                {Object.entries(reportData).map(([officerEmail, data]) => {
                  const officerPhone = getOfficerPhone(officerEmail);
                  return (
                    <div key={officerEmail} className="border-t-2 border-slate-200 pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <h4 className="text-lg font-bold text-slate-900">{getOfficerName(officerEmail)}</h4>
                          {officerPhone && (
                            <a
                              href={`tel:${officerPhone}`}
                              className="text-green-600 hover:text-green-700 print:hidden"
                              title={`Call ${getOfficerName(officerEmail)}`}
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-900">{data.totalHours.toFixed(2)} hrs</p>
                          {data.overtimeHours > 0 && (
                            <p className="text-sm text-orange-600 font-semibold">
                              +{data.overtimeHours.toFixed(2)} OT hrs
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">Clock In</th>
                              <th className="text-left p-2">Clock Out</th>
                              <th className="text-right p-2">Hours</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.entries.map((entry) => (
                              <tr key={entry.id} className="border-b border-slate-100">
                                <td className="p-2">{format(new Date(entry.clock_in), 'MMM d, yyyy')}</td>
                                <td className="p-2">{format(new Date(entry.clock_in), 'h:mm a')}</td>
                                <td className="p-2">{format(new Date(entry.clock_out), 'h:mm a')}</td>
                                <td className="p-2 text-right font-medium">{entry.hours.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100 font-semibold">
                              <td colSpan="3" className="p-2 text-right">Subtotal:</td>
                              <td className="p-2 text-right">{data.totalHours.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>

              {Object.keys(reportData).length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Clock className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p>No time entries found for this location and period</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t-2 border-slate-200">
                <div className="bg-slate-50 p-4 rounded">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-slate-900">GRAND TOTAL:</span>
                    <span className="text-2xl font-bold text-slate-900">{grandTotal.toFixed(2)} hours</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-200 text-center text-sm text-slate-500">
                <p>Black Point Protection</p>
                <p>Richmond, VA | This report is for billing purposes</p>
                {selectedLocationData?.site_email && (
                  <p>Site Contact: {selectedLocationData.site_email}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {!selectedLocation && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 text-lg">Please select a location to generate the report</p>
            </CardContent>
          </Card>
        )}
      </div>

      <style>{`
        @media print {
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
        }
      `}</style>
    </div>
  );
}
