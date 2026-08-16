import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { calculateLiveHours, normalizeSiteName, resolveBillingRate } from "@/lib/billingRates";

const DCJS_ID = "DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection";

export default function ClientPayrollReport() {
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [showOfficerNames, setShowOfficerNames] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
  });

  const previewId = getClientPreviewId();
  const { data: billingData = {}, refetch: refetchBilling } = useQuery({
    queryKey: ['clientBillingData', user?.id || user?.email, previewId],
    queryFn: async () => {
      const result = await base44.functions.invoke('getClientBillingData', previewId ? { client_id: previewId } : {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user,
    initialData: {},
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => refetchBilling();
    const unsubscribers = [];
    for (const entity of ['TimeEntry', 'Invoice', 'Location', 'Schedule']) {
      try {
        const unsubscribe = base44.entities[entity].subscribe(refresh);
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch {
        // The three-second refresh remains as a fallback if realtime is unavailable.
      }
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [user?.id, user?.email, refetchBilling]);

  const clientLocations = billingData.assigned_locations || user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);
  const timeEntries = billingData.time_entries || [];
  const officers = billingData.officers || [];
  const locations = billingData.locations || [];
  const clientInvoices = billingData.invoices || [];
  const schedules = billingData.schedules || [];

  // Show invoice popup on first load
  useEffect(() => {
    if (clientInvoices.length > 0) {
      setShowInvoiceDialog(true);
    }
  }, [clientInvoices.length]);

  // Filter to only client's locations
  const filteredEntries = timeEntries.filter(entry => {
    if (!entry.clock_in) return false;
    const entrySite = normalizeSiteName(entry.location);
    if (!clientLocations.map(normalizeSiteName).includes(entrySite)) return false;
    const entryDate = String(entry.clock_in).slice(0, 10);
    return entryDate >= startDate && entryDate <= endDate;
  });

  // Show every current or historical client site, including inactive properties,
  // so its configured bill rate remains visible even when it has no hours this week.
  const billingSummary = {};
  locations.forEach(location => {
    const site = normalizeSiteName(location.site_name);
    if (!site) return;
    billingSummary[site] = {
      hours: 0,
      billedAmount: 0,
      billRate: Number(location.site_bill_rate) || 0,
      shifts: [],
      active: location.active !== false,
    };
  });

  filteredEntries.forEach(entry => {
    const entrySite = normalizeSiteName(entry.location);
    const location = locations.find(l => normalizeSiteName(l.site_name) === entrySite);
    if (!location) return;

    const effectiveClockOut = entry.clock_out ? new Date(entry.clock_out) : liveNow;
    const hours = calculateLiveHours(entry, liveNow);
    const { rate: billRate, rateLabel } = resolveBillingRate(entry, location, schedules);
    if (!billRate) return;
    const billedAmount = hours * billRate;

    if (!billingSummary[entrySite]) {
      billingSummary[entrySite] = { hours: 0, billedAmount: 0, billRate, shifts: [] };
    }

    billingSummary[entrySite].hours += hours;
    billingSummary[entrySite].billedAmount += billedAmount;
    billingSummary[entrySite].shifts.push({
      ...entry,
      clock_out: entry.clock_out || effectiveClockOut.toISOString(),
      live: !entry.clock_out,
      hours,
      billedAmount,
      billRate,
      rateLabel
    });
  });

  const totalHours = Object.values(billingSummary).reduce((sum, data) => sum + data.hours, 0);
  const totalBilled = Object.values(billingSummary).reduce((sum, data) => sum + data.billedAmount, 0);
  const printStoredInvoice = (invoice) => {
    const shifts = invoice.shifts ? JSON.parse(invoice.shifts) : [];
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice #${invoice.invoice_number}</title>
        <style>
          @page { size: letter; margin: .45in; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #0f172a; font: 13px/1.45 Arial, sans-serif; background: #fff; }
          .sheet { max-width: 8.5in; margin: auto; }
          .header { display:flex; justify-content:space-between; gap:32px; padding:28px; border-radius:18px; background:#0f172a; color:white; }
          .brand { font-size:23px; font-weight:800; letter-spacing:-.4px; }
          .muted { color:#cbd5e1; margin-top:6px; }
          .invoice { text-align:right; }
          .invoice h1 { margin:0; font-size:32px; letter-spacing:2px; }
          .invoice strong { color:#fbbf24; }
          .meta { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin:24px 0; }
          .panel { border:1px solid #e2e8f0; border-radius:14px; padding:18px; }
          .label { color:#64748b; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; }
          .value { font-weight:700; font-size:15px; }
          table { width:100%; border-collapse:collapse; margin-top:20px; overflow:hidden; }
          th { background:#f1f5f9; color:#475569; text-align:left; font-size:10px; letter-spacing:.7px; text-transform:uppercase; padding:11px; }
          td { border-bottom:1px solid #e2e8f0; padding:11px; }
          th:last-child, td:last-child { text-align:right; }
          .totals { margin:24px 0 0 auto; width:310px; border-radius:14px; background:#f8fafc; padding:18px; }
          .row { display:flex; justify-content:space-between; margin:7px 0; }
          .grand { border-top:2px solid #0f172a; padding-top:12px; margin-top:12px; font-size:20px; font-weight:800; }
          .notes { margin-top:24px; border-left:4px solid #f59e0b; background:#fffbeb; padding:14px 16px; }
          .footer { margin-top:30px; padding-top:16px; border-top:1px solid #e2e8f0; color:#64748b; text-align:center; font-size:11px; }
          @media print { .header { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
        </style>
      </head>
      <body>
        <style media="print">.invoice-toolbar{display:none!important}</style>
        <div class="invoice-toolbar" style="display:flex;justify-content:flex-end;padding:12px 24px;background:#fff;border-bottom:1px solid #dbe3ee;margin-bottom:20px"><button onclick="window.print()" style="border:0;border-radius:9px;background:#0f172a;color:#fff;padding:10px 18px;font-weight:700;cursor:pointer">Print / Save PDF</button></div>
        <div class="sheet">
          <div class="header">
            <div>
              <div class="brand">Black Point Protection</div>
              <div class="muted">1971 University Blvd, Lynchburg, VA 24515</div>
              <div class="muted">${DCJS_ID}</div>
            </div>
            <div class="invoice">
              <h1>INVOICE</h1>
              <div>#<strong>${invoice.invoice_number}</strong></div>
            </div>
          </div>
          <div class="meta">
            <div class="panel">
              <div class="label">Bill to</div>
              <div class="value">${invoice.client_email || user?.email || ''}</div>
              <div>${invoice.site_name || ''}</div>
            </div>
            <div class="panel">
              <div class="label">Service period</div>
              <div class="value">${format(new Date(invoice.period_start), 'MMM d, yyyy')} – ${format(new Date(invoice.period_end), 'MMM d, yyyy')}</div>
              <div style="margin-top:8px">Due ${invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : 'upon receipt'}</div>
            </div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Officer</th><th>Time</th><th>Hours</th><th>Amount</th></tr></thead>
            <tbody>
              ${shifts.map(shift => `<tr>
                <td>${shift.date || ''}</td>
                <td>${shift.officer || ''}</td>
                <td>${shift.clockIn || ''} – ${shift.clockOut || ''}</td>
                <td>${shift.hours || ''}</td>
                <td>$${Number(shift.amount || 0).toFixed(2)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div class="totals">
            <div class="row"><span>Total hours</span><strong>${Number(invoice.total_hours || 0).toFixed(2)}</strong></div>
            <div class="row grand"><span>Total due</span><span>$${Number(invoice.total_amount || 0).toFixed(2)}</span></div>
          </div>
          ${invoice.notes ? `<div class="notes"><strong>Notes</strong><br>${invoice.notes}</div>` : ''}
          <div class="footer">Payment is due by the date shown above. Please contact the company with invoice questions.</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const generateInvoice = () => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Security Services Invoice</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.5in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; }
          .invoice-header { background: #1e40af; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
          .title { font-size: 24pt; font-weight: bold; }
          .subtitle { font-size: 12pt; margin-top: 5px; }
          .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .info-box { padding: 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; }
          .info-label { font-size: 8pt; color: #64748b; font-weight: bold; text-transform: uppercase; }
          .info-value { font-size: 11pt; color: #1e293b; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #e0e7ff; color: #1e40af; font-weight: bold; text-align: left; padding: 10px; border: 1px solid #cbd5e1; }
          td { padding: 8px; border: 1px solid #cbd5e1; }
          .text-right { text-align: right; }
          .total-row { background: #dbeafe; font-weight: bold; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #1e40af; text-align: center; font-size: 9pt; color: #64748b; }
        </style>
      </head>
      <body>
        <style media="print">.invoice-toolbar{display:none!important}</style>
        <div class="invoice-toolbar" style="display:flex;justify-content:flex-end;padding:12px 24px;background:#fff;border-bottom:1px solid #dbe3ee;margin-bottom:20px"><button onclick="window.print()" style="border:0;border-radius:9px;background:#0f172a;color:#fff;padding:10px 18px;font-weight:700;cursor:pointer">Print / Save PDF</button></div>
        <div class="invoice-header">
          <div class="title">SECURITY SERVICES INVOICE</div>
        </div>

        <div class="info-section">
          <div class="info-box">
            <div class="info-label">Bill To</div>
            <div class="info-value">${user?.full_name || user?.email}</div>
            <div class="info-value">${clientLocations.join(', ')}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Invoice Period</div>
            <div class="info-value">${format(new Date(startDate), 'MMMM d, yyyy')} - ${format(new Date(endDate), 'MMMM d, yyyy')}</div>
            <div class="info-label" style="margin-top: 10px;">Invoice Date</div>
            <div class="info-value">${format(new Date(), 'MMMM d, yyyy')}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              ${showOfficerNames ? '<th>Officer</th>' : ''}
              <th>Site</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th class="text-right">Hours</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(billingSummary).map(([site, data]) => 
              data.shifts.map(shift => {
                const officer = officers.find(o => o.email === shift.officer_email);
                const officerName = officer ? `${officer.first_name} ${officer.last_name}` : 'Officer';
                
                return `
                  <tr>
                    <td>${format(new Date(shift.clock_in), 'MMM d, yyyy')}</td>
                    ${showOfficerNames ? `<td>${officerName}</td>` : ''}
                    <td>${site}</td>
                    <td>${format(new Date(shift.clock_in), 'HH:mm')}</td>
                    <td>${format(new Date(shift.clock_out), 'HH:mm')}</td>
                    <td class="text-right">${shift.hours.toFixed(2)}</td>
                    <td class="text-right">$${data.billRate.toFixed(2)}</td>
                    <td class="text-right">$${shift.billedAmount.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')
            ).join('')}
            <tr class="total-row">
              <td colspan="${showOfficerNames ? '6' : '5'}" class="text-right">TOTAL:</td>
              <td class="text-right">${totalHours.toFixed(2)}</td>
              <td class="text-right">$${totalBilled.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p style="margin-top: 10px;">Thank you for your business</p>
        </div>

      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheet Report</h1>
          <p className="text-slate-600">View timesheets and billing for your sites</p>
        </div>
      </div>

      {/* Invoice Notification Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📋 New Invoices Available</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {clientInvoices.length === 0 ? (
              <p className="text-slate-600">No invoices at this time.</p>
            ) : (
              clientInvoices.map(invoice => {
                const shifts = invoice.shifts ? JSON.parse(invoice.shifts) : [];
                return (
                  <Card key={invoice.id} className="border border-slate-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-600">Invoice #{invoice.invoice_number}</p>
                          <p className="font-semibold text-slate-900">{invoice.site_name}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={invoice.status === 'paid' ? 'bg-green-600' : 'bg-blue-600'}>
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </Badge>
                          <p className="text-sm text-slate-600 mt-2">
                            {format(new Date(invoice.period_start), 'MMM d')} - {format(new Date(invoice.period_end), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-slate-50 rounded-lg overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100">
                              <th className="text-left p-3 font-medium text-slate-700">Employee</th>
                              <th className="text-left p-3 font-medium text-slate-700">Date</th>
                              <th className="text-center p-3 font-medium text-slate-700">Clock In</th>
                              <th className="text-center p-3 font-medium text-slate-700">Clock Out</th>
                              <th className="text-right p-3 font-medium text-slate-700">Hours</th>
                              <th className="text-right p-3 font-medium text-slate-700">Rate</th>
                              <th className="text-right p-3 font-medium text-slate-700">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {shifts.map((shift, idx) => (
                              <tr key={idx} className="hover:bg-white">
                                <td className="p-3 text-slate-900">{shift.officer}</td>
                                <td className="p-3 text-slate-600">{shift.date}</td>
                                <td className="p-3 text-center text-slate-600">{shift.clockIn}</td>
                                <td className="p-3 text-center text-slate-600">{shift.clockOut}</td>
                                <td className="p-3 text-right text-slate-900 font-medium">{shift.hours}</td>
                                <td className="p-3 text-right text-slate-600">${shift.rate}</td>
                                <td className="p-3 text-right text-slate-900 font-semibold">${shift.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                        <div>
                          <p className="text-sm text-slate-600">Total Hours: <span className="font-semibold text-slate-900">{invoice.total_hours?.toFixed(2)}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-600">Invoice Total</p>
                          <p className="text-2xl font-bold text-green-600">${invoice.total_amount?.toFixed(2)}</p>
                        </div>
                      </div>
                      {invoice.notes && (
                        <div className="p-3 bg-blue-50 rounded text-sm text-slate-700">
                          <p className="font-medium mb-1">Notes:</p>
                          <p>{invoice.notes}</p>
                        </div>
                      )}
                      <div className="flex flex-col gap-3 pt-3 border-t border-slate-200 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                          Due: {format(new Date(invoice.due_date), 'MMM d, yyyy')}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => printStoredInvoice(invoice)}>
                          <Download className="w-4 h-4 mr-2" />
                          View / Print Invoice
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">

        {/* Date Range & Options */}
        <Card className="mb-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-4 mb-4">
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
              <Button
                onClick={generateInvoice}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Generate Invoice
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="show_names"
              checked={showOfficerNames}
              onCheckedChange={setShowOfficerNames}
            />
            <Label htmlFor="show_names" className="cursor-pointer text-sm">
              Include officer names in invoice
            </Label>
          </div>
        </CardContent>
      </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{totalHours.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Billed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">
              ${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

        {/* Breakdown by Site */}
        <Card>
        <CardHeader>
          <CardTitle>Billing Breakdown by Site</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(billingSummary).map(([site, data]) => (
              <div key={site} className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-900">{site}</p>
                    <p className="text-sm text-slate-600">Rate: ${data.billRate.toFixed(2)}/hour</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">{data.hours.toFixed(2)} hours</p>
                    <p className="text-xl font-bold text-green-600">${data.billedAmount.toFixed(2)}</p>
                  </div>
                </div>

                <details>
                  <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                    View {data.shifts.length} shifts
                  </summary>
                  <div className="mt-2 space-y-1">
                    {data.shifts.map(shift => {
                      const officer = officers.find(o => o.email === shift.officer_email);
                      return (
                        <div key={shift.id} className="text-xs p-2 bg-white rounded border flex justify-between">
                          <span>
                            {showOfficerNames && officer && `${officer.first_name} ${officer.last_name} • `}
                            {format(new Date(shift.clock_in), 'MMM d, HH:mm')} - {format(new Date(shift.clock_out), 'HH:mm')}
                          </span>
                          <span className="font-medium">
                            {shift.hours.toFixed(2)}h × ${data.billRate.toFixed(2)} = ${shift.billedAmount.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
