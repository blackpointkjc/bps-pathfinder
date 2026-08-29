import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, TrendingDown, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { calculatePaidHours } from "@/lib/payrollCalculations";
import { calculateLiveHours, normalizeSiteName, resolveBillingRate } from "@/lib/billingRates";

export default function AccountingProfit() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [liveNow, setLiveNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAccountingRole = user?.additional_roles?.includes('accounting') || user?.additional_roles?.includes('full_access') || user?.role === 'admin';

  const { data: accountingData = {}, refetch: refetchProfit } = useQuery({
    queryKey: ['accountingData', 'profit'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: isAccountingRole,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const timeEntries = accountingData.timeEntries || [];
  const officers = accountingData.users || [];
  const locations = accountingData.locations || [];
  const config = accountingData.config || {};
  const expenseReports = accountingData.expenseReports || [];
  const companyExpenses = accountingData.companyExpenses || [];
  const allUsers = accountingData.users || [];
  const ptoUsage = accountingData.ptoUsage || [];
  const invoices = accountingData.invoices || [];
  const schedules = accountingData.schedules || [];

  useEffect(() => {
    if (!isAccountingRole) return undefined;
    const refresh = () => refetchProfit();
    const unsubscribers = [];
    for (const entity of ['TimeEntry', 'Invoice', 'Location', 'Schedule']) {
      try {
        const unsubscribe = base44.entities[entity].subscribe(refresh);
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch { /* Fifteen-second polling remains active. */ }
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [isAccountingRole, refetchProfit]);

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

  const isDateInRange = (value) => {
    if (!value) return false;
    const dateKey = String(value).slice(0, 10);
    return dateKey >= startDate && dateKey <= endDate;
  };

  // Accrue completed and currently active shifts throughout the selected period.
  const filteredEntries = timeEntries.filter(entry =>
    entry.clock_in && entry.archived !== true && isDateInRange(entry.clock_in)
  );

  const filteredExpenses = expenseReports.filter(expense => {
    const expenseDate = expense.expense_date || expense.date || expense.reimbursed_date || expense.created_date;
    const status = String(expense.status || '').toLowerCase();
    return ['approved', 'reimbursed', 'paid'].includes(status) && isDateInRange(expenseDate);
  });

  const filteredCompanyExpenses = companyExpenses.filter(expense => {
    const status = String(expense.status || '').toLowerCase();
    const expenseDate = expense.paid_date || expense.expense_date || expense.created_date;
    return status === 'paid' && isDateInRange(expenseDate);
  });

  const filteredPTO = ptoUsage.filter(usage =>
    usage.status === 'active' && isDateInRange(usage.usage_date)
  );

  // Sent and paid invoices are earned revenue for the selected service period.
  const filteredInvoices = invoices.filter(invoice => {
    const status = String(invoice.status || '').toLowerCase();
    if (['draft', 'cancelled', 'void'].includes(status)) return false;
    if (invoice.period_start && invoice.period_end) {
      return invoice.period_end >= startDate && invoice.period_start <= endDate;
    }
    return isDateInRange(invoice.paid_date || invoice.invoice_date || invoice.created_date);
  });

  const ptoCost = filteredPTO.reduce((sum, usage) => {
    const employeeEmail = String(usage.officer_email || '').toLowerCase();
    const officer = allUsers.find(o => String(o.email || '').toLowerCase() === employeeEmail);
    return sum + ((Number(usage.hours) || 0) * (Number(officer?.hourly_rate) || 0));
  }, 0);

  const invoiceRevenueBySite = filteredInvoices.reduce((summary, invoice) => {
    const site = normalizeSiteName(invoice.site_name) || 'Unassigned / Nonbillable';
    summary[site] = (summary[site] || 0) + (Number(invoice.total_amount) || 0);
    return summary;
  }, {});
  const invoiceRevenue = Object.values(invoiceRevenueBySite).reduce((sum, amount) => sum + amount, 0);

  const revenueByOfficer = {};
  const payrollByOfficer = {};
  const hoursByOfficer = {};
  const revenueBySite = {};
  const payrollBySite = {};
  const hoursBySite = {};

  const payrollBreakdownByOfficer = {};
  const weeklyHoursByOfficer = {};
  const overtimeThreshold = Number(config.overtime_threshold_hours) || 40;
  const overtimeMultiplier = Number(config.overtime_multiplier) || 1.5;

  // Revenue and labor use the same worked-time records. Entries are sorted so
  // overtime is applied after the weekly threshold and allocated to the site
  // where those overtime hours were actually worked.
  [...filteredEntries].sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in)).forEach(entry => {
    const officer = officers.find(o => String(o.email).toLowerCase() === String(entry.officer_email).toLowerCase());
    if (!officer) return;

    const siteName = normalizeSiteName(entry.location) || 'Unassigned / Nonbillable';
    const location = locations.find(l => normalizeSiteName(l.site_name) === siteName);
    const rawHours = entry.clock_out ? calculatePaidHours(entry) : calculateLiveHours(entry, liveNow);
    const hours = entry.clock_out ? Math.round(rawHours * 100) / 100 : rawHours;
    const { rate: billRate } = resolveBillingRate(entry, location, schedules);
    const revenue = hours * billRate;
    const hourlyRate = Number(officer.hourly_rate) || 0;
    const shiftDate = new Date(entry.clock_in);
    const sunday = new Date(shiftDate);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const weekKey = `${String(officer.email).toLowerCase()}|${format(sunday, 'yyyy-MM-dd')}`;
    const priorWeekHours = weeklyHoursByOfficer[weekKey] || 0;
    const regularHours = Math.min(hours, Math.max(0, overtimeThreshold - priorWeekHours));
    const overtimeHours = Math.max(0, hours - regularHours);
    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;
    const payrollCost = regularPay + overtimePay;
    weeklyHoursByOfficer[weekKey] = priorWeekHours + hours;
    const officerName = `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email;
    const breakdown = payrollBreakdownByOfficer[officerName] || {
      regularHours: 0, regularPay: 0, overtimeHours: 0, overtimePay: 0, holidayHours: 0, holidayPay: 0,
    };
    breakdown.regularHours += regularHours;
    breakdown.regularPay += regularPay;
    breakdown.overtimeHours += overtimeHours;
    breakdown.overtimePay += overtimePay;
    payrollBreakdownByOfficer[officerName] = breakdown;

    revenueByOfficer[officerName] = (revenueByOfficer[officerName] || 0) + revenue;
    payrollByOfficer[officerName] = (payrollByOfficer[officerName] || 0) + payrollCost;
    hoursByOfficer[officerName] = (hoursByOfficer[officerName] || 0) + hours;

    // Site profitability accrues immediately from time worked, including open shifts.
    revenueBySite[siteName] = (revenueBySite[siteName] || 0) + revenue;
    payrollBySite[siteName] = (payrollBySite[siteName] || 0) + payrollCost;
    hoursBySite[siteName] = (hoursBySite[siteName] || 0) + hours;
  });

  // If time records are unavailable for an older invoiced site, retain the
  // finalized invoice amount instead of making that inactive site disappear.
  Object.entries(invoiceRevenueBySite).forEach(([site, amount]) => {
    if (!revenueBySite[site]) revenueBySite[site] = amount;
  });

  // Accrued service revenue updates immediately; invoices remain the finalized record.
  const accruedRevenue = Object.values(revenueBySite).reduce((sum, amount) => sum + amount, 0);
  const totalRevenue = accruedRevenue || invoiceRevenue;
  const totalPayroll = Object.values(payrollByOfficer).reduce((sum, amount) => sum + amount, 0);
  const reimbursableExpenses = filteredExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const operatingExpenses = filteredCompanyExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const totalExpenses = reimbursableExpenses + operatingExpenses;
  const totalLaborCost = totalPayroll + ptoCost;
  const totalCosts = totalLaborCost + totalExpenses;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const openProfitReport = () => {
    const reportWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!reportWindow) return;

    const money = (value) => Number(value || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    const siteRows = Object.keys(revenueBySite)
      .sort((a, b) => (revenueBySite[b] || 0) - (revenueBySite[a] || 0))
      .map(site => {
        const revenue = revenueBySite[site] || 0;
        const payroll = payrollBySite[site] || 0;
        const profit = revenue - payroll;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return `<tr>
          <td><strong>${site}</strong></td>
          <td>${(hoursBySite[site] || 0).toFixed(2)}</td>
          <td>${money(revenue)}</td>
          <td>${money(payroll)}</td>
          <td class="${profit >= 0 ? 'positive' : 'negative'}">${money(profit)}</td>
          <td>${revenue > 0 ? margin.toFixed(1) + '%' : 'Nonbillable'}</td>
        </tr>`;
      }).join('');

    const officerRows = Object.keys(payrollByOfficer)
      .sort((a, b) => (revenueByOfficer[b] || 0) - (revenueByOfficer[a] || 0))
      .map(officerName => {
        const revenue = revenueByOfficer[officerName] || 0;
        const payroll = payrollByOfficer[officerName] || 0;
        const hours = hoursByOfficer[officerName] || 0;
        const profit = revenue - payroll;
        const breakdown = payrollBreakdownByOfficer[officerName] || {};
        return `<tr>
          <td><strong>${officerName}</strong></td>
          <td>${hours.toFixed(2)}</td>
          <td>${money(revenue)}</td>
          <td>${money(payroll)}</td>
          <td class="${profit >= 0 ? 'positive' : 'negative'}">${money(profit)}</td>
          <td>${(breakdown.overtimeHours || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Company Profit Report - ${startDate} to ${endDate}</title>
        <style>
          @page { size: letter landscape; margin: .45in; }
          * { box-sizing: border-box; }
          body { margin:0; background:#eef2f7; color:#0f172a; font:13px/1.45 Arial,sans-serif; }
          .toolbar { position:sticky; top:0; z-index:2; display:flex; justify-content:flex-end; padding:12px 24px; background:#fff; border-bottom:1px solid #dbe3ee; }
          button { border:0; border-radius:9px; background:#0f172a; color:#fff; padding:10px 18px; font-weight:700; cursor:pointer; }
          .report { max-width:11in; margin:24px auto; background:#fff; padding:36px; box-shadow:0 20px 50px rgba(15,23,42,.12); }
          .header { display:flex; justify-content:space-between; gap:30px; padding-bottom:24px; border-bottom:3px solid #0f172a; }
          .eyebrow { color:#047857; font-size:10px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; }
          h1 { margin:5px 0 4px; font-size:30px; letter-spacing:-.7px; }
          .subtle { color:#64748b; }
          .period { text-align:right; }
          .period strong { display:block; font-size:15px; margin-top:5px; }
          .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:24px 0; }
          .metric { border:1px solid #dbe3ee; border-radius:12px; padding:15px; background:#f8fafc; }
          .metric .label { color:#64748b; font-size:9px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
          .metric .value { margin-top:5px; font-size:22px; font-weight:800; }
          .positive { color:#047857; }
          .negative { color:#b91c1c; }
          h2 { margin:26px 0 10px; font-size:16px; }
          table { width:100%; border-collapse:collapse; }
          th { background:#0f172a; color:#fff; padding:10px; text-align:left; font-size:9px; letter-spacing:.8px; text-transform:uppercase; }
          td { padding:10px; border-bottom:1px solid #e2e8f0; }
          tr:nth-child(even) td { background:#f8fafc; }
          .footer { margin-top:28px; padding-top:14px; border-top:1px solid #cbd5e1; display:flex; justify-content:space-between; color:#64748b; font-size:10px; }
          @media print {
            body { background:#fff; }
            .toolbar { display:none; }
            .report { margin:0; max-width:none; padding:0; box-shadow:none; }
            .metric, th { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
        <main class="report">
          <header class="header">
            <div>
              <div class="eyebrow">Black Point Protection Services</div>
              <h1>Company Profit Report</h1>
              <div class="subtle">Revenue, gross labor, operating expenses, and profitability</div>
            </div>
            <div class="period">
              <span class="subtle">Report period</span>
              <strong>${format(new Date(startDate + 'T00:00:00'), 'MMM d, yyyy')} – ${format(new Date(endDate + 'T00:00:00'), 'MMM d, yyyy')}</strong>
              <span class="subtle">Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </header>
          <section class="metrics">
            <div class="metric"><div class="label">Revenue</div><div class="value positive">${money(totalRevenue)}</div></div>
            <div class="metric"><div class="label">Payroll</div><div class="value">${money(totalPayroll)}</div></div>
            <div class="metric"><div class="label">Operating costs</div><div class="value">${money(totalExpenses + ptoCost)}</div></div>
            <div class="metric"><div class="label">Net profit</div><div class="value ${netProfit >= 0 ? 'positive' : 'negative'}">${money(netProfit)}</div></div>
            <div class="metric"><div class="label">Expenses</div><div class="value">${money(totalExpenses)}</div></div>
            <div class="metric"><div class="label">PTO cost</div><div class="value">${money(ptoCost)}</div></div>
            <div class="metric"><div class="label">Net margin</div><div class="value">${profitMargin.toFixed(1)}%</div></div>
          </section>
          <h2>Profitability by Site</h2>
          <table><thead><tr><th>Site / Cost Center</th><th>Hours</th><th>Revenue</th><th>Payroll</th><th>Site Contribution</th><th>Margin</th></tr></thead><tbody>${siteRows || '<tr><td colspan="6">No site activity for this period.</td></tr>'}</tbody></table>
          <h2>Profitability by Employee</h2>
          <table><thead><tr><th>Employee</th><th>Hours</th><th>Revenue</th><th>Payroll</th><th>Contribution</th><th>Overtime Hours</th></tr></thead><tbody>${officerRows || '<tr><td colspan="6">No employee activity for this period.</td></tr>'}</tbody></table>
          <footer class="footer"><span>Internal financial report • Confidential</span></footer>
        </main>
      </body>
      </html>
    `);
    reportWindow.document.close();
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.5in; }
        }
      `}</style>
      <div className="container mx-auto p-4 md:p-6 max-w-7xl print-area">
      <div className="mb-8 rounded-3xl bg-slate-950 p-6 md:p-8 text-white shadow-xl flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-3">
            Financial intelligence
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Company Profit Report</h1>
          <p className="text-slate-300 mt-2">Earned billing, gross accrued wages, operating costs, and margin</p>
          <p className="text-sm text-slate-400 mt-2">Live as of {format(liveNow, 'MMM d, yyyy h:mm:ss a')}</p>
        </div>
        <Button onClick={openProfitReport} className="bg-white text-slate-950 hover:bg-slate-100 no-print w-full md:w-auto">
          <Download className="w-4 h-4 mr-2" />
          Open Professional Report
        </Button>
      </div>

      {/* Date Range Selector */}
      <Card className="mb-6 no-print rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
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

      {/* Print Date Range Display */}
      <div className="hidden print:block mb-6 p-4 bg-slate-50 rounded-lg border">
        <p className="text-sm font-semibold text-slate-900">
          Report Period: {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card className="rounded-2xl border-slate-200 border-l-4 border-l-green-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-green-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Earned Revenue</p>
                <p className="text-lg font-bold text-slate-900">
                  ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 border-l-4 border-l-red-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-red-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Accrued Payroll</p>
                <p className="text-lg font-bold text-slate-900">
                  ${totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 border-l-4 border-l-amber-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-amber-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Expenses</p>
                <p className="text-lg font-bold text-slate-900">
                  ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 border-l-4 border-l-orange-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-orange-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">PTO Cost</p>
                <p className="text-lg font-bold text-slate-900">
                  ${ptoCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`rounded-2xl border-slate-200 border-l-4 shadow-sm ${netProfit >= 0 ? 'border-l-blue-500' : 'border-l-red-500'}`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              {netProfit >= 0 ? (
                <TrendingUp className="w-6 h-6 text-blue-500" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-500" />
              )}
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Net Profit</p>
                <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ${netProfit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 border-l-4 border-l-purple-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              {profitMargin >= 0 ? (
                <TrendingUp className="w-6 h-6 text-purple-500" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-500" />
              )}
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Margin</p>
                <p className={`text-lg font-bold ${profitMargin >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                  {profitMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Profit by Site */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profit Breakdown by Site</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(revenueBySite).length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-lg">
              <p className="text-slate-500">No site data available for the selected date range.</p>
              <p className="text-sm text-slate-400 mt-2">Make sure officers have clocked time entries with locations that have bill rates configured.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(revenueBySite)
                .sort(([, a], [, b]) => b - a)
                .map(([site, revenue]) => {
                  const payroll = payrollBySite[site] || 0;
                  const profit = revenue - payroll;
                  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

                  return (
                    <div key={site} className="p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-slate-900">{site}</p>
                        <Badge className={profit >= 0 ? 'bg-green-600' : 'bg-red-600'}>
                          {margin.toFixed(1)}% margin
                        </Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">Revenue</p>
                          <p className="font-bold text-green-600">${revenue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Payroll</p>
                          <p className="font-bold text-red-600">${payroll.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Hours</p>
                          <p className="font-bold text-slate-900">{hoursBySite[site]?.toFixed(1) || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Profit</p>
                          <p className={`font-bold ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            ${profit.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profit by Officer */}
      <Card>
        <CardHeader>
          <CardTitle>Profit Breakdown by Officer</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(revenueByOfficer).length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-lg">
              <p className="text-slate-500">No officer data available for the selected date range.</p>
              <p className="text-sm text-slate-400 mt-2">Make sure officers have clocked time entries with valid hourly rates and bill rates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(revenueByOfficer)
                .sort(([, a], [, b]) => b - a)
                .map(([officer, revenue]) => {
                  const breakdown = payrollBreakdownByOfficer[officer] || {};
                  // Use actual payroll paid (regular + overtime + holiday) instead of calculated payroll cost
                  const actualPayroll = (breakdown.regularPay || 0) + (breakdown.overtimePay || 0) + (breakdown.holidayPay || 0);
                  const payroll = actualPayroll > 0 ? actualPayroll : (payrollByOfficer[officer] || 0);
                  const profit = revenue - payroll;
                  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

                  return (
                    <div key={officer} className="p-4 bg-slate-50 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                            {officer.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{officer}</p>
                            <p className="text-sm text-slate-600">
                              Revenue: ${revenue.toFixed(2)} | Payroll: ${payroll.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            ${profit.toFixed(2)}
                          </p>
                          <Badge className={profit >= 0 ? 'bg-green-600' : 'bg-red-600'}>
                            {margin.toFixed(1)}% margin
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm border-t pt-3">
                        <div className="bg-white p-2 rounded">
                          <p className="text-slate-600 text-xs">Regular</p>
                          <p className="font-bold text-slate-900">{breakdown.regularHours?.toFixed(1) || 0}h</p>
                          <p className="text-slate-700 font-semibold">${breakdown.regularPay?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-slate-600 text-xs">Overtime</p>
                          <p className="font-bold text-orange-600">{breakdown.overtimeHours?.toFixed(1) || 0}h</p>
                          <p className="text-slate-700 font-semibold">${breakdown.overtimePay?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-slate-600 text-xs">Holiday</p>
                          <p className="font-bold text-green-600">{breakdown.holidayHours?.toFixed(1) || 0}h</p>
                          <p className="text-slate-700 font-semibold">${breakdown.holidayPay?.toFixed(2) || '0.00'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}