import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Printer, DollarSign, Clock, Phone, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { calculatePaidHours } from "@/lib/payrollCalculations";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function AdminPayroll() {
  const [reportMode, setReportMode] = useState("payroll"); // "payroll" or "client"
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState("all");
  const [selectedPayrollPeriod, setSelectedPayrollPeriod] = useState("");
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [useCustomDates, setUseCustomDates] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('accounting'),
  });

  const { data: locations } = useQuery({
    queryKey: ['allLocations'],
    queryFn: () => listDirectoryLocations('site_name'),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('accounting'),
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      // Only show periods that have started (current and past)
      const today = format(new Date(), 'yyyy-MM-dd');
      return periods.filter(p => p.start_date <= today);
    },
  });

  const { data: expenseReports } = useQuery({
    queryKey: ['approvedExpenses', startDate, endDate, selectedOfficer, selectedLocation, reportMode],
    queryFn: async () => {
      const expenses = await base44.entities.ExpenseReport.list('-expense_date');
      return expenses.filter(e => {
        // Only include approved or reimbursed expenses
        const isApproved = e.status === 'approved' || e.status === 'reimbursed';
        // Check if expense date falls within the payroll period
        const dateMatch = e.expense_date >= startDate && e.expense_date <= endDate;
        // Filter by officer if specific officer selected
        const officerMatch = selectedOfficer === 'all' || e.officer_email === selectedOfficer;
        
        return isApproved && dateMatch && officerMatch;
      });
    },
    enabled: (user?.role === 'admin' || user?.additional_roles?.includes('accounting')) && !!startDate && !!endDate,
  });

  // Handle payroll period selection
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
      // When switching to custom, ensure start/end dates are populated
      if (!startDate && !endDate) {
        setStartDate(format(startOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
        setEndDate(format(endOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
      }
    }
  };

  const { data: ptoUsage = [] } = useQuery({
    queryKey: ['payrollPtoUsage', selectedOfficer, startDate, endDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPayrollPTOUsage', {
        start_date: startDate,
        end_date: endDate,
        officer_email: selectedOfficer,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.usage || [];
    },
    enabled: (user?.role === 'admin' || user?.additional_roles?.includes('accounting')) && !!startDate && !!endDate,
    refetchInterval: 10000,
  });

  const { data: timeEntries } = useQuery({
    queryKey: ['payrollTimeEntries', selectedOfficer, startDate, endDate, selectedLocation, reportMode],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-clock_in');
      
      // Filter entries based on clock-in time
      return entries.filter(entry => {
        if (!entry.clock_out || !entry.clock_in) return false;
        
        try {
          const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
          const dateMatch = clockInDate >= startDate && clockInDate <= endDate;
          const officerMatch = selectedOfficer === 'all' || entry.officer_email === selectedOfficer;
          
          // For client mode, exclude support staff entries (office administrative only)
          if (reportMode === 'client') {
            if (!selectedLocation) return false;
            const siteName = entry.location?.split(' - ')[0];
            const isOfficeEntry = entry.location?.includes('Office - Administrative');
            return dateMatch && officerMatch && siteName === selectedLocation && !isOfficeEntry;
          }
          
          // For employee payroll, include all entries (field officers + support staff)
          return dateMatch && officerMatch;
        } catch (e) {
          console.error('Error parsing date:', entry.clock_in, e);
          return false;
        }
      });
    },
    enabled: (user?.role === 'admin' || user?.additional_roles?.includes('accounting')) && !!startDate && !!endDate,
  });

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    // Return email if user no longer exists (for compliance/historical records)
    return email;
  };

  const getOfficerPhone = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    return officer?.mobile_phone;
  };

  const getOfficerRate = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    return officer?.hourly_rate || 0;
  };

  const isHoliday = (date) => {
    const d = typeof date === 'string' ? parseISO(date) : date;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dayOfWeek = d.getDay();
    const weekOfMonth = Math.ceil(day / 7);

    // New Year's Day – January 1
    if (month === 1 && day === 1) return 'New Year\'s Day';
    
    // Martin Luther King Jr. Day – Third Monday in January
    if (month === 1 && dayOfWeek === 1 && weekOfMonth === 3) return 'Martin Luther King Jr. Day';
    
    // Juneteenth – June 19
    if (month === 6 && day === 19) return 'Juneteenth';
    
    // Independence Day – July 4
    if (month === 7 && day === 4) return 'Independence Day';
    
    // Thanksgiving – Fourth Thursday in November
    if (month === 11 && dayOfWeek === 4 && weekOfMonth === 4) return 'Thanksgiving Day';
    
    // Christmas – December 25
    if (month === 12 && day === 25) return 'Christmas Day';
    
    return null;
  };

  const getPayrollData = () => {
    const filtered = timeEntries; 

    const grouped = {};
    filtered?.forEach(entry => {
      if (!grouped[entry.officer_email]) {
        grouped[entry.officer_email] = {
          entries: [],
          locationBreakdown: {}
        };
      }
      
      const hours = calculatePaidHours(entry);
      const locationName = entry.location ? entry.location.split(' - ')[0] : 'N/A';
      
      grouped[entry.officer_email].entries.push({
        ...entry,
        hours
      });

      if (!grouped[entry.officer_email].locationBreakdown[locationName]) {
        grouped[entry.officer_email].locationBreakdown[locationName] = 0;
      }
      grouped[entry.officer_email].locationBreakdown[locationName] += hours;
    });

    // PTO is paid time, not worked time. Create payroll groups for PTO-only
    // employees without adding these hours to weekly worked-hour overtime totals.
    (ptoUsage || []).forEach(usage => {
      const email = String(usage.officer_email || '').toLowerCase();
      if (!email) return;
      if (!grouped[email]) grouped[email] = { entries: [], locationBreakdown: {} };
      if (!grouped[email].ptoEntries) grouped[email].ptoEntries = [];
      grouped[email].ptoEntries.push(usage);
    });

    // Helper function: Determine which payroll week a clock-in time belongs to
    // Payroll week runs Sunday 12:00 AM through Saturday 11:59:59 PM
    const getPayrollWeekStart = (clockInTime) => {
      if (!clockInTime) return null;
      
      const dt = typeof clockInTime === 'string' ? parseISO(clockInTime) : new Date(clockInTime);
      const dayOfWeek = dt.getDay(); // 0 = Sunday, 6 = Saturday
      
      const weekStart = new Date(dt);
      weekStart.setDate(weekStart.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0); // Sunday 12:00 AM
      
      return weekStart;
    };

    // Calculate overtime per payroll week for each officer
    Object.keys(grouped).forEach(officer => {
      // Group entries by payroll week
      const weeklyHours = {};
      
      grouped[officer].entries.forEach(entry => {
        if (!entry.clock_in) return;

        // Determine which payroll week this entry belongs to (based on clock-in)
        const weekStart = getPayrollWeekStart(entry.clock_in);
        if (!weekStart) return;
        
        const weekKey = weekStart.toISOString();
        
        if (!weeklyHours[weekKey]) {
          weeklyHours[weekKey] = 0;
        }
        
        weeklyHours[weekKey] += entry.hours;
      });
      
      // Calculate regular and overtime based on 40-hour weekly threshold
      let totalOvertimeHours = 0;
      let totalRegularHours = 0;
      
      Object.values(weeklyHours).forEach(weekHours => {
        if (weekHours > 40) {
          totalRegularHours += 40;
          totalOvertimeHours += (weekHours - 40);
        } else {
          totalRegularHours += weekHours;
        }
      });
      
      const workedHours = totalRegularHours + totalOvertimeHours;
      const ptoHours = (grouped[officer].ptoEntries || []).reduce((sum, usage) => sum + Number(usage.hours || 0), 0);
      const totalHours = workedHours + ptoHours;
      grouped[officer].workedHours = workedHours;
      grouped[officer].ptoHours = ptoHours;
      grouped[officer].totalHours = totalHours;
      grouped[officer].regularHours = totalRegularHours;
      grouped[officer].overtimeHours = totalOvertimeHours;

      // Calculate holiday hours - only for time worked ON the actual holiday day (12:01 AM - 11:59 PM)
      // Check all days in shift span, not just clock-in day
      let holidayHours = 0;
      const holidayDetails = [];
      grouped[officer].entries.forEach(entry => {
        const clockIn = parseISO(entry.clock_in);
        const clockOut = parseISO(entry.clock_out);
        
        // Check all days between clock in and clock out for holidays
        let currentDate = new Date(clockIn);
        currentDate.setHours(0, 0, 0, 0);
        const endDate = new Date(clockOut);
        endDate.setHours(0, 0, 0, 0);
        
        while (currentDate <= endDate) {
          const holiday = isHoliday(currentDate);
          if (holiday) {
            // Calculate only the portion of hours that fall within this holiday day
            const holidayStart = new Date(currentDate);
            holidayStart.setHours(0, 0, 1, 0); // 12:01 AM of the holiday
            
            const holidayEnd = new Date(currentDate);
            holidayEnd.setHours(23, 59, 59, 999); // 11:59:59 PM of the holiday
            
            // Determine the overlap between shift and holiday day
            const effectiveStart = clockIn > holidayStart ? clockIn : holidayStart;
            const effectiveEnd = clockOut < holidayEnd ? clockOut : holidayEnd;
            
            if (effectiveEnd > effectiveStart) {
              const hoursOnHoliday = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
              holidayHours += hoursOnHoliday;
              holidayDetails.push({ date: new Date(currentDate), name: holiday, hours: hoursOnHoliday });
            }
          }
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });
      grouped[officer].holidayHours = holidayHours;
      grouped[officer].holidayDetails = holidayDetails;

      // Calculate pay
      const hourlyRate = getOfficerRate(officer);
      const overtimeRate = hourlyRate * 1.5;
      const holidayRate = hourlyRate * 1.25;
      const regularPay = totalRegularHours * hourlyRate;
      const overtimePay = totalOvertimeHours * overtimeRate;
      const holidayPay = holidayHours * holidayRate; // Holiday pay is 1.25x rate
      const ptoPay = ptoHours * hourlyRate; // PTO is always straight-time pay.
      const totalPay = regularPay + overtimePay + holidayPay + ptoPay;
      
      grouped[officer].hourlyRate = hourlyRate;
      grouped[officer].overtimeRate = overtimeRate;
      grouped[officer].holidayRate = holidayRate;
      grouped[officer].regularPay = regularPay;
      grouped[officer].overtimePay = overtimePay;
      grouped[officer].holidayPay = holidayPay;
      grouped[officer].ptoPay = ptoPay;
      grouped[officer].totalPay = totalPay;

      // Add approved expenses for this officer
      const officerExpenses = expenseReports?.filter(exp => exp.officer_email === officer) || [];
      const totalExpenses = officerExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      grouped[officer].expenses = officerExpenses;
      grouped[officer].totalExpenses = totalExpenses;
      grouped[officer].totalPay = totalPay + totalExpenses; // Add expenses to total pay
    });

    return grouped;
  };

  const printPayrollReport = () => {
    const reportData = getPayrollData();
    const grandTotalRegular = Object.values(reportData).reduce((sum, d) => sum + d.regularHours, 0);
    const grandTotalOvertime = Object.values(reportData).reduce((sum, d) => sum + d.overtimeHours, 0);
    const grandTotalHoliday = Object.values(reportData).reduce((sum, d) => sum + (d.holidayHours || 0), 0);
    const grandTotalPTO = Object.values(reportData).reduce((sum, d) => sum + (d.ptoHours || 0), 0);
    const grandTotalExpenses = Object.values(reportData).reduce((sum, d) => sum + (d.totalExpenses || 0), 0);
    const grandTotalPay = Object.values(reportData).reduce((sum, d) => sum + (d.totalPay || 0), 0);

    const printWindow = window.open('', '', 'width=1000,height=800');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportMode === 'client' ? 'Client' : 'Payroll'} Report</title>
        <style>
          @page { size: 11in 8.5in landscape; margin: 0.3in; }
          @media print { 
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .officer-section { page-break-inside: avoid; }
            .officer-section:first-of-type { page-break-before: avoid; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.2; color: #1a1a1a; }

          .report-container { border: 2px solid #1e40af; border-radius: 6px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 12px; text-align: center; }
          .logo { width: 140px; height: auto; object-fit: contain; margin: 0 auto 6px; }
          .title { font-size: 16pt; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 3px; }
          .subtitle { font-size: 10pt; opacity: 0.95; }
          .dcjs { font-size: 7pt; margin-top: 4px; opacity: 0.9; }

          .meta-bar { background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
          .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
          .meta-label { font-size: 7pt; font-weight: 600; color: #64748b; display: block; margin-bottom: 1px; }
          .meta-value { font-size: 9pt; font-weight: bold; color: #1e40af; }

          .summary-section { background: #dbeafe; padding: 8px; margin: 8px 0; border-radius: 4px; }
          .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; text-align: center; }
          .summary-label { font-size: 7pt; color: #1e40af; font-weight: 600; }
          .summary-value { font-size: 14pt; font-weight: bold; color: #1e3a8a; margin-top: 2px; }

          .officer-section { page-break-inside: avoid; margin: 10px; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; }
          .officer-header { background: #f1f5f9; padding: 6px; border-radius: 3px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
          .officer-name { font-size: 10pt; font-weight: bold; color: #1e293b; }
          .officer-hours { text-align: right; }
          .officer-hours .total { font-size: 12pt; font-weight: bold; color: #1e40af; }
          .officer-hours .detail { font-size: 7pt; color: #64748b; }

          .info-box { background: #f1f5f9; padding: 6px; border-radius: 3px; margin-bottom: 6px; }
          .info-box-title { font-weight: 600; font-size: 7.5pt; margin-bottom: 3px; }
          .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px; }
          .info-card { background: white; padding: 3px; border-radius: 2px; font-size: 7pt; }

          table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 7pt; }
          thead { background: #f8fafc; }
          th { padding: 4px; text-align: left; font-size: 7pt; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
          td { padding: 3px 4px; font-size: 7pt; border-bottom: 1px solid #f1f5f9; }

          .footer { background: #1e293b; color: white; padding: 8px; text-align: center; font-size: 7pt; margin-top: 10px; border-radius: 0 0 4px 4px; }
          .footer strong { font-size: 8pt; display: block; margin-bottom: 3px; }
        </style>
      </head>
      <body>
        <div class="report-container">
          <div class="header">
            <div class="title">${reportMode === 'client' ? 'CLIENT HOURS REPORT' : 'PAYROLL REPORT'}</div>
            <div class="subtitle">${reportMode === 'client' && selectedLocation ? selectedLocation : 'All Officers'}</div>
          </div>
          
          <div class="meta-bar">
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Period</span>
                <span class="meta-value">${format(parseISO(startDate), 'MMM d, yyyy')} - ${format(parseISO(endDate), 'MMM d, yyyy')}</span>
              </div>
              ${selectedPeriodData ? `
              <div class="meta-item">
                <span class="meta-label">Payroll Period</span>
                <span class="meta-value">${selectedPeriodData.period_name}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">💰 Direct Deposit Date</span>
                <span class="meta-value" style="color: #16a34a;">${format(parseISO(selectedPeriodData.deposit_date), 'EEEE, MMM d, yyyy')}</span>
              </div>
              ` : ''}
              <div class="meta-item">
                <span class="meta-label">Generated</span>
                <span class="meta-value">${format(new Date(), 'M/d/yyyy h:mm a')}</span>
              </div>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-grid">
              <div>
                <div class="summary-label">Regular Hours</div>
                <div class="summary-value">${grandTotalRegular.toFixed(2)}</div>
              </div>
              <div>
                <div class="summary-label">Overtime Hours</div>
                <div class="summary-value" style="color: #ea580c;">${grandTotalOvertime.toFixed(2)}</div>
              </div>
              <div>
                <div class="summary-label">Holiday Hours</div>
                <div class="summary-value" style="color: #16a34a;">${grandTotalHoliday.toFixed(2)}</div>
              </div>
              <div>
                <div class="summary-label">PTO Hours</div>
                <div class="summary-value" style="color: #7c3aed;">${grandTotalPTO.toFixed(2)}</div>
              </div>
              <div>
                <div class="summary-label">Expenses</div>
                <div class="summary-value" style="color: #8b5cf6;">$${grandTotalExpenses.toFixed(2)}</div>
              </div>
              <div>
                <div class="summary-label">Total Payroll</div>
                <div class="summary-value" style="color: #1e40af;">$${grandTotalPay.toFixed(2)}</div>
              </div>
            </div>
          </div>

          ${Object.entries(reportData).map(([officerEmail, data]) => {
            const phone = getOfficerPhone(officerEmail);
            return `
            <div class="officer-section">
              <div class="officer-header">
                <div>
                  <div class="officer-name">${getOfficerName(officerEmail)}</div>
                  <div style="font-size: 8pt; color: #64748b; margin-top: 3px;">${officerEmail}${phone ? ` | ${phone}` : ''}</div>
                </div>
                <div class="officer-hours">
                  <div class="total">${data.totalHours.toFixed(2)} hrs | $${(data.totalPay || 0).toFixed(2)}</div>
                  <div class="detail">
                    Reg: ${data.regularHours.toFixed(2)} @ $${(data.hourlyRate || 0).toFixed(2)}
                    ${data.overtimeHours > 0 ? `| OT: ${data.overtimeHours.toFixed(2)} @ $${(data.overtimeRate || 0).toFixed(2)}` : ''}
                    ${data.holidayHours > 0 ? `| Holiday: ${data.holidayHours.toFixed(2)}` : ''}
                    ${data.ptoHours > 0 ? `| PTO: ${data.ptoHours.toFixed(2)} @ $${(data.hourlyRate || 0).toFixed(2)} straight time` : ''}
                  </div>
                </div>
              </div>
              
              ${data.ptoHours > 0 ? `
              <div class="info-box" style="background:#f5f3ff;border:1px solid #c4b5fd;">
                <div class="info-box-title" style="color:#6d28d9;">PTO: ${data.ptoHours.toFixed(2)}h @ $${(data.hourlyRate || 0).toFixed(2)}/hr straight time = $${(data.ptoPay || 0).toFixed(2)}</div>
                <div style="font-size:7pt;color:#6b7280;margin-top:3px;">PTO is paid time only. It is excluded from worked-hour overtime calculations.</div>
              </div>
              ` : ''}

              ${data.holidayDetails && data.holidayDetails.length > 0 ? `
              <div class="info-box" style="background: #dcfce7; border: 1px solid #86efac;">
                <div class="info-box-title" style="color: #16a34a;">🎉 Holiday: ${data.holidayHours.toFixed(2)}h @ $${(data.holidayRate || 0).toFixed(2)}/hr = $${(data.holidayPay || 0).toFixed(2)}</div>
                <div class="info-grid">
                  ${data.holidayDetails.map(h => `
                    <div class="info-card">
                      <div style="font-weight: bold;">${h.name}</div>
                      <div style="color: #16a34a;">${format(h.date, 'MMM d')} - ${h.hours.toFixed(2)}h</div>
                    </div>
                  `).join('')}
                </div>
              </div>
              ` : ''}

              <div class="info-box">
                <div class="info-box-title" style="color: #475569;">Hours by Location:</div>
                <div class="info-grid">
                  ${Object.entries(data.locationBreakdown).map(([location, hours]) => `
                    <div class="info-card" style="display: flex; justify-content: space-between;">
                      <span>${location}</span>
                      <span style="font-weight: bold;">${hours.toFixed(2)}h</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="info-box" style="background: #dbeafe; border: 1px solid #93c5fd;">
                <div class="info-box-title" style="color: #1e40af;">💰 Pay: $${(data.regularPay || 0).toFixed(2)}${data.overtimePay > 0 ? ` + $${data.overtimePay.toFixed(2)} OT` : ''}${data.holidayPay > 0 ? ` + $${data.holidayPay.toFixed(2)} Holiday` : ''}${data.ptoPay > 0 ? ` + $${data.ptoPay.toFixed(2)} PTO` : ''}${(data.totalExpenses || 0) > 0 ? ` + $${data.totalExpenses.toFixed(2)} Exp` : ''} = $${(data.totalPay || 0).toFixed(2)}</div>
              </div>

              ${(data.expenses && data.expenses.length > 0) ? `
              <div class="info-box" style="background: #f3e8ff; border: 1px solid #c084fc;">
                <div class="info-box-title" style="color: #7c3aed;">💳 Expenses (${data.expenses.length}): ${data.expenses.map(e => `${format(parseISO(e.expense_date), 'M/d')} ${e.category} $${e.amount.toFixed(2)}`).join(' • ')}</div>
              </div>
              ` : ''}

              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Location</th>
                    <th style="text-align: right;">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.entries.map(entry => `
                    <tr>
                      <td>${format(parseISO(entry.clock_in), 'MMM d, yyyy')}</td>
                      <td>${format(parseISO(entry.clock_in), 'h:mm a')}</td>
                      <td>${format(parseISO(entry.clock_out), 'h:mm a')}</td>
                      <td>${entry.location ? entry.location.split(' - ')[0] : 'N/A'}</td>
                      <td style="text-align: right; font-weight: 600;">${entry.hours.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}).join('')}
          
          <div class="footer">
            <div style="margin-top: 3px;">Richmond, VA | Overtime: Hours exceeding 40 per week (Sunday-Saturday)</div>
          </div>
        </div>
        
        <script>window.onload = function() { setTimeout(() => window.print(), 500); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('accounting')) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">Only admins and accounting personnel can access payroll reports.</p>
      </div>
    );
  }

  const reportData = getPayrollData();
  const grandTotalRegular = Object.values(reportData).reduce((sum, d) => sum + d.regularHours, 0);
  const grandTotalOvertime = Object.values(reportData).reduce((sum, d) => sum + d.overtimeHours, 0);
  const grandTotalPTO = Object.values(reportData).reduce((sum, d) => sum + (d.ptoHours || 0), 0);
  const grandTotal = grandTotalRegular + grandTotalOvertime + grandTotalPTO;
  const grandTotalExpenses = Object.values(reportData).reduce((sum, d) => sum + (d.totalExpenses || 0), 0);
  const grandTotalPay = Object.values(reportData).reduce((sum, d) => sum + (d.totalPay || 0), 0);

  const selectedPeriodData = payrollPeriods?.find(p => p.id === selectedPayrollPeriod);

  // Calculate period length in days for display
  const startDisplay = parseISO(startDate);
  const endDisplay = parseISO(endDate);
  const periodDays = Math.ceil((endDisplay.getTime() - startDisplay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  // overtimeThreshold is no longer directly used for calculation here, but for descriptive text.
  // We'll replace its usage with a static "40h per week"
  // const overtimeThreshold = periodDays <= 7 ? 40 : 80;

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center print:hidden">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">Payroll Center — Reports</h1>
            <p className="text-slate-600">Review time, payroll amounts, expenses, and client hours using the same payroll calculations</p>
          </div>
          <Link to={createPageUrl("AccountingPayroll")}>
            <Button variant="outline" className="w-full md:w-auto">
              <DollarSign className="w-4 h-4 mr-2" />
              Back to Payroll Processing
            </Button>
          </Link>
        </div>

        <Tabs value={reportMode} onValueChange={setReportMode} className="print:hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payroll">
              <DollarSign className="w-4 h-4 mr-2" />
              Officer Payroll
            </TabsTrigger>
            <TabsTrigger value="client">
              <MapPin className="w-4 h-4 mr-2" />
              Client Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payroll" className="mt-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Payroll Report Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Officer</Label>
                    <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select officer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Officers</SelectItem>
                        {allUsers?.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.first_name && u.last_name 
                              ? `${u.first_name} ${u.last_name}` 
                              : u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Payroll Period</Label>
                    <Select value={selectedPayrollPeriod} onValueChange={handlePayrollPeriodChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payroll period or custom dates..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Date Range</SelectItem>
                        {payrollPeriods?.map((period) => (
                          <SelectItem key={period.id} value={period.id}>
                            {period.period_name} ({format(parseISO(period.start_date), 'M/d/yyyy')} - {format(parseISO(period.end_date), 'M/d/yyyy')})
                            {period.deposit_date && ` • Deposit: ${format(parseISO(period.deposit_date), 'M/d/yyyy')}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(useCustomDates || !selectedPayrollPeriod) && (
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
                )}

                <div className="flex gap-3">
                  <Button onClick={printPayrollReport} className="bg-blue-600 hover:bg-blue-700">
                    <Printer className="w-4 h-4 mr-2" />
                    Print Payroll Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="client" className="mt-6">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Client Report Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Select value={selectedLocation} onValueChange={setSelectedLocation}>
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
                    <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
                      <SelectTrigger>
                        <SelectValue placeholder="All officers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Officers</SelectItem>
                        {allUsers?.map((u) => (
                          <SelectItem key={u.email} value={u.email}>
                            {u.first_name && u.last_name 
                              ? `${u.first_name} ${u.last_name}` 
                              : u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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

                {(useCustomDates || !selectedPayrollPeriod) && (
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
                )}

                <div className="flex gap-3">
                  <Button onClick={printPayrollReport} className="bg-blue-600 hover:bg-blue-700" disabled={!selectedLocation}>
                    <Printer className="w-4 h-4 mr-2" />
                    Print Client Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* This block is still visible for the main UI, but the specific print styling is handled by the printPayrollReport function. */}
        <div className="print:hidden"> 
          <div className="bg-white p-8 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-slate-200">
              <div>
                <p className="text-slate-600">Richmond, VA</p>
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold text-slate-900 mb-2">EMPLOYEE PAYROLL REPORT</h3>
                {selectedPeriodData && (
                  <p className="text-lg font-semibold text-blue-900 mb-2">{selectedPeriodData.period_name}</p>
                )}
                <p className="text-slate-600">
                  {format(parseISO(startDate), 'M/d/yyyy')} - {format(parseISO(endDate), 'M/d/yyyy')}
                </p>
                {selectedPeriodData?.deposit_date && (
                  <p className="text-sm text-green-700 font-semibold mt-1">
                    Deposit: ${format(parseISO(selectedPeriodData.deposit_date), 'M/d/yyyy')}
                  </p>
                )}
                <p className="text-slate-600">
                  Generated: {format(new Date(), 'M/d/yyyy h:mm a')}
                </p>
              </div>
            </div>

            <div className="mb-6 bg-blue-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-5">
                <div>
                  <p className="text-sm text-blue-700 font-medium">Total Regular Hours</p>
                  <p className="text-2xl font-bold text-blue-900">{grandTotalRegular.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-amber-700 font-medium">Total Overtime Hours</p>
                  <p className="text-2xl font-bold text-amber-900">{grandTotalOvertime.toFixed(2)}</p>
                  <p className="text-xs text-amber-600">Over 40h per week</p>
                </div>
                <div>
                  <p className="text-sm text-violet-700 font-medium">Total PTO Hours</p>
                  <p className="text-2xl font-bold text-violet-900">{grandTotalPTO.toFixed(2)}</p>
                  <p className="text-xs text-violet-600">Straight time only</p>
                </div>
                <div>
                  <p className="text-sm text-purple-700 font-medium">Total Expenses</p>
                  <p className="text-2xl font-bold text-purple-900">${grandTotalExpenses.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-700 font-medium">Total Payroll</p>
                  <p className="text-2xl font-bold text-slate-900">${grandTotalPay.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {Object.keys(reportData).length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Clock className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p>No time entries found for the selected period</p>
              </div>
            )}
            
            <div className="space-y-8">
              {Object.entries(reportData).map(([officerEmail, data]) => {
                const officerPhone = getOfficerPhone(officerEmail);
                return (
                  <div key={officerEmail} className="border-t-2 border-slate-200 pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-bold text-slate-900">{getOfficerName(officerEmail)}</h3>
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
                        <p className="text-sm text-slate-600">{officerEmail}</p>
                      </div>
                      <div className="text-right">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-xs text-blue-700 font-medium mb-1">Total Pay</p>
                          <p className="text-3xl font-bold text-blue-900">${(data.totalPay || 0).toFixed(2)}</p>
                          <div className="mt-2 text-xs space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-600">Hourly Rate:</span>
                              <span className="font-semibold">${(data.hourlyRate || 0).toFixed(2)}/hr</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-600">Regular:</span>
                              <span className="font-semibold">{data.regularHours.toFixed(2)}h = ${(data.regularPay || 0).toFixed(2)}</span>
                            </div>
                            {data.overtimeHours > 0 && (
                              <div className="flex justify-between gap-4">
                                <span className="text-amber-600">OT (1.5x):</span>
                                <span className="font-semibold text-amber-700">{data.overtimeHours.toFixed(2)}h = ${(data.overtimePay || 0).toFixed(2)}</span>
                              </div>
                            )}
                            {data.holidayHours > 0 && (
                              <div className="flex justify-between gap-4">
                                <span className="text-green-600">Holiday:</span>
                                <span className="font-semibold text-green-700">{data.holidayHours.toFixed(2)}h = ${(data.holidayPay || 0).toFixed(2)}</span>
                              </div>
                            )}
                            {data.ptoHours > 0 && (
                              <div className="flex justify-between gap-4">
                                <span className="text-violet-600">PTO (straight time):</span>
                                <span className="font-semibold text-violet-700">{data.ptoHours.toFixed(2)}h = ${(data.ptoPay || 0).toFixed(2)}</span>
                              </div>
                            )}
                            {data.totalExpenses > 0 && (
                              <div className="flex justify-between gap-4">
                                <span className="text-purple-600">Expenses:</span>
                                <span className="font-semibold text-purple-700">${(data.totalExpenses || 0).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border border-slate-200 rounded-lg">
                      {data.ptoHours > 0 && (
                        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <h4 className="font-semibold text-violet-800">PTO Pay — {data.ptoHours.toFixed(2)} hours @ ${(data.hourlyRate || 0).toFixed(2)}/hr = ${(data.ptoPay || 0).toFixed(2)}</h4>
                          <p className="mt-1 text-xs text-violet-700">PTO is paid at the base rate and is excluded from the 40-hour worked-time overtime calculation.</p>
                        </div>
                      )}
                      {data.holidayDetails && data.holidayDetails.length > 0 && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                            🎉 Holiday Pay ({data.holidayHours.toFixed(2)} hours @ ${(data.holidayRate || 0).toFixed(2)}/hr [1.25x] = ${(data.holidayPay || 0).toFixed(2)})
                          </h4>
                          <div className="grid md:grid-cols-2 gap-2">
                            {data.holidayDetails.map((h, idx) => (
                              <div key={idx} className="bg-white p-2 rounded border border-green-100">
                                <div className="font-semibold text-sm">{h.name}</div>
                                <div className="text-xs text-green-600">{format(h.date, 'MMM d, yyyy')} - {h.hours.toFixed(2)}h</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {data.expenses && data.expenses.length > 0 && (
                        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                          <h4 className="font-semibold text-purple-700 mb-2 flex items-center gap-2">
                            💳 Approved Expenses (${(data.totalExpenses || 0).toFixed(2)})
                          </h4>
                          <div className="space-y-2">
                            {data.expenses.map((exp, idx) => (
                              <div key={idx} className="bg-white p-2 rounded border border-purple-100 flex justify-between items-center">
                                <div>
                                  <div className="font-semibold text-sm">{exp.category.replace(/_/g, ' ')}</div>
                                  <div className="text-xs text-slate-600">{format(parseISO(exp.expense_date), 'MMM d, yyyy')} - {exp.description}</div>
                                </div>
                                <div className="font-bold text-purple-700">${exp.amount.toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <h4 className="font-semibold text-slate-700 mb-3">Hours by Location:</h4>
                      <div className="grid md:grid-cols-2 gap-3 mb-4">
                        {Object.entries(data.locationBreakdown).map(([location, hours]) => (
                          <div key={location} className="flex justify-between items-center bg-slate-50 p-3 rounded">
                            <span className="text-slate-700">{location}</span>
                            <span className="font-bold text-slate-900">{hours.toFixed(2)}h</span>
                          </div>
                        ))}
                      </div>

                      <h4 className="font-semibold text-slate-700 mb-3 mt-4">Detailed Time Entries:</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Location</th>
                            <th className="text-left p-2">Clock In</th>
                            <th className="text-left p-2">Clock Out</th>
                            <th className="text-right p-2">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.entries.map((entry) => (
                            <tr key={entry.id} className="border-b border-slate-100">
                              <td className="p-2">{format(parseISO(entry.clock_in), 'MMM d, yyyy')}</td>
                              <td className="p-2">{entry.location ? entry.location.split(' - ')[0] : 'N/A'}</td>
                              <td className="p-2">{entry.clock_in ? format(parseISO(entry.clock_in), 'h:mm a') : 'N/A'}</td>
                              <td className="p-2">{entry.clock_out ? format(parseISO(entry.clock_out), 'h:mm a') : 'N/A'}</td>
                              <td className="p-2 text-right font-medium">{entry.hours.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>


            <div className="mt-8 pt-4 border-t-2 border-slate-200 text-center text-sm text-slate-500">
              <p>Regular Hours: Up to 40 hours per week (Sunday-Saturday) | Overtime: Hours exceeding 40 per week</p>
              <p>Overtime calculated weekly (Sunday-Saturday) within the {periodDays}-day period</p>
              <p>This is a confidential document. For authorized personnel only.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}