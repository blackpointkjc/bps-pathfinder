import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertTriangle, Printer, Filter, FileText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

export default function AdminPTOLossReport() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [selectedOfficers, setSelectedOfficers] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [dateRangeMode, setDateRangeMode] = useState("year");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedOfficerEmail, setSelectedOfficerEmail] = useState("all");
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [detailedOfficer, setDetailedOfficer] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hrRoles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasHRAccess = user?.role === 'admin' || hrRoles.has('hr') || hrRoles.has('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';

  const { data: allUsers = [] } = useQuery({
    queryKey: ['hrUsers', 'ptoLoss'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getHRUsers', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.users || [];
    },
    enabled: hasHRAccess,
    initialData: [],
  });


  const { data: timeEntries = [] } = useQuery({
    queryKey: ['allTimeEntries', selectedYear],
    queryFn: async () => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.entries || [];
    },
    enabled: hasHRAccess,
    initialData: [],
  });

  const { data: callOuts = [] } = useQuery({
    queryKey: ['allCallOuts', selectedYear],
    queryFn: async () => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.call_outs || [];
    },
    enabled: hasHRAccess,
    initialData: [],
  });

  // Calculate PTO based on actual time entries for the selected date range
  const calculatePTOFromTimeEntries = (officerEmail, startDateStr, endDateStr) => {
    if (!timeEntries || !callOuts) return { accrued: 0, callOutDays: 0, shifts: [] };

    const start = startDateStr ? new Date(startDateStr) : new Date(`${selectedYear}-01-01T00:00:00`);
    const end = endDateStr ? new Date(endDateStr) : new Date(`${selectedYear}-12-31T23:59:59`);
    end.setHours(23, 59, 59, 999);

    // Filter time entries for this officer in the selected date range
    const officerEntries = timeEntries.filter(entry => {
      if (entry.officer_email !== officerEmail) return false;
      if (!entry.clock_in || !entry.clock_out) return false;
      
      const clockInDate = new Date(entry.clock_in);
      return clockInDate >= start && clockInDate <= end;
    });

    // Filter call-outs for this officer in the selected date range
    const officerCallOuts = callOuts.filter(co => {
      if (co.officer_email !== officerEmail) return false;
      if (!co.affects_pto) return false;
      
      const callOutDate = new Date(co.call_out_date);
      return callOutDate >= start && callOutDate <= end;
    });

    // Get unique dates with call-outs
    const callOutDates = new Set(
      officerCallOuts.map(co => co.call_out_date)
    );

    // Calculate hours worked per day and store shift details
    const dailyHours = {};
    const shifts = [];
    
    officerEntries.forEach(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      const dateKey = clockIn.toISOString().split('T')[0];
      
      const hours = (clockOut - clockIn) / (1000 * 60 * 60);
      dailyHours[dateKey] = (dailyHours[dateKey] || 0) + hours;
      
      shifts.push({
        date: dateKey,
        clockIn: entry.clock_in,
        clockOut: entry.clock_out,
        hours: hours,
        location: entry.location,
        isCallOutDay: callOutDates.has(dateKey)
      });
    });

    // Count days worked 8+ hours (excluding call-out days)
    let daysWorked = 0;
    Object.entries(dailyHours).forEach(([date, hours]) => {
      if (hours >= 8 && !callOutDates.has(date)) {
        daysWorked++;
      }
    });

    // PTO accrual: 4 hours per full day worked (8+ hours)
    const accrued = daysWorked * 4;

    return {
      accrued,
      callOutDays: callOutDates.size,
      daysWorked,
      shifts: shifts.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn))
    };
  };

  const getDateRange = () => {
    if (dateRangeMode === "custom" && startDate && endDate) {
      return { start: startDate, end: endDate };
    }
    return { 
      start: `${selectedYear}-01-01`, 
      end: `${selectedYear}-12-31` 
    };
  };

  const officersWithPTOLoss = useMemo(() => {
    if (!allUsers || !timeEntries || !callOuts) return [];
    
    const { start, end } = getDateRange();
    
    return allUsers
      .filter(u => u.first_name && u.last_name && u.email)
      .filter(u => selectedOfficerEmail === "all" || u.email === selectedOfficerEmail)
      .map(u => {
        const { accrued, callOutDays, daysWorked, shifts } = calculatePTOFromTimeEntries(u.email, start, end);
        const used = u.pto_year_to_date_used || 0;
        const actualBalance = accrued - used;
        const cappedBalance = Math.min(actualBalance, 40);
        const hoursLost = Math.max(0, actualBalance - cappedBalance);
        
        return {
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          accrued,
          used,
          actualBalance,
          cappedBalance,
          hoursLost,
          division: u.division,
          subdivision: u.subdivision,
          callOutDays,
          daysWorked,
          shifts
        };
      })
      .filter(officer => officer.hoursLost > 0)
      .sort((a, b) => b.hoursLost - a.hoursLost);
  }, [allUsers, timeEntries, callOuts, selectedYear, dateRangeMode, startDate, endDate, selectedOfficerEmail]);

  const filteredOfficers = useMemo(() => {
    return officersWithPTOLoss.filter(officer => {
      const matchesSearch = officer.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDivision = selectedDivision === "all" || officer.division === selectedDivision;
      return matchesSearch && matchesDivision;
    });
  }, [officersWithPTOLoss, searchTerm, selectedDivision]);

  const totalHoursLost = useMemo(() => {
    return filteredOfficers.reduce((sum, o) => sum + o.hoursLost, 0);
  }, [filteredOfficers]);

  const divisions = useMemo(() => {
    const divs = new Set(officersWithPTOLoss.map(o => o.division).filter(Boolean));
    return Array.from(divs).sort();
  }, [officersWithPTOLoss]);



  const toggleOfficerSelection = (email) => {
    setSelectedOfficers(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  const selectAll = () => {
    setSelectedOfficers(filteredOfficers.map(o => o.email));
  };

  const deselectAll = () => {
    setSelectedOfficers([]);
  };

  const printIndividualReport = (officer) => {
    const { start, end } = getDateRange();
    const printWindow = window.open('', '_blank');
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PTO Accrual Report - ${officer.name}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #1e293b;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #3b82f6;
            margin: 0 0 10px 0;
            font-size: 28px;
          }
          .summary {
            background: #f1f5f9;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-top: 15px;
          }
          .summary-item {
            text-align: center;
          }
          .summary-label {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 5px;
          }
          .summary-value {
            font-size: 24px;
            font-weight: bold;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 12px;
            text-align: left;
          }
          th {
            background: #f1f5f9;
            font-weight: bold;
            color: #0f172a;
          }
          tr:nth-child(even) {
            background: #f9fafb;
          }
          .call-out-day {
            background: #fef2f2 !important;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            color: #64748b;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PTO ACCRUAL REPORT</h1>
          <p>${officer.name}</p>
          <p>Report Period: ${format(new Date(start), 'MMM d, yyyy')} - ${format(new Date(end), 'MMM d, yyyy')}</p>
          <p>Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>

        <div class="summary">
          <h2 style="margin: 0 0 15px 0; color: #0f172a;">Accrual Summary</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Days Worked</div>
              <div class="summary-value">${officer.daysWorked}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">PTO Accrued</div>
              <div class="summary-value" style="color: #22c55e;">${officer.accrued.toFixed(1)} hrs</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Call-Out Days</div>
              <div class="summary-value" style="color: #ef4444;">${officer.callOutDays}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">PTO Used</div>
              <div class="summary-value">${officer.used.toFixed(1)} hrs</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Current Balance</div>
              <div class="summary-value" style="color: #3b82f6;">${officer.actualBalance.toFixed(1)} hrs</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Hours Lost</div>
              <div class="summary-value" style="color: #dc2626;">${officer.hoursLost.toFixed(1)} hrs</div>
            </div>
          </div>
        </div>

        <h3 style="margin: 30px 0 10px 0;">Detailed Shift History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Hours</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${officer.shifts.map(shift => `
              <tr class="${shift.isCallOutDay ? 'call-out-day' : ''}">
                <td>${format(new Date(shift.date), 'MM/dd/yyyy')}</td>
                <td>${format(new Date(shift.clockIn), 'h:mm a')}</td>
                <td>${format(new Date(shift.clockOut), 'h:mm a')}</td>
                <td>${shift.hours.toFixed(2)}</td>
                <td>${shift.location || 'N/A'}</td>
                <td>${shift.isCallOutDay ? '<strong style="color: #dc2626;">NO PTO (Call-Out)</strong>' : shift.hours >= 8 ? '<strong style="color: #22c55e;">+4 hrs PTO</strong>' : 'No PTO (&lt;8hrs)'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Confidential Document - Internal Use Only</p>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PTO Loss Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #1e293b;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #dc2626;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #dc2626;
            margin: 0 0 10px 0;
            font-size: 28px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 12px;
            text-align: left;
          }
          th {
            background: #f1f5f9;
            font-weight: bold;
            color: #0f172a;
          }
          tr:nth-child(even) {
            background: #f9fafb;
          }
          .summary {
            background: #fef2f2;
            border: 2px solid #fca5a5;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .summary h2 {
            color: #dc2626;
            margin: 0 0 10px 0;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            color: #64748b;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⚠️ PTO LOSS REPORT</h1>
          <p>Officers Exceeding 40-Hour Carryover Cap</p>
          <p>Generated: ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="summary">
          <h2>Total PTO Hours Lost: ${totalHoursLost.toFixed(1)} hours</h2>
          <p>${officersWithPTOLoss.length} officer(s) affected</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Officer Name</th>
              <th>Division</th>
              <th>Accrued</th>
              <th>Used</th>
              <th>Actual Balance</th>
              <th>Capped Balance</th>
              <th>Hours Lost</th>
            </tr>
          </thead>
          <tbody>
            ${officersWithPTOLoss.map(officer => `
              <tr>
                <td><strong>${officer.name}</strong></td>
                <td>${officer.division || 'N/A'}${officer.subdivision ? ` - ${officer.subdivision}` : ''}</td>
                <td>${officer.accrued.toFixed(1)} hrs</td>
                <td>${officer.used.toFixed(1)} hrs</td>
                <td>${officer.actualBalance.toFixed(1)} hrs</td>
                <td>${officer.cappedBalance.toFixed(1)} hrs</td>
                <td style="color: #dc2626; font-weight: bold;">${officer.hoursLost.toFixed(1)} hrs</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Confidential Document - Internal Use Only</p>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('hr')) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">HR or Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="pto-loss-page p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">PTO Accrual & Loss Report</h1>
                <p className="text-slate-600">
                  {dateRangeMode === "custom" && startDate && endDate 
                    ? `${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}`
                    : `Based on actual time entries for ${selectedYear}`
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowDetailedView(!showDetailedView)} variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                {showDetailedView ? 'Summary View' : 'Detailed View'}
              </Button>
              <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
                <Printer className="w-4 h-4 mr-2" />
                Print Report
              </Button>
            </div>
          </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
              <div className="grid md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Select value={dateRangeMode} onValueChange={(val) => {
                    setDateRangeMode(val);
                    if (val === "year") {
                      setStartDate("");
                      setEndDate("");
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="year">By Year</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {dateRangeMode === "year" ? (
                  <div className="space-y-2">
                    <Label>Report Year</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => {
                          const year = new Date().getFullYear() - i;
                          return (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              <div className="space-y-2">
                <Label>Select Officer</Label>
                <Select value={selectedOfficerEmail} onValueChange={setSelectedOfficerEmail}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Officers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Officers</SelectItem>
                    {allUsers?.filter(u => u.first_name && u.last_name).map(u => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.first_name} {u.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search Name</Label>
                <Input
                  placeholder="Filter by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Divisions</SelectItem>
                    {divisions.map(div => (
                      <SelectItem key={div} value={div}>{div}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Selection</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Select All ({filteredOfficers.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-red-50 rounded-lg border-2 border-red-200">
                <p className="text-sm text-slate-600 mb-2">Total Hours Lost</p>
                <p className="text-4xl font-bold text-red-600">{totalHoursLost.toFixed(1)}</p>
                <p className="text-xs text-slate-500 mt-1">From filtered officers</p>
              </div>
              <div className="text-center p-6 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="text-sm text-slate-600 mb-2">Officers Shown</p>
                <p className="text-4xl font-bold text-orange-600">{filteredOfficers.length}</p>
                <p className="text-xs text-slate-500 mt-1">of {officersWithPTOLoss.length} total</p>
              </div>
              <div className="text-center p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
                <p className="text-sm text-slate-600 mb-2">Carryover Cap</p>
                <p className="text-4xl font-bold text-blue-600">40</p>
                <p className="text-xs text-slate-500 mt-1">hours maximum</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {filteredOfficers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">
                  {officersWithPTOLoss.length === 0 
                    ? "No officers currently exceeding 40-hour cap"
                    : "No officers match the current filters"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 w-12">
                        <input
                          type="checkbox"
                          checked={selectedOfficers.length === filteredOfficers.length && filteredOfficers.length > 0}
                          onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                          className="w-4 h-4"
                        />
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Officer Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Division</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Days Worked</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Call-Outs</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Accrued</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Used</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Actual Balance</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Capped Balance</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Hours Lost</th>
                      {showDetailedView && <th className="text-center py-3 px-4 font-semibold text-slate-700">Actions</th>}
                      </tr>
                      </thead>
                      <tbody>
                      {filteredOfficers.map((officer, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedOfficers.includes(officer.email)}
                            onChange={() => toggleOfficerSelection(officer.email)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <button 
                            onClick={() => setDetailedOfficer(officer)}
                            className="hover:text-blue-600 flex items-center gap-1"
                          >
                            {officer.name}
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {officer.division || 'N/A'}
                          {officer.subdivision && ` - ${officer.subdivision}`}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">{officer.daysWorked || 0}</td>
                        <td className="py-3 px-4 text-right text-red-600">{officer.callOutDays || 0}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{officer.accrued.toFixed(1)} hrs</td>
                        <td className="py-3 px-4 text-right text-slate-600">{officer.used.toFixed(1)} hrs</td>
                        <td className="py-3 px-4 text-right text-slate-600">{officer.actualBalance.toFixed(1)} hrs</td>
                        <td className="py-3 px-4 text-right text-green-600 font-medium">{officer.cappedBalance.toFixed(1)} hrs</td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                            {officer.hoursLost.toFixed(1)} hrs
                          </Badge>
                        </td>
                        {showDetailedView && (
                          <td className="py-3 px-4 text-center">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => printIndividualReport(officer)}
                            >
                              <Printer className="w-3 h-3 mr-1" />
                              Print
                            </Button>
                          </td>
                        )}
                        </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailedOfficer} onOpenChange={() => setDetailedOfficer(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Detailed PTO Report - {detailedOfficer?.name}</span>
              <Button size="sm" onClick={() => printIndividualReport(detailedOfficer)}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </DialogTitle>
          </DialogHeader>
          {detailedOfficer && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-slate-600">Days Worked</p>
                    <p className="text-2xl font-bold text-slate-900">{detailedOfficer.daysWorked}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-slate-600">PTO Accrued</p>
                    <p className="text-2xl font-bold text-green-600">{detailedOfficer.accrued.toFixed(1)} hrs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-slate-600">Call-Out Days</p>
                    <p className="text-2xl font-bold text-red-600">{detailedOfficer.callOutDays}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Shift History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b-2">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold">Date</th>
                          <th className="text-left py-2 px-3 font-semibold">Clock In</th>
                          <th className="text-left py-2 px-3 font-semibold">Clock Out</th>
                          <th className="text-right py-2 px-3 font-semibold">Hours</th>
                          <th className="text-left py-2 px-3 font-semibold">Location</th>
                          <th className="text-center py-2 px-3 font-semibold">PTO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedOfficer.shifts.map((shift, idx) => (
                          <tr 
                            key={idx} 
                            className={`border-b ${shift.isCallOutDay ? 'bg-red-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="py-2 px-3">{format(new Date(shift.date), 'MM/dd/yyyy')}</td>
                            <td className="py-2 px-3">{format(new Date(shift.clockIn), 'h:mm a')}</td>
                            <td className="py-2 px-3">{format(new Date(shift.clockOut), 'h:mm a')}</td>
                            <td className="py-2 px-3 text-right font-medium">{shift.hours.toFixed(2)}</td>
                            <td className="py-2 px-3">{shift.location || 'N/A'}</td>
                            <td className="py-2 px-3 text-center">
                              {shift.isCallOutDay ? (
                                <Badge className="bg-red-600 text-white text-xs">NO PTO</Badge>
                              ) : shift.hours >= 8 ? (
                                <Badge className="bg-green-600 text-white text-xs">+4 hrs</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">-</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
      );
      }