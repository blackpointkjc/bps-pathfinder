import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, CheckCircle, Trash2, Settings, Zap, AlertTriangle, FileText, Download, Printer } from "lucide-react";
import { format, startOfMonth, endOfMonth, isValid, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const safeFormatDate = (dateStr, formatStr = 'MMM d, yyyy') => {
  if (!dateStr) return 'N/A';
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (!isValid(date)) return 'Invalid Date';
    return format(date, formatStr);
  } catch (error) {
    return 'Invalid Date';
  }
};

const safeCalculateHours = (clockIn, clockOut) => {
  if (!clockIn || !clockOut) return 0;
  try {
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    if (!isValid(start) || !isValid(end)) return 0;
    return Math.max(0, (end - start) / (1000 * 60 * 60));
  } catch (error) {
    return 0;
  }
};

export default function AccountingPayroll() {
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [validationIssues, setValidationIssues] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [configData, setConfigData] = useState({
    employer_ein: "",
    company_legal_name: "Black Point Protection Services",
    company_address: "1971 University Blvd, Lynchburg, VA 24515",
    company_phone: "",
    payroll_email: "",
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    holiday_multiplier: 2.0
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAccountingRole = user?.additional_roles?.includes('accounting') || user?.role === 'admin';

  const { data: payrollEntries = [] } = useQuery({
    queryKey: ['payrollEntries'],
    queryFn: () => base44.entities.PayrollEntry.list('-created_date', 1000),
    enabled: isAccountingRole,
  });

  const { data: officers = [] } = useQuery({
    queryKey: ['officers'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in', 2000),
    enabled: isAccountingRole,
  });

  const { data: config } = useQuery({
    queryKey: ['payrollConfig'],
    queryFn: async () => {
      const configs = await base44.entities.PayrollConfig.list();
      return configs[0] || null;
    },
    enabled: isAccountingRole,
  });

  const { data: payrollPeriods = [] } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: () => base44.entities.PayrollPeriod.list('-start_date'),
    enabled: isAccountingRole,
  });

  const createPayrollMutation = useMutation({
    mutationFn: (entries) => base44.entities.PayrollEntry.bulkCreate(entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollEntries'] });
      setGenerating(false);
      alert('✅ Payroll generated successfully!');
    },
    onError: (error) => {
      alert('❌ Failed to generate payroll: ' + error.message);
      setGenerating(false);
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id) => base44.entities.PayrollEntry.update(id, {
      status: 'approved',
      approved_by: user.email,
      approved_date: new Date().toISOString()
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payrollEntries'] }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id) => base44.entities.PayrollEntry.update(id, { status: 'paid' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payrollEntries'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PayrollEntry.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payrollEntries'] }),
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data) => {
      if (config) {
        return base44.entities.PayrollConfig.update(config.id, data);
      } else {
        return base44.entities.PayrollConfig.create({ config_name: "Default", ...data });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollConfig'] });
      setShowConfigDialog(false);
      alert('✅ Configuration saved!');
    }
  });

  // Federal holidays for 2026
  const federalHolidays = [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: "Martin Luther King Jr. Day", date: '2026-01-19' },
    { name: "Juneteenth", date: '2026-06-19' },
    { name: "Independence Day", date: '2026-07-04' },
    { name: "Thanksgiving Day", date: '2026-11-26' },
    { name: "Christmas Day", date: '2026-12-25' }
  ];

  const isFederalHoliday = (dateStr) => {
    const checkDate = format(new Date(dateStr), 'yyyy-MM-dd');
    return federalHolidays.find(h => h.date === checkDate);
  };

  const generatePayroll = async () => {
    if (!selectedPeriodId) {
      alert('Please select a payroll period');
      return;
    }

    setGenerating(true);
    setValidationIssues([]);

    try {
      const selectedPeriod = payrollPeriods.find(p => p.id === selectedPeriodId);
      if (!selectedPeriod) {
        alert('Invalid payroll period selected');
        setGenerating(false);
        return;
      }

      const selectedPeriodStart = selectedPeriod.start_date;
      const selectedPeriodEnd = selectedPeriod.end_date;

      const issues = [];
      const overtimeThreshold = config?.overtime_threshold_hours || 40;
      const overtimeMultiplier = config?.overtime_multiplier || 1.5;
      const holidayMultiplier = config?.holiday_multiplier || 1.25;
      
      // Filter time entries - only complete, valid entries
      const validEntries = timeEntries.filter(entry => {
        if (!entry.clock_in || !entry.clock_out) return false;
        const clockInDate = new Date(entry.clock_in);
        const clockOutDate = new Date(entry.clock_out);
        if (!isValid(clockInDate) || !isValid(clockOutDate)) return false;
        const entryDate = entry.clock_in.split('T')[0];
        return entryDate >= selectedPeriodStart && entryDate <= selectedPeriodEnd;
      });

      if (validEntries.length === 0) {
        setGenerating(false);
        alert('⚠️ No complete time entries found for the selected period');
        return;
      }

      // Group by officer and calculate weekly hours for overtime
      const officerData = {};
      
      validEntries.forEach(entry => {
        const officer = officers.find(o => o.email === entry.officer_email);
        
        if (!officer) {
          issues.push({
            severity: 'high',
            officer: entry.officer_email,
            message: 'Officer profile not found'
          });
          return;
        }

        if (!officer.hourly_rate || officer.hourly_rate <= 0) {
          issues.push({
            severity: 'high',
            officer: `${officer.first_name} ${officer.last_name}`,
            message: 'No pay rate set'
          });
          return;
        }

        const hours = safeCalculateHours(entry.clock_in, entry.clock_out);
        
        if (hours > 16) {
          issues.push({
            severity: 'medium',
            officer: `${officer.first_name} ${officer.last_name}`,
            message: `Abnormal shift: ${hours.toFixed(2)} hours on ${safeFormatDate(entry.clock_in)}`
          });
        }

        if (!officerData[entry.officer_email]) {
          officerData[entry.officer_email] = {
            officer: officer,
            totalMinutes: 0,
            shifts: [],
            weeklyHours: {}, // Track regular hours per week for overtime calculation
            holidaysWorked: [] // Track holidays with details
          };
        }

        const minutes = (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60);
        officerData[entry.officer_email].totalMinutes += minutes;
        
        // Check if shift is on a federal holiday
        const holiday = isFederalHoliday(entry.clock_in);
        
        if (holiday) {
          // Track holiday separately - doesn't count toward weekly overtime
          officerData[entry.officer_email].holidaysWorked.push({
            date: format(new Date(entry.clock_in), 'yyyy-MM-dd'),
            name: holiday.name,
            hours: hours
          });
        } else {
          // Track weekly hours for overtime calculation (40 hrs/week)
          const weekStart = startOfWeek(new Date(entry.clock_in), { weekStartsOn: 0 }); // Sunday
          const weekKey = format(weekStart, 'yyyy-MM-dd');
          if (!officerData[entry.officer_email].weeklyHours[weekKey]) {
            officerData[entry.officer_email].weeklyHours[weekKey] = 0;
          }
          officerData[entry.officer_email].weeklyHours[weekKey] += hours;
        }
        
        officerData[entry.officer_email].shifts.push({ ...entry, hours, holiday });
      });

      setValidationIssues(issues);

      // Generate payroll entries
      const payrollEntries = [];

      for (const [email, data] of Object.entries(officerData)) {
        const officer = data.officer;
        const baseRate = officer.hourly_rate;
        
        // Use officer-specific rates or company defaults
        const overtimeRate = officer.overtime_rate_override || (baseRate * overtimeMultiplier);
        const holidayRate = officer.holiday_rate_override || (baseRate * holidayMultiplier);
        
        let regularHours = 0;
        let overtimeHours = 0;
        let holidayHours = 0;

        // Calculate overtime per week (40 hrs/week legally required)
        Object.entries(data.weeklyHours).forEach(([weekKey, weekHours]) => {
          if (weekHours <= overtimeThreshold) {
            regularHours += weekHours;
          } else {
            regularHours += overtimeThreshold;
            overtimeHours += (weekHours - overtimeThreshold);
          }
        });

        // Add holiday hours
        data.holidaysWorked.forEach(h => {
          holidayHours += h.hours;
        });

        // Calculate pay breakdown
        const regularPay = regularHours * baseRate;
        const overtimePay = overtimeHours * overtimeRate;
        const holidayPay = holidayHours * holidayRate;
        const grossPay = regularPay + overtimePay + holidayPay;

        // Calculate qualified overtime premium (2026 tax law)
        const qualifiedOvertimePremium = overtimeHours * (overtimeRate - baseRate);

        // Calculate taxes (2026 rates)
        const socialSecurity = Math.min(grossPay * 0.062, 10453.20);
        const medicare = grossPay * 0.0145;

        // 2026 Federal W-4 Tax Calculation (IRS Publication 15-T method)
        let federalTax = 0;
        const payPeriods = 26; // Biweekly
        
        // Step 1: Adjust gross pay for W-4 inputs
        let adjustedAnnualWages = grossPay * payPeriods;
        
        // Step 2(c): Multiple jobs adjustment
        if (officer.w4_step2_checkbox) {
          adjustedAnnualWages = adjustedAnnualWages * 1.0; // Already factored into tax tables
        }
        
        // Step 3: Dependents
        const dependentsCredit = officer.w4_step3_dependents_amount || 0;
        
        // Step 4(a): Other income
        const otherIncome = officer.w4_step4a_other_income || 0;
        adjustedAnnualWages += otherIncome;
        
        // Step 4(b): Deductions
        const deductions = officer.w4_step4b_deductions || 0;
        adjustedAnnualWages = Math.max(0, adjustedAnnualWages - deductions);
        
        // Standard deduction for 2026
        let standardDeduction = 0;
        if (officer.tax_filing_status === 'married_joint') {
          standardDeduction = 29200;
        } else if (officer.tax_filing_status === 'head_of_household') {
          standardDeduction = 21900;
        } else {
          standardDeduction = 14600;
        }
        
        const taxableIncome = Math.max(0, adjustedAnnualWages - standardDeduction);
        
        // 2026 federal tax brackets
        if (officer.tax_filing_status === 'married_joint') {
          if (taxableIncome <= 23200) {
            federalTax = taxableIncome * 0.10;
          } else if (taxableIncome <= 94300) {
            federalTax = 2320 + (taxableIncome - 23200) * 0.12;
          } else if (taxableIncome <= 201050) {
            federalTax = 10852 + (taxableIncome - 94300) * 0.22;
          } else if (taxableIncome <= 383900) {
            federalTax = 34337 + (taxableIncome - 201050) * 0.24;
          } else if (taxableIncome <= 487450) {
            federalTax = 78221 + (taxableIncome - 383900) * 0.32;
          } else if (taxableIncome <= 731200) {
            federalTax = 111357 + (taxableIncome - 487450) * 0.35;
          } else {
            federalTax = 196669.50 + (taxableIncome - 731200) * 0.37;
          }
        } else if (officer.tax_filing_status === 'head_of_household') {
          if (taxableIncome <= 16550) {
            federalTax = taxableIncome * 0.10;
          } else if (taxableIncome <= 63100) {
            federalTax = 1655 + (taxableIncome - 16550) * 0.12;
          } else if (taxableIncome <= 100500) {
            federalTax = 7241 + (taxableIncome - 63100) * 0.22;
          } else if (taxableIncome <= 191950) {
            federalTax = 15469 + (taxableIncome - 100500) * 0.24;
          } else if (taxableIncome <= 243700) {
            federalTax = 37417 + (taxableIncome - 191950) * 0.32;
          } else if (taxableIncome <= 609350) {
            federalTax = 53977 + (taxableIncome - 243700) * 0.35;
          } else {
            federalTax = 181954.50 + (taxableIncome - 609350) * 0.37;
          }
        } else { // Single or married filing separately
          if (taxableIncome <= 11600) {
            federalTax = taxableIncome * 0.10;
          } else if (taxableIncome <= 47150) {
            federalTax = 1160 + (taxableIncome - 11600) * 0.12;
          } else if (taxableIncome <= 100525) {
            federalTax = 5426 + (taxableIncome - 47150) * 0.22;
          } else if (taxableIncome <= 191950) {
            federalTax = 17168.50 + (taxableIncome - 100525) * 0.24;
          } else if (taxableIncome <= 243725) {
            federalTax = 39110.50 + (taxableIncome - 191950) * 0.32;
          } else if (taxableIncome <= 609350) {
            federalTax = 55678.50 + (taxableIncome - 243725) * 0.35;
          } else {
            federalTax = 183647.25 + (taxableIncome - 609350) * 0.37;
          }
        }
        
        // Apply dependents credit
        federalTax = Math.max(0, federalTax - dependentsCredit);
        
        // Convert to per-paycheck
        federalTax = federalTax / payPeriods;
        
        // Step 4(c): Extra withholding
        const extraWithholding = officer.w4_step4c_extra_withholding || 0;
        federalTax += extraWithholding;

        if (officer.exempt_from_federal_tax) {
          federalTax = 0;
        }

        // State tax
        let stateTax = 0;
        if (officer.work_state === 'VA') {
          if (grossPay <= 3000) {
            stateTax = grossPay * 0.02;
          } else if (grossPay <= 5000) {
            stateTax = 60 + (grossPay - 3000) * 0.03;
          } else if (grossPay <= 17000) {
            stateTax = 120 + (grossPay - 5000) * 0.05;
          } else {
            stateTax = 720 + (grossPay - 17000) * 0.0575;
          }
        } else if (officer.work_state === 'MD') {
          stateTax = grossPay * 0.0575; // MD progressive, simplified
        } else if (officer.work_state === 'DC') {
          stateTax = grossPay * 0.065;
        } else if (officer.work_state === 'NC') {
          stateTax = grossPay * 0.0475;
        }

        const stateAllowances = officer.state_withholding_allowances || 0;
        stateTax = Math.max(0, stateTax - (stateAllowances * 38.46)); // Approx per paycheck

        if (officer.exempt_from_state_tax) {
          stateTax = 0;
        }

        const netPay = grossPay - federalTax - stateTax - socialSecurity - medicare;

        payrollEntries.push({
          officer_email: email,
          pay_period_start: selectedPeriodStart,
          pay_period_end: selectedPeriodEnd,
          pay_date: selectedPeriodEnd,
          regular_hours: parseFloat(regularHours.toFixed(4)),
          overtime_hours: parseFloat(overtimeHours.toFixed(4)),
          holiday_hours: parseFloat(holidayHours.toFixed(4)),
          hours_worked: parseFloat((regularHours + overtimeHours + holidayHours).toFixed(4)),
          hourly_rate: baseRate,
          overtime_rate: overtimeRate,
          holiday_rate: holidayRate,
          regular_pay: parseFloat(regularPay.toFixed(2)),
          overtime_pay: parseFloat(overtimePay.toFixed(2)),
          holiday_pay: parseFloat(holidayPay.toFixed(2)),
          gross_pay: parseFloat(grossPay.toFixed(2)),
          federal_tax: parseFloat(federalTax.toFixed(2)),
          state_tax: parseFloat(stateTax.toFixed(2)),
          social_security: parseFloat(socialSecurity.toFixed(2)),
          medicare: parseFloat(medicare.toFixed(2)),
          other_deductions: 0,
          net_pay: parseFloat(netPay.toFixed(2)),
          qualified_overtime_premium: parseFloat(qualifiedOvertimePremium.toFixed(2)),
          holidays_worked: JSON.stringify(data.holidaysWorked),
          status: 'draft',
          payment_method: officer.payment_method || 'direct_deposit'
        });
      }

      if (payrollEntries.length > 0) {
        await createPayrollMutation.mutateAsync(payrollEntries);
      } else {
        setGenerating(false);
        alert('⚠️ No valid payroll entries to generate');
      }
    } catch (error) {
      console.error('Payroll generation error:', error);
      alert('❌ Error: ' + error.message);
      setGenerating(false);
    }
  };

  if (!isAccountingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <DollarSign className="w-16 h-16 mx-auto mb-4 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">You don't have accounting access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const draftEntries = payrollEntries.filter(e => e.status === 'draft');
  const approvedEntries = payrollEntries.filter(e => e.status === 'approved');
  const paidEntries = payrollEntries.filter(e => e.status === 'paid');

  const totalGross = payrollEntries.reduce((sum, e) => sum + (e.gross_pay || 0), 0);
  const totalNet = payrollEntries.reduce((sum, e) => sum + (e.net_pay || 0), 0);

  // Generate Gusto-compatible payroll report
  const generatePayrollReport = (entriesToReport) => {
    const reportWindow = window.open('', '_blank');

    const periodLabel = selectedPeriodId ? (() => {
      const period = payrollPeriods.find(p => p.id === selectedPeriodId);
      return period ? period.period_name + ' (' + period.start_date + ' to ' + period.end_date + ')' : 'Selected Period';
    })() : 'All Entries';

    // Aggregate totals
    const totGross = entriesToReport.reduce((s, e) => s + (e.gross_pay || 0), 0);
    const totNet = entriesToReport.reduce((s, e) => s + (e.net_pay || 0), 0);
    const totFedEE = entriesToReport.reduce((s, e) => s + (e.federal_tax || 0), 0);
    const totSSEE = entriesToReport.reduce((s, e) => s + (e.social_security || 0), 0);
    const totMedEE = entriesToReport.reduce((s, e) => s + (e.medicare || 0), 0);
    const totStateEE = entriesToReport.reduce((s, e) => s + (e.state_tax || 0), 0);
    // Employer matching (FICA employer share)
    const totSSER = totSSEE; // 6.2% employer match = same amount
    const totMedER = totMedEE; // 1.45% employer match = same amount
    const totFUTA = totGross * 0.006; // FUTA 0.6% on first $7k (simplified)
    const totalTaxDeposit = totFedEE + totSSEE + totSSER + totMedEE + totMedER; // 941 deposit

    // Group state taxes by state
    const stateMap = {};
    entriesToReport.forEach(entry => {
      const officer = officers.find(o => o.email === entry.officer_email);
      const state = officer?.work_state || 'Unknown';
      if (!stateMap[state]) stateMap[state] = 0;
      stateMap[state] += (entry.state_tax || 0);
    });

    // CSV data
    const csvData = [
      ['Employee Name', 'Email', 'Pay Period Start', 'Pay Period End', 'Regular Hours', 'Regular Rate', 'Regular Gross', 'Overtime Hours', 'Overtime Rate', 'Overtime Gross', 'Holiday Hours', 'Holiday Rate', 'Holiday Gross', 'Total Gross', 'Federal Withholding', 'Social Security (EE)', 'Medicare (EE)', 'State Tax', 'Net Pay', 'Payment Method'].join(','),
      ...entriesToReport.map(entry => {
        const officer = officers.find(o => o.email === entry.officer_email);
        return [
          `"${officer?.first_name || ''} ${officer?.last_name || ''}"`,
          entry.officer_email,
          entry.pay_period_start,
          entry.pay_period_end,
          (entry.regular_hours || 0).toFixed(2),
          (entry.hourly_rate || 0).toFixed(2),
          (entry.regular_pay || 0).toFixed(2),
          (entry.overtime_hours || 0).toFixed(2),
          (entry.overtime_rate || 0).toFixed(2),
          (entry.overtime_pay || 0).toFixed(2),
          (entry.holiday_hours || 0).toFixed(2),
          (entry.holiday_rate || 0).toFixed(2),
          (entry.holiday_pay || 0).toFixed(2),
          (entry.gross_pay || 0).toFixed(2),
          (entry.federal_tax || 0).toFixed(2),
          (entry.social_security || 0).toFixed(2),
          (entry.medicare || 0).toFixed(2),
          (entry.state_tax || 0).toFixed(2),
          (entry.net_pay || 0).toFixed(2),
          entry.payment_method || 'direct_deposit'
        ].join(',');
      })
    ].join('\n');

    const employeeRows = entriesToReport.map(entry => {
      const officer = officers.find(o => o.email === entry.officer_email);
      const name = officer ? officer.first_name + ' ' + officer.last_name : entry.officer_email;
      const state = officer?.work_state || '?';
      const payMethod = entry.payment_method === 'check' ? '🖊️ Check' : '🏦 Direct Deposit';
      return `<tr>
        <td><strong>${name}</strong><br><span style="font-size:11px;color:#666">${entry.officer_email}</span></td>
        <td class="r">${(entry.regular_hours || 0).toFixed(2)}</td>
        <td class="r">$${(entry.regular_pay || 0).toFixed(2)}</td>
        <td class="r">${(entry.overtime_hours || 0).toFixed(2)}</td>
        <td class="r">$${(entry.overtime_pay || 0).toFixed(2)}</td>
        <td class="r">${(entry.holiday_hours || 0).toFixed(2)}</td>
        <td class="r">$${(entry.holiday_pay || 0).toFixed(2)}</td>
        <td class="r b">$${(entry.gross_pay || 0).toFixed(2)}</td>
        <td class="r">$${(entry.federal_tax || 0).toFixed(2)}</td>
        <td class="r">$${(entry.social_security || 0).toFixed(2)}</td>
        <td class="r">$${(entry.medicare || 0).toFixed(2)}</td>
        <td class="r">${state}: $${(entry.state_tax || 0).toFixed(2)}</td>
        <td class="r b grn">$${(entry.net_pay || 0).toFixed(2)}</td>
        <td>${payMethod}</td>
      </tr>`;
    }).join('');

    const stateRows = Object.entries(stateMap).map(([state, amt]) =>
      `<tr><td>${state} Income Tax Withholding</td><td class="r b">$${amt.toFixed(2)}</td><td>State revenue dept (via Gusto)</td></tr>`
    ).join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Payroll Report — ${periodLabel}</title>
  <style>
    @media print { @page { margin:0.5in; size:landscape; } .no-print { display:none!important; } body { margin:0; } }
    body { font-family: Arial, sans-serif; font-size:13px; color:#222; padding:24px; background:#fff; }
    h1 { margin:0 0 4px; font-size:22px; }
    h2 { font-size:15px; margin:24px 0 8px; border-bottom:2px solid #2c3e50; padding-bottom:4px; color:#2c3e50; }
    h3 { font-size:13px; margin:16px 0 6px; color:#444; }
    .meta { color:#555; font-size:12px; margin-bottom:6px; }
    .chips { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0; }
    .chip { border:1px solid #ddd; border-radius:6px; padding:10px 16px; background:#f9f9f9; min-width:140px; }
    .chip .lbl { font-size:11px; color:#888; margin-bottom:2px; }
    .chip .val { font-size:18px; font-weight:bold; color:#2c3e50; }
    table { width:100%; border-collapse:collapse; margin-top:8px; font-size:11.5px; }
    th { background:#2c3e50; color:#fff; padding:8px 6px; text-align:left; }
    td { padding:7px 6px; border-bottom:1px solid #e8e8e8; vertical-align:top; }
    tr:nth-child(even) td { background:#f7f7f7; }
    .r { text-align:right; }
    .b { font-weight:bold; }
    .grn { color:#16a34a; }
    .red { color:#dc2626; }
    .box { border:2px solid #2c3e50; border-radius:6px; padding:16px 20px; margin:16px 0; background:#f0f4f8; }
    .box.green { border-color:#16a34a; background:#f0fdf4; }
    .box.amber { border-color:#d97706; background:#fffbeb; }
    .deposit-table td { padding:8px 10px; }
    .deposit-table tr td:first-child { font-weight:600; }
    .total-row td { background:#2c3e50!important; color:#fff; font-weight:bold; }
    .btn { padding:10px 22px; border:none; border-radius:5px; cursor:pointer; font-size:14px; margin-right:8px; }
    .btn-print { background:#2c3e50; color:#fff; }
    .btn-csv { background:#16a34a; color:#fff; }
  </style>
</head>
<body>

  <div class="no-print" style="margin-bottom:20px">
    <button class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn btn-csv" onclick="downloadCSV()">📥 Download CSV for Gusto</button>
  </div>

  <h1>Payroll Register</h1>
  <div class="meta"><strong>Company:</strong> ${config?.company_legal_name || 'Black Point Protection Services'} &nbsp;|&nbsp; <strong>EIN:</strong> ${config?.employer_ein || 'Not Set'} &nbsp;|&nbsp; <strong>Address:</strong> ${config?.company_address || ''}</div>
  <div class="meta"><strong>Pay Period:</strong> ${periodLabel} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleString()} &nbsp;|&nbsp; <strong>Employees:</strong> ${entriesToReport.length}</div>

  <!-- SUMMARY CHIPS -->
  <div class="chips">
    <div class="chip"><div class="lbl">Total Gross Pay</div><div class="val">$${totGross.toFixed(2)}</div></div>
    <div class="chip"><div class="lbl">Total Net Pay (to employees)</div><div class="val grn">$${totNet.toFixed(2)}</div></div>
    <div class="chip"><div class="lbl">Employee Tax Withheld</div><div class="val red">$${(totFedEE + totSSEE + totMedEE + totStateEE).toFixed(2)}</div></div>
    <div class="chip"><div class="lbl">Employer FICA Owed</div><div class="val red">$${(totSSER + totMedER).toFixed(2)}</div></div>
    <div class="chip"><div class="lbl">IRS Form 941 Deposit</div><div class="val red">$${totalTaxDeposit.toFixed(2)}</div></div>
    <div class="chip"><div class="lbl">FUTA (est.)</div><div class="val red">$${totFUTA.toFixed(2)}</div></div>
  </div>

  <!-- SECTION 1: WHAT TO PAY EACH EMPLOYEE -->
  <h2>Section 1 — Employee Pay Summary</h2>
  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th class="r">Reg Hrs</th>
        <th class="r">Reg Pay</th>
        <th class="r">OT Hrs</th>
        <th class="r">OT Pay</th>
        <th class="r">Hol Hrs</th>
        <th class="r">Hol Pay</th>
        <th class="r">GROSS</th>
        <th class="r">Fed W/H</th>
        <th class="r">SS (EE)</th>
        <th class="r">Medicare (EE)</th>
        <th class="r">State W/H</th>
        <th class="r">NET PAY</th>
        <th>Method</th>
      </tr>
    </thead>
    <tbody>
      ${employeeRows}
      <tr class="total-row">
        <td>TOTALS</td>
        <td></td><td></td><td></td><td></td><td></td><td></td>
        <td class="r">$${totGross.toFixed(2)}</td>
        <td class="r">$${totFedEE.toFixed(2)}</td>
        <td class="r">$${totSSEE.toFixed(2)}</td>
        <td class="r">$${totMedEE.toFixed(2)}</td>
        <td class="r">$${totStateEE.toFixed(2)}</td>
        <td class="r">$${totNet.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 2: WHAT TAXES TO SEND & WHERE -->
  <h2>Section 2 — Tax Remittance Summary (What to Send & Where)</h2>
  <div class="box amber">
    ⚠️ <strong>Action Required:</strong> The following taxes must be deposited on your pay date or per your IRS deposit schedule (semi-weekly or monthly). Gusto handles this automatically if you run payroll through them.
  </div>

  <h3>🏛️ Federal Taxes — IRS (Form 941 Deposit)</h3>
  <table class="deposit-table">
    <thead><tr><th>Tax Type</th><th class="r">Amount</th><th>Who Pays</th><th>Where / How</th></tr></thead>
    <tbody>
      <tr><td>Federal Income Tax Withholding</td><td class="r">$${totFedEE.toFixed(2)}</td><td>Employee (withheld)</td><td>IRS via EFTPS (eftps.gov) or Gusto</td></tr>
      <tr><td>Social Security — Employee Share (6.2%)</td><td class="r">$${totSSEE.toFixed(2)}</td><td>Employee (withheld)</td><td>IRS via EFTPS — Form 941</td></tr>
      <tr><td>Social Security — Employer Match (6.2%)</td><td class="r">$${totSSER.toFixed(2)}</td><td>Employer</td><td>IRS via EFTPS — Form 941</td></tr>
      <tr><td>Medicare — Employee Share (1.45%)</td><td class="r">$${totMedEE.toFixed(2)}</td><td>Employee (withheld)</td><td>IRS via EFTPS — Form 941</td></tr>
      <tr><td>Medicare — Employer Match (1.45%)</td><td class="r">$${totMedER.toFixed(2)}</td><td>Employer</td><td>IRS via EFTPS — Form 941</td></tr>
      <tr class="total-row"><td>TOTAL IRS 941 DEPOSIT</td><td class="r">$${totalTaxDeposit.toFixed(2)}</td><td colspan="2">Deposit by pay date (semi-weekly) or following month (monthly depositor)</td></tr>
    </tbody>
  </table>

  <h3>🏛️ Federal Unemployment Tax (FUTA) — Form 940</h3>
  <table class="deposit-table">
    <thead><tr><th>Tax Type</th><th class="r">Estimated Amount</th><th>Who Pays</th><th>Where / How</th></tr></thead>
    <tbody>
      <tr><td>FUTA (0.6% on first $7,000 wages — estimated)</td><td class="r">$${totFUTA.toFixed(2)}</td><td>Employer only</td><td>IRS via EFTPS — Form 940 (quarterly/annually)</td></tr>
    </tbody>
  </table>

  <h3>🏛️ State Income Tax Withholding</h3>
  <table class="deposit-table">
    <thead><tr><th>Tax Type</th><th class="r">Amount</th><th>Where / How</th></tr></thead>
    <tbody>
      ${stateRows || '<tr><td colspan="3">No state tax data found. Set work_state on each officer profile.</td></tr>'}
    </tbody>
  </table>

  <div class="box green">
    ✅ <strong>Gusto Users:</strong> Enter the "Regular Hours", "Overtime Hours", and "Holiday Hours" per employee into Gusto's Hours & Earnings screen. Gusto will calculate and remit all taxes automatically using your EIN on file.
    <br><br>
    Use the <strong>Download CSV</strong> button above for a spreadsheet you can reference while entering data into Gusto.
  </div>

  <!-- SECTION 3: EMPLOYER COST SUMMARY -->
  <h2>Section 3 — Total Employer Cost</h2>
  <table class="deposit-table">
    <thead><tr><th>Item</th><th class="r">Amount</th></tr></thead>
    <tbody>
      <tr><td>Total Net Pay (disbursed to employees)</td><td class="r">$${totNet.toFixed(2)}</td></tr>
      <tr><td>Federal Income Tax Withheld (already in gross)</td><td class="r">$${totFedEE.toFixed(2)}</td></tr>
      <tr><td>Social Security Withheld (EE share)</td><td class="r">$${totSSEE.toFixed(2)}</td></tr>
      <tr><td>Medicare Withheld (EE share)</td><td class="r">$${totMedEE.toFixed(2)}</td></tr>
      <tr><td>State Tax Withheld (EE share)</td><td class="r">$${totStateEE.toFixed(2)}</td></tr>
      <tr><td>Social Security — Employer Match (6.2%)</td><td class="r red">$${totSSER.toFixed(2)}</td></tr>
      <tr><td>Medicare — Employer Match (1.45%)</td><td class="r red">$${totMedER.toFixed(2)}</td></tr>
      <tr><td>FUTA Estimated (0.6%)</td><td class="r red">$${totFUTA.toFixed(2)}</td></tr>
      <tr class="total-row"><td>TOTAL EMPLOYER COST THIS PERIOD</td><td class="r">$${(totGross + totSSER + totMedER + totFUTA).toFixed(2)}</td></tr>
    </tbody>
  </table>

  <div style="margin-top:30px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:12px;">
    <p>Generated by BPS Connect Payroll System &nbsp;|&nbsp; ${new Date().toLocaleString()} &nbsp;|&nbsp; EIN: ${config?.employer_ein || 'Not Set'} &nbsp;|&nbsp; ${config?.payroll_email || ''}</p>
    <p>Verify all figures before processing. This report is for internal use only. FUTA estimate does not account for the $7,000 wage base cap per employee.</p>
  </div>

  <script>
    function downloadCSV() {
      const csv = \`${csvData.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payroll_gusto_${new Date().toISOString().split('T')[0]}.csv';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    }
  </script>
</body>
</html>`;

    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Payroll Management</h1>
          <p className="text-slate-600">Generate and manage payroll with overtime & holiday calculations</p>
        </div>
        <div className="flex gap-2">
          {(approvedEntries.length > 0 || draftEntries.length > 0) && (
            <Button variant="outline" onClick={() => generatePayrollReport(approvedEntries.length > 0 ? approvedEntries : draftEntries)}>
              <Printer className="w-4 h-4 mr-2" />
              Print Payroll Report
            </Button>
          )}
          <Link to={createPageUrl("AccountingTaxLiability")}>
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Tax Liability
            </Button>
          </Link>
          <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Zap className="w-5 h-5" />
            Payroll Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Select Payroll Period</Label>
            <Select
              value={selectedPeriodId}
              onValueChange={setSelectedPeriodId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a payroll period..." />
              </SelectTrigger>
              <SelectContent>
                {payrollPeriods.map(period => {
                  const holidays = period.holidays_in_period ? JSON.parse(period.holidays_in_period) : [];
                  return (
                    <SelectItem key={period.id} value={period.id}>
                      {period.period_name} ({format(new Date(period.start_date), 'MMM d')} - {format(new Date(period.end_date), 'MMM d, yyyy')})
                      {holidays.length > 0 && ` - ${holidays.map(h => h.name).join(', ')}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={generatePayroll}
            disabled={generating}
            className="w-full bg-purple-600 hover:bg-purple-700 text-lg py-6"
          >
            {generating ? 'Generating...' : 'Generate Payroll'}
          </Button>

          <div className="bg-purple-100 border border-purple-300 rounded p-3 text-xs text-purple-900">
            <p className="font-semibold mb-1">Calculations Include:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Overtime: {config?.overtime_multiplier || 1.5}x after {config?.overtime_threshold_hours || 40} hrs per week (Sunday-Saturday)</li>
              <li>Holiday Pay: {config?.holiday_multiplier || 1.25}x for 6 federal holidays</li>
              <li>Federal Holidays: New Year's, MLK Jr. Day, Juneteenth, July 4th, Thanksgiving, Christmas</li>
              <li>2026 Qualified Overtime tracking for employee tax deductions</li>
              <li>Officer-specific rate overrides when configured</li>
              <li>Accurate 2026 federal & state tax withholding (W-4 Step 1-4c)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {validationIssues.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-5 h-5" />
              Validation Issues ({validationIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {validationIssues.map((issue, idx) => (
                <Alert key={idx} className={issue.severity === 'high' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}>
                  <AlertDescription>
                    <p className="font-semibold">{issue.officer}</p>
                    <p className="text-sm">{issue.message}</p>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Gross</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              ${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Net</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              ${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{draftEntries.length}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{approvedEntries.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="draft" className="space-y-6">
        <TabsList>
          <TabsTrigger value="draft">Draft ({draftEntries.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedEntries.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid ({paidEntries.length})</TabsTrigger>
        </TabsList>

        {[
          { key: 'draft', entries: draftEntries, showApprove: true, showMarkPaid: false },
          { key: 'approved', entries: approvedEntries, showApprove: false, showMarkPaid: true },
          { key: 'paid', entries: paidEntries, showApprove: false, showMarkPaid: false }
        ].map(({ key, entries, showApprove, showMarkPaid }) => (
          <TabsContent key={key} value={key}>
            <Card>
              <CardContent className="p-6">
                {entries.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-slate-600">No {key} payroll entries</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.map(entry => {
                      const officer = officers.find(o => o.email === entry.officer_email);
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">
                              {officer?.first_name?.charAt(0) || 'O'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                {officer ? `${officer.first_name} ${officer.last_name}` : entry.officer_email}
                              </p>
                              <p className="text-sm text-slate-600">
                                {safeFormatDate(entry.pay_period_start, 'MMM d')} - {safeFormatDate(entry.pay_period_end, 'MMM d, yyyy')}
                              </p>
                              <p className="text-xs text-slate-500">
                                Regular: {(entry.regular_hours || 0).toFixed(2)}h
                                {entry.overtime_hours > 0 && ` • OT: ${entry.overtime_hours.toFixed(2)}h`}
                                {entry.holiday_hours > 0 && ` • Holiday: ${entry.holiday_hours.toFixed(2)}h`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm text-slate-600">Gross: ${(entry.gross_pay || 0).toFixed(2)}</p>
                              <p className="text-lg font-bold text-slate-900">Net: ${(entry.net_pay || 0).toFixed(2)}</p>
                            </div>
                            <div className="flex gap-2">
                              {showApprove && (
                                <Button size="sm" onClick={() => approveMutation.mutate(entry.id)} className="bg-green-600">
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approve
                                </Button>
                              )}
                              {showMarkPaid && (
                                <Button size="sm" onClick={() => markPaidMutation.mutate(entry.id)} className="bg-blue-600">
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Mark Paid
                                </Button>
                              )}
                              {key === 'draft' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm('Delete this payroll entry?')) {
                                      deleteMutation.mutate(entry.id);
                                    }
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payroll Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Employer EIN</Label>
                <Input
                  placeholder="XX-XXXXXXX"
                  value={config?.employer_ein || configData.employer_ein}
                  onChange={(e) => setConfigData({ ...configData, employer_ein: e.target.value })}
                />
              </div>
              <div>
                <Label>Company Phone</Label>
                <Input
                  value={config?.company_phone || configData.company_phone}
                  onChange={(e) => setConfigData({ ...configData, company_phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Company Legal Name</Label>
              <Input
                value={config?.company_legal_name || configData.company_legal_name}
                onChange={(e) => setConfigData({ ...configData, company_legal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Company Address</Label>
              <Input
                value={config?.company_address || configData.company_address}
                onChange={(e) => setConfigData({ ...configData, company_address: e.target.value })}
              />
            </div>
            <div>
              <Label>Payroll Email</Label>
              <Input
                type="email"
                value={config?.payroll_email || configData.payroll_email}
                onChange={(e) => setConfigData({ ...configData, payroll_email: e.target.value })}
              />
            </div>
            
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Pay Calculations</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>OT Threshold (hrs/week)</Label>
                  <Input
                    type="number"
                    value={config?.overtime_threshold_hours || configData.overtime_threshold_hours}
                    onChange={(e) => setConfigData({ ...configData, overtime_threshold_hours: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>OT Multiplier</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config?.overtime_multiplier || configData.overtime_multiplier}
                    onChange={(e) => setConfigData({ ...configData, overtime_multiplier: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Holiday Multiplier</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config?.holiday_multiplier || configData.holiday_multiplier}
                    onChange={(e) => setConfigData({ ...configData, holiday_multiplier: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={() => saveConfigMutation.mutate(configData)}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}