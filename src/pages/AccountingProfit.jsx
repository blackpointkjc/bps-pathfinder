import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, TrendingDown, Download, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { calculatePaidHours } from "@/lib/payrollCalculations";

export default function AccountingProfit() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAccountingRole = user?.additional_roles?.includes('accounting') || user?.role === 'admin';

  const { data: timeEntries } = useQuery({
    queryKey: ['timeEntries', startDate, endDate],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in', 1000),
    enabled: isAccountingRole,
    initialData: [],
  });

  const { data: officers } = useQuery({
    queryKey: ['officers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
    initialData: [],
  });

  const { data: payrollEntries } = useQuery({
    queryKey: ['payrollEntries', startDate, endDate],
    queryFn: () => base44.entities.PayrollEntry.list('-pay_date', 1000),
    enabled: isAccountingRole,
    initialData: [],
    refetchInterval: 10000,
  });

  const { data: expenseReports } = useQuery({
    queryKey: ['expenseReports', startDate, endDate],
    queryFn: () => base44.entities.ExpenseReport.list('-created_date', 1000),
    initialData: [],
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: timeOffRequests } = useQuery({
    queryKey: ['timeOffRequests', startDate, endDate],
    queryFn: () => base44.entities.TimeOffRequest.list('-created_date', 1000),
    initialData: [],
  });

  const { data: invoices } = useQuery({
    queryKey: ['invoices', startDate, endDate],
    queryFn: () => base44.entities.Invoice.list('-created_date', 1000),
    enabled: isAccountingRole,
    initialData: [],
  });

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

  // Include the entire selected end date and only completed shifts.
  const filteredEntries = timeEntries.filter(entry =>
    entry.clock_in && entry.clock_out && isDateInRange(entry.clock_in)
  );

  const filteredPayroll = payrollEntries.filter(entry =>
    entry.status === 'paid' && isDateInRange(entry.pay_date)
  );

  const filteredExpenses = expenseReports.filter(expense => {
    const expenseDate = expense.expense_date || expense.date || expense.reimbursed_date || expense.created_date;
    const status = String(expense.status || '').toLowerCase();
    return ['approved', 'reimbursed', 'paid'].includes(status) && isDateInRange(expenseDate);
  });

  const filteredPTO = timeOffRequests.filter(pto =>
    pto.status === 'approved' && pto.request_type === 'paid' && isDateInRange(pto.start_date)
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

  const ptoCost = filteredPTO.reduce((sum, pto) => {
    const employeeEmail = pto.requested_by_email || pto.created_by;
    const officer = allUsers.find(o => o.email === employeeEmail);
    return sum + ((Number(pto.hours_requested) || 0) * (Number(officer?.hourly_rate) || 0));
  }, 0);

  const invoiceRevenue = filteredInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);

  const revenueByOfficer = {};
  const payrollByOfficer = {};
  const hoursByOfficer = {};
  const revenueBySite = {};
  const payrollBySite = {};
  const hoursBySite = {};

  // Labor is a cost when worked, even before payroll is finalized and even when
  // the work is office/support time with no client bill rate.
  filteredEntries.forEach(entry => {
    const officer = officers.find(o => o.email === entry.officer_email);
    if (!officer) return;

    const location = locations.find(l => l.site_name === entry.location);
    const hours = calculatePaidHours(entry);
    const billRate = Number(location?.site_bill_rate) || 0;
    const revenue = hours * billRate;
    const payrollCost = hours * (Number(officer.hourly_rate) || 0);
    const officerName = `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email;
    const siteName = entry.location || 'Unassigned / Nonbillable';

    revenueByOfficer[officerName] = (revenueByOfficer[officerName] || 0) + revenue;
    payrollByOfficer[officerName] = (payrollByOfficer[officerName] || 0) + payrollCost;
    hoursByOfficer[officerName] = (hoursByOfficer[officerName] || 0) + hours;

    revenueBySite[siteName] = (revenueBySite[siteName] || 0) + revenue;
    payrollBySite[siteName] = (payrollBySite[siteName] || 0) + payrollCost;
    hoursBySite[siteName] = (hoursBySite[siteName] || 0) + hours;
  });

  // Use invoiced site revenue when available instead of an estimate from time.
  filteredInvoices.forEach(invoice => {
    if (invoice.site_name) {
      revenueBySite[invoice.site_name] = (revenueBySite[invoice.site_name] || 0);
    }
  });

  const payrollBreakdownByOfficer = {};
  filteredPayroll.forEach(entry => {
    const officer = officers.find(o => o.email === entry.officer_email);
    if (!officer) return;
    const officerName = `${officer.first_name || ''} ${officer.last_name || ''}`.trim() || officer.email;
    const breakdown = payrollBreakdownByOfficer[officerName] || {
      regularHours: 0, regularPay: 0, overtimeHours: 0,
      overtimePay: 0, holidayHours: 0, holidayPay: 0,
    };
    breakdown.regularHours += Number(entry.regular_hours) || 0;
    breakdown.regularPay += Number(entry.regular_pay) || 0;
    breakdown.overtimeHours += Number(entry.overtime_hours) || 0;
    breakdown.overtimePay += Number(entry.overtime_pay) || 0;
    breakdown.holidayHours += Number(entry.holiday_hours) || 0;
    breakdown.holidayPay += Number(entry.holiday_pay) || 0;
    payrollBreakdownByOfficer[officerName] = breakdown;
  });

  // If payroll has not been finalized yet, show the accrued regular hours/pay
  // from completed time entries instead of misleading zeroes.
  Object.keys(payrollByOfficer).forEach(officerName => {
    if (!payrollBreakdownByOfficer[officerName]) {
      payrollBreakdownByOfficer[officerName] = {
        regularHours: hoursByOfficer[officerName] || 0,
        regularPay: payrollByOfficer[officerName] || 0,
        overtimeHours: 0,
        overtimePay: 0,
        holidayHours: 0,
        holidayPay: 0,
      };
    }
  });

  const estimatedRevenue = Object.values(revenueBySite).reduce((sum, val) => sum + val, 0);
  const totalRevenue = invoiceRevenue > 0 ? invoiceRevenue : estimatedRevenue;
  const finalizedPayroll = filteredPayroll.reduce((sum, entry) => sum + (Number(entry.gross_pay) || 0), 0);
  const accruedPayroll = Object.values(payrollByOfficer).reduce((sum, amount) => sum + amount, 0);
  const totalPayroll = Math.max(finalizedPayroll, accruedPayroll);
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const employerTaxes = totalPayroll * 0.0765;
  const totalCosts = totalPayroll + totalExpenses + ptoCost + employerTaxes;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

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
      <div className="container mx-auto p-6 max-w-7xl print-area">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Company Profit Report</h1>
          <p className="text-slate-600">Revenue, expenses, and profit analysis</p>
          <p className="text-sm text-slate-500 mt-1">Generated on {format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>
        <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 no-print">
          <Download className="w-4 h-4 mr-2" />
          Print Report
        </Button>
      </div>

      {/* Date Range Selector */}
      <Card className="mb-6 no-print">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-4">
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
            <div className="flex items-end">
              <Button className="w-full">
                <Calendar className="w-4 h-4 mr-2" />
                Apply Date Range
              </Button>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-green-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Revenue</p>
                <p className="text-lg font-bold text-slate-900">
                  ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-red-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Payroll</p>
                <p className="text-lg font-bold text-slate-900">
                  ${totalPayroll.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
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

        <Card className="border-l-4 border-l-orange-500">
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

        <Card className={`border-l-4 ${netProfit >= 0 ? 'border-l-blue-500' : 'border-l-red-500'}`}>
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

        <Card className="border-l-4 border-l-purple-500">
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

        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <DollarSign className="w-6 h-6 text-teal-500" />
              <div className="text-right">
                <p className="text-xs text-slate-600 font-medium">Employer Taxes</p>
                <p className="text-lg font-bold text-slate-900">
                  ${(totalPayroll * 0.0765).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Formula */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="p-6">
          <h3 className="font-bold text-slate-900 mb-2">Profit Calculation Formula:</h3>
          {invoiceRevenue > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-3 border border-amber-200">
              ℹ️ Using invoice revenue (${invoiceRevenue.toFixed(2)}) from {filteredInvoices.length} invoices
            </p>
          )}
          <p className="text-slate-700">
            <span className="font-semibold">Revenue</span> (${totalRevenue.toFixed(2)}) 
            {' - '}
            <span className="font-semibold">(Payroll</span> (${totalPayroll.toFixed(2)}) 
            {' + '}
            <span className="font-semibold">Employer Taxes</span> (${employerTaxes.toFixed(2)})
            {' + '}
            <span className="font-semibold">Expenses</span> (${totalExpenses.toFixed(2)})
            {' + '}
            <span className="font-semibold">PTO Cost</span> (${ptoCost.toFixed(2)}))
            {' = '}
            <span className={`font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              Net Profit (${netProfit.toFixed(2)})
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            * Employer Taxes calculated at 7.65% (Social Security 6.2% + Medicare 1.45%) of total payroll
          </p>
        </CardContent>
      </Card>

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