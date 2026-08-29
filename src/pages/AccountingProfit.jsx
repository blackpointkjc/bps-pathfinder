import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Clock3, DollarSign, Download, RefreshCw, TrendingDown, TrendingUp, Users, WalletCards } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { calculatePaidHours, calculatePayrollHours } from "@/lib/payrollCalculations";
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

  const { data: accountingData = {}, isLoading: accountingLoading, isFetching: accountingFetching, error: accountingError, refetch: refetchProfit } = useQuery({
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
  const accountingLoadErrors = accountingData.load_errors || [];

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
  const payrollHoursByOfficer = {};
  const revenueBySite = {};
  const payrollBySite = {};
  const hoursBySite = {};
  const payrollHoursBySite = {};

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
    const rawServiceHours = entry.clock_out ? calculatePaidHours(entry) : calculateLiveHours(entry, liveNow);
    const rawPayrollHours = entry.clock_out ? calculatePayrollHours(entry) : rawServiceHours;
    const serviceHours = entry.clock_out ? Math.round(rawServiceHours * 100) / 100 : rawServiceHours;
    const payrollHours = entry.clock_out ? Math.round(rawPayrollHours * 100) / 100 : rawPayrollHours;
    const { rate: billRate } = resolveBillingRate(entry, location, schedules);
    // Client billing follows the true service record. Payroll follows the approved
    // payroll hours, so an administrator can limit pay without altering punches.
    const revenue = serviceHours * billRate;
    const hourlyRate = Number(officer.hourly_rate) || 0;
    const shiftDate = new Date(entry.clock_in);
    const sunday = new Date(shiftDate);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const weekKey = `${String(officer.email).toLowerCase()}|${format(sunday, 'yyyy-MM-dd')}`;
    const priorWeekHours = weeklyHoursByOfficer[weekKey] || 0;
    const regularHours = Math.min(payrollHours, Math.max(0, overtimeThreshold - priorWeekHours));
    const overtimeHours = Math.max(0, payrollHours - regularHours);
    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;
    const payrollCost = regularPay + overtimePay;
    weeklyHoursByOfficer[weekKey] = priorWeekHours + payrollHours;
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
    hoursByOfficer[officerName] = (hoursByOfficer[officerName] || 0) + serviceHours;
    payrollHoursByOfficer[officerName] = (payrollHoursByOfficer[officerName] || 0) + payrollHours;

    // Site profitability accrues immediately from time worked, including open shifts.
    revenueBySite[siteName] = (revenueBySite[siteName] || 0) + revenue;
    payrollBySite[siteName] = (payrollBySite[siteName] || 0) + payrollCost;
    hoursBySite[siteName] = (hoursBySite[siteName] || 0) + serviceHours;
    payrollHoursBySite[siteName] = (payrollHoursBySite[siteName] || 0) + payrollHours;
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
  const totalServiceHours = Object.values(hoursByOfficer).reduce((sum, hours) => sum + hours, 0);
  const totalApprovedPayrollHours = Object.values(payrollHoursByOfficer).reduce((sum, hours) => sum + hours, 0);
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
          <td>${(hoursBySite[site] || 0).toFixed(2)} / ${(payrollHoursBySite[site] || 0).toFixed(2)}</td>
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
          <td>${hours.toFixed(2)} / ${(payrollHoursByOfficer[officerName] || 0).toFixed(2)}</td>
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
          <table><thead><tr><th>Site / Cost Center</th><th>Service / Paid Hours</th><th>Revenue</th><th>Payroll</th><th>Site Contribution</th><th>Margin</th></tr></thead><tbody>${siteRows || '<tr><td colspan="6">No site activity for this period.</td></tr>'}</tbody></table>
          <h2>Profitability by Employee</h2>
          <table><thead><tr><th>Employee</th><th>Service / Paid Hours</th><th>Revenue</th><th>Payroll</th><th>Contribution</th><th>Overtime Hours</th></tr></thead><tbody>${officerRows || '<tr><td colspan="6">No employee activity for this period.</td></tr>'}</tbody></table>
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
      <div className="container mx-auto max-w-7xl p-4 md:p-6 print-area">
      <section className="relative mb-6 overflow-hidden rounded-[30px] border border-slate-700/80 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-2xl md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <WalletCards className="h-3.5 w-3.5" />
              Financial operations
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">Company Profit Report</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-300">Earned billing, gross accrued wages, operating costs, and margin—calculated from live operational records.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />Live as of {format(liveNow, 'MMM d, yyyy h:mm:ss a')}</span>
              {accountingFetching && <span className="inline-flex items-center gap-2 text-sky-300"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Refreshing</span>}
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <Button onClick={() => refetchProfit()} disabled={accountingFetching} className="border border-slate-600 bg-slate-800 text-white hover:bg-slate-700 no-print">
              <RefreshCw className={`mr-2 h-4 w-4 ${accountingFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={openProfitReport} className="bg-white text-slate-950 hover:bg-slate-100 no-print">
              <Download className="mr-2 h-4 w-4" />
              Open Professional Report
            </Button>
          </div>
        </div>
        <div className="relative mt-7 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2">
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Period start</Label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="border-slate-600 bg-slate-950/60 text-white [color-scheme:dark]" />
          </div>
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">Period end</Label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="border-slate-600 bg-slate-950/60 text-white [color-scheme:dark]" />
          </div>
        </div>
      </section>

      {accountingError && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-700/60 bg-red-950/40 p-4 text-red-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div><p className="font-bold">Profit data could not be loaded</p><p className="mt-1 text-sm text-red-200">{accountingError.message || 'Refresh to try again.'}</p></div>
        </div>
      )}
      {!accountingError && accountingLoadErrors.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-600/50 bg-amber-950/30 p-4 text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div><p className="font-bold">Some financial sources are temporarily unavailable</p><p className="mt-1 text-sm text-amber-200">Available totals remain visible. Refresh after the remaining sources recover.</p></div>
        </div>
      )}
      {accountingLoading && (
        <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-900/80 p-5 text-sm text-slate-300">Loading live financial operations…</div>
      )}

      {/* Print Date Range Display */}
      <div className="hidden print:block mb-6 p-4 bg-slate-50 rounded-lg border">
        <p className="text-sm font-semibold text-slate-900">
          Report Period: {format(new Date(startDate), 'MMM d, yyyy')} - {format(new Date(endDate), 'MMM d, yyyy')}
        </p>
      </div>

      {/* Financial summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Earned billing', value: totalRevenue, icon: DollarSign, color: 'text-emerald-300', border: 'border-emerald-500/35', note: `${totalServiceHours.toFixed(1)} service hours` },
          { label: 'Gross accrued wages', value: totalPayroll, icon: Users, color: 'text-sky-300', border: 'border-sky-500/35', note: `${totalApprovedPayrollHours.toFixed(1)} approved payroll hours` },
          { label: 'Operating costs', value: totalExpenses, icon: Building2, color: 'text-amber-300', border: 'border-amber-500/35', note: 'Approved reimbursements and paid expenses' },
          { label: 'Net profit', value: netProfit, icon: netProfit >= 0 ? TrendingUp : TrendingDown, color: netProfit >= 0 ? 'text-violet-300' : 'text-red-300', border: netProfit >= 0 ? 'border-violet-500/35' : 'border-red-500/35', note: `${profitMargin.toFixed(1)}% net margin` },
        ].map(metric => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className={`overflow-hidden rounded-2xl border bg-slate-900/85 text-white shadow-lg ${metric.border}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
                    <p className={`mt-3 break-words text-3xl font-black tracking-tight ${metric.color}`}>
                      {metric.value < 0 ? '-' : ''}${Math.abs(metric.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-slate-400">{metric.note}</p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                    <Icon className={`h-5 w-5 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Service hours', value: `${totalServiceHours.toFixed(2)}h`, icon: Clock3 },
          { label: 'Approved payroll hours', value: `${totalApprovedPayrollHours.toFixed(2)}h`, icon: WalletCards },
          { label: 'PTO labor cost', value: `$${ptoCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Users },
          { label: 'Total operating outlay', value: `$${(totalExpenses + ptoCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Building2 },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p><p className="truncate text-sm font-bold text-slate-200">{item.value}</p></div>
            </div>
          );
        })}
      </div>

      {/* Profit by Site */}
      <Card className="mb-6 overflow-hidden rounded-2xl border-slate-700 bg-slate-900/80 text-white shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Building2 className="h-5 w-5 text-emerald-300" />Profitability by Site</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(revenueBySite).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/45 p-8 text-center">
              <p className="text-slate-300">No site activity was found for this period.</p>
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
                    <div key={site} className="rounded-xl border border-slate-700 bg-slate-950/55 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-white">{site}</p>
                        <Badge className={profit >= 0 ? 'bg-green-600' : 'bg-red-600'}>
                          {margin.toFixed(1)}% margin
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">
                        <div>
                          <p className="text-slate-400">Billing</p>
                          <p className="font-bold text-emerald-300">${revenue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Gross Wages</p>
                          <p className="font-bold text-rose-300">${payroll.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Service Hours</p>
                          <p className="font-bold text-white">{hoursBySite[site]?.toFixed(1) || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Paid Hours</p>
                          <p className="font-bold text-sky-300">{payrollHoursBySite[site]?.toFixed(1) || 0}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Contribution</p>
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
      <Card className="overflow-hidden rounded-2xl border-slate-700 bg-slate-900/80 text-white shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Users className="h-5 w-5 text-sky-300" />Profitability by Officer</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(revenueByOfficer).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/45 p-8 text-center">
              <p className="text-slate-300">No officer activity was found for this period.</p>
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
                    <div key={officer} className="rounded-xl border border-slate-700 bg-slate-950/55 p-4">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                            {officer.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{officer}</p>
                            <p className="max-w-2xl text-sm leading-5 text-slate-400">
                              Service: {(hoursByOfficer[officer] || 0).toFixed(1)}h • Paid: {(payrollHoursByOfficer[officer] || 0).toFixed(1)}h • Billing: ${revenue.toFixed(2)} • Wages: ${payroll.toFixed(2)}
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
                      <div className="grid grid-cols-1 gap-3 border-t border-slate-700 pt-3 text-sm sm:grid-cols-3">
                        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                          <p className="text-xs text-slate-400">Regular</p>
                          <p className="font-bold text-white">{breakdown.regularHours?.toFixed(1) || 0}h</p>
                          <p className="font-semibold text-slate-300">${breakdown.regularPay?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                          <p className="text-xs text-slate-400">Overtime</p>
                          <p className="font-bold text-orange-600">{breakdown.overtimeHours?.toFixed(1) || 0}h</p>
                          <p className="font-semibold text-slate-300">${breakdown.overtimePay?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                          <p className="text-xs text-slate-400">Holiday</p>
                          <p className="font-bold text-green-600">{breakdown.holidayHours?.toFixed(1) || 0}h</p>
                          <p className="font-semibold text-slate-300">${breakdown.holidayPay?.toFixed(2) || '0.00'}</p>
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