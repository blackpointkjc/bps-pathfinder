import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Plus, Send, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calculateLiveHours, getDefaultBillingPeriod, normalizeSiteName, resolveBillingRate } from "@/lib/billingRates";

const INVOICE_LOGO_URL = "/black-point-shield.webp";
const DCJS_ID = "DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection";

export default function AccountingInvoices() {
  const defaultPeriod = getDefaultBillingPeriod();
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [billingEmailInput, setBillingEmailInput] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [savingBillingEmail, setSavingBillingEmail] = useState(false);
  const [startDate, setStartDate] = useState(defaultPeriod.startDate);
  const [endDate, setEndDate] = useState(defaultPeriod.endDate);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isAccountingRole = user?.role === 'admin' || roles.has('accounting') || roles.has('full_access');

  const { data: accountingData = {}, isLoading: clientsLoading, error: clientsError, refetch: refetchAccounting } = useQuery({
    queryKey: ['accountingData', 'invoices'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', { scope: 'invoices' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: isAccountingRole,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!isAccountingRole) return undefined;
    const refresh = () => refetchAccounting();
    const unsubscribers = [];
    for (const entity of ['TimeEntry', 'Invoice', 'Location', 'Schedule']) {
      try {
        const unsubscribe = base44.entities[entity].subscribe(refresh);
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch {
        // Fifteen-second polling remains active when realtime is unavailable.
      }
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [isAccountingRole, refetchAccounting]);
  const clients = accountingData.clients || [];
  const locations = accountingData.locations || [];
  const timeEntries = accountingData.timeEntries || [];
  const config = accountingData.config || null;
  const invoices = accountingData.invoices || [];
  const schedules = accountingData.schedules || [];

  const generateInvoices = async (action, siteId = '') => {
    if (clientsError || (accountingData.load_errors || []).length) throw new Error('Billing data is incomplete. Refresh and retry.');
    const response = await base44.functions.invoke('generateWeeklyInvoices', {
      action, ...(siteId ? {location_id:siteId} : {}),
      period_start:startDate, period_end:endDate,
    });
    const payload=response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    await Promise.all([
      queryClient.invalidateQueries({queryKey:['accountingData']}),
      queryClient.invalidateQueries({queryKey:['accountingOverviewSnapshot']}),
    ]);
    setBillingStatus(`${payload.created || 0} invoice(s) created · ${payload.sent || 0} email(s) accepted by provider · ${payload.delivery_failed || 0} delivery error(s) · ${payload.skipped || 0} unchanged/no billable shifts.`);
    return payload;
  };
  const generateInvoice = async () => {
    const location=locations.find(row=>normalizeSiteName(row.site_name)===normalizeSiteName(selectedSite));
    if (!location) return alert('Select a billable site first.');
    setGenerating(true);
    try {await generateInvoices('run_now',location.id);}
    catch(error){setBillingStatus(`Invoice generation failed: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
  };
  const saveBillingContact = async () => {
    const location=locations.find(row=>normalizeSiteName(row.site_name)===normalizeSiteName(selectedSite));
    if (!location) return alert('Select the site whose client billing address needs updating.');
    try {
      setSavingBillingEmail(true);
      const result=await base44.functions.invoke('manageAccountingRecords',{action:'set_billing_contact',location_id:location.id,contact_email:billingEmailInput});
      const payload=result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      await queryClient.invalidateQueries({queryKey:['accountingData']});
      setBillingStatus(`Billing recipient saved for ${location.site_name}: ${billingEmailInput || 'management@blackpointkjc.com (fallback)'}`);
    }catch(error){setBillingStatus(`Unable to save billing recipient: ${error?.message || 'Unknown error'}`);}
    finally {setSavingBillingEmail(false);}
  };
  const sendExistingInvoice = async invoice => {
    if (!window.confirm(`Send invoice ${invoice.invoice_number} for ${invoice.site_name}? It will use that site's saved billing contact or management@blackpointkjc.com.`)) return;
    setGenerating(true);
    try {
      const result=await base44.functions.invoke('generateWeeklyInvoices',{action:'send_existing',invoice_id:invoice.id});
      const payload=result?.data || result || {};
      if(payload.error) throw new Error(payload.error);
      setBillingStatus(`Invoice ${invoice.invoice_number} accepted by email provider for ${payload.recipient}.`);
      await queryClient.invalidateQueries({queryKey:['accountingData']});
    }catch(error){setBillingStatus(`Invoice email failed: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
  };
  const backfillInvoices = async () => {
    if (!window.confirm('Create missing weekly invoices for the past 16 weeks as DRAFTS for review? No historical emails will be sent automatically.')) return;
    setGenerating(true);
    try {await generateInvoices('backfill_drafts');}
    catch(error){setBillingStatus(`Historical invoice draft generation failed: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
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

  const selectedClientRecord = clients.find(client => client.email === selectedClient);
  const assignedSiteNames = new Set([
    selectedClientRecord?.assigned_location,
    ...(selectedClientRecord?.assigned_locations || []),
    ...(selectedClientRecord?.assigned_sites || []),
  ].filter(Boolean));
  const clientLocations = selectedClient
    ? locations.filter(location => location.assigned_client_email === selectedClient || assignedSiteNames.has(location.site_name))
    : locations;

  const liveInvoicePreview = timeEntries.reduce((summary, entry) => {
    if (!entry.clock_in || entry.archived === true) return summary;
    const entryDate = String(entry.clock_in).slice(0, 10);
    if (entryDate < startDate || entryDate > endDate) return summary;
    const entrySite = normalizeSiteName(entry.location);
    const location = clientLocations.find(item => normalizeSiteName(item.site_name) === entrySite);
    if (!location || (selectedSite && entrySite !== normalizeSiteName(selectedSite))) return summary;
    const { rate } = resolveBillingRate(entry, location, schedules);
    if (!rate) return summary;
    const rawHours = calculateLiveHours(entry, liveNow);
    const hours = entry.clock_out ? Math.round(rawHours * 100) / 100 : rawHours;
    summary.hours += hours;
    summary.amount += hours * rate;
    summary.activeShifts += entry.clock_out ? 0 : 1;
    return summary;
  }, { hours: 0, amount: 0, activeShifts: 0 });

  const generateAllSitesInvoices = async () => {
    setGenerating(true);
    try {await generateInvoices('run_now');}
    catch(error){setBillingStatus(`Company billing failed: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl min-h-screen">
      <div className="mb-8 rounded-3xl bg-slate-950 p-6 md:p-8 text-white shadow-xl flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-blue-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300 mb-3">Accounts receivable</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Client Invoices</h1>
          <p className="text-slate-300 mt-2">Create, deliver, review, and print professional client invoices</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={generateAllSitesInvoices}
            disabled={generating || clientsLoading || !!clientsError || !!(accountingData.load_errors || []).length}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            All Sites
          </Button>
          <Button
            onClick={() => document.getElementById('invoice-generator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Single Site
          </Button>
        </div>
      </div>

      {billingStatus && <div role="status" className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm font-semibold text-blue-950">{billingStatus}</div>}
      <div className="mb-4 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={generating} onClick={backfillInvoices}>Create Missing Historical Drafts (16 Weeks)</Button><Button type="button" variant="outline" disabled={clientsLoading} onClick={()=>refetchAccounting()}>Refresh Actual Billing Data</Button></div>
      <Card id="invoice-generator" className="mb-6 scroll-mt-6 rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Invoice Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Filter by Client (optional)</Label>
              {clientsLoading && <p className="mb-2 text-xs text-slate-500">Loading client accounts…</p>}
              {clientsError && <p className="mb-2 text-xs text-red-600">Client accounts could not be loaded. Refresh and try again.</p>}
              {!clientsLoading && !clientsError && clients.length === 0 && <p className="mb-2 text-xs text-amber-700">No client portal accounts exist yet. Billing still works by site; unconfigured recipients go to management@blackpointkjc.com.</p>}
              <Select value={selectedClient} onValueChange={v=>{setSelectedClient(v);setSelectedSite('');}}>
                <SelectTrigger>
                  <SelectValue placeholder="All billable locations" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.email} value={client.email}>
                      {client.first_name && client.last_name 
                        ? `${client.first_name} ${client.last_name}` 
                        : (client.full_name && client.full_name !== client.email ? `${client.full_name} (${client.email})` : client.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Select Site</Label>
              <Select 
                value={selectedSite} 
                onValueChange={name => { setSelectedSite(name); const match=locations.find(row=>row.site_name===name);setBillingEmailInput(match?.billing_contact_email || ''); }}
                disabled={clientsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose site..." />
                </SelectTrigger>
                <SelectContent>
                  {clientLocations.map(loc => (
                    <SelectItem key={loc.id} value={loc.site_name}>
                      {loc.site_name} {loc.site_bill_rate ? `($${loc.site_bill_rate}/hr)` : '(No rate set)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 rounded-xl border border-slate-200 p-3">
              <Label>Verified Client Billing Email for Selected Site</Label>
              <div className="mt-2 flex flex-wrap gap-2"><Input type="email" className="min-w-[220px] flex-1" placeholder="Blank sends to management@blackpointkjc.com" value={billingEmailInput} onChange={event=>setBillingEmailInput(event.target.value)} /><Button type="button" disabled={!selectedSite || savingBillingEmail} onClick={saveBillingContact}>{savingBillingEmail?'Saving…':'Save Billing Recipient'}</Button></div>
              <p className="mt-1 text-xs text-slate-500">Set this to the verified client's billing mailbox. Unset sites route invoices to Black Point management rather than a personal administrator email.</p>
            </div>
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Live Sunday–Saturday invoice preview</p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedSite || 'All billable company properties'}
                </p>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-slate-500">Hours</p>
                  <p className="text-xl font-bold text-slate-900">{liveInvoicePreview.hours.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Current amount</p>
                  <p className="text-xl font-bold text-emerald-700">{'$'}{liveInvoicePreview.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Accrues locally each second from the most recently synced time entries. {liveInvoicePreview.activeShifts} officer shift(s) currently clocked in.
            </p>
          </div>

          <div>
            <Label>Invoice Notes (Optional)</Label>
            <Textarea
              placeholder="Additional notes for the invoice..."
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={generateInvoice}
            disabled={generating || !selectedClient || !selectedSite}
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6"
          >
            {generating ? (
              <>Generating Invoice...</>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Generate & Send Invoice to Client
              </>
            )}
          </Button>

          <p className="text-xs text-purple-900">
            Invoice will be automatically sent to client portal and notify them via email
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Invoice Ledger — Actual Records ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600">No invoices yet. Generate your first invoice above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map(invoice => {
                const client = clients.find(c => c.email === invoice.client_email);
                const clientName = client ? `${client.first_name} ${client.last_name}` : invoice.client_email;
                
                return (
                  <div key={invoice.id} className="flex flex-col gap-4 p-4 md:p-5 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-bold text-blue-600">#{invoice.invoice_number}</p><p className="text-xs text-slate-600">Delivery: {invoice.delivery_status || 'not recorded'} · Recipient: {invoice.delivery_email || invoice.client_email || 'none'}</p>{invoice.status === 'draft' && <button type="button" disabled={generating} className="mt-1 block rounded-md border border-emerald-600 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50" onClick={()=>sendExistingInvoice(invoice)}>Send Reviewed Draft Invoice</button>}
                        <Badge className={
                          invoice.status === 'paid' ? 'bg-green-600' :
                          invoice.status === 'overdue' ? 'bg-red-600' :
                          invoice.status === 'sent' ? 'bg-blue-600' : 'bg-slate-600'
                        }>
                          {invoice.status}
                        </Badge>
                      </div>
                      <p className="font-semibold text-slate-900">{clientName} - {invoice.site_name}</p>
                      <p className="text-sm text-slate-600">
                        {format(new Date(invoice.period_start), 'MMM d')} - {format(new Date(invoice.period_end), 'MMM d, yyyy')} • 
                        {' '}{invoice.total_hours.toFixed(1)} hrs @ ${invoice.bill_rate}/hr
                      </p>
                      <p className="text-xs text-slate-500">
                        Created {format(new Date(invoice.created_date), 'MMM d, yyyy')}
                        {invoice.due_date && ` • Due ${format(new Date(invoice.due_date), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:block md:text-right">
                      <p className="text-2xl font-bold text-green-600">
                        ${invoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => {
                          const shifts = JSON.parse(invoice.shifts || '[]');
                          const client = clients.find(c => c.email === invoice.client_email);
                          const clientName = client ? `${client.first_name} ${client.last_name}` : invoice.client_email;
                          
                          const invoiceWindow = window.open('', '_blank');
                          invoiceWindow.document.write(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                              <title>Invoice ${invoice.invoice_number}</title>
                              <style>
                                * { box-sizing: border-box; }
                                body { font-family: Arial, sans-serif; margin: 0; background: #eef2f7; color: #0f172a; }
                                .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; padding: 12px 24px; background: white; border-bottom: 1px solid #dbe3ee; }
                                .toolbar button { border: 0; border-radius: 9px; background: #0f172a; color: white; padding: 10px 18px; font-weight: 700; cursor: pointer; }
                                .invoice-container { max-width: 8.5in; margin: 24px auto; padding: 36px; background: white; box-shadow: 0 20px 50px rgba(15,23,42,.12); }
                                .invoice-header {
                                  display: flex;
                                  justify-content: space-between;
                                  border-radius: 16px;
                                  background: #0f172a;
                                  padding: 24px;
                                  margin-bottom: 30px;
                                }
                                .company-info { flex: 1; display:flex; gap:15px; align-items:center; }
                                .company-logo { width:72px; height:72px; object-fit:contain; background:transparent; padding:0; }
                                .company-copy { flex:1; }
                                .company-name {
                                  font-size: 24px;
                                  font-weight: bold;
                                  color: #ffffff;
                                  margin-bottom: 5px;
                                }
                                .company-details {
                                  font-size: 11px;
                                  color: #64748b;
                                  line-height: 1.6;
                                }
                                .invoice-title {
                                  text-align: right;
                                  flex: 1;
                                }
                                .invoice-number {
                                  font-size: 32px;
                                  font-weight: bold;
                                  color: #fbbf24;
                                }
                                .invoice-date {
                                  font-size: 12px;
                                  color: #cbd5e1;
                                  margin-top: 5px;
                                }
                                .bill-to {
                                  background: #f8fafc;
                                  padding: 15px;
                                  border-radius: 8px;
                                  margin-bottom: 30px;
                                }
                                .bill-to-label {
                                  font-size: 12px;
                                  font-weight: bold;
                                  color: #64748b;
                                  margin-bottom: 5px;
                                }
                                .bill-to-name {
                                  font-size: 16px;
                                  font-weight: bold;
                                  color: #1e293b;
                                }
                                .invoice-details {
                                  display: grid;
                                  grid-template-columns: repeat(3, 1fr);
                                  gap: 15px;
                                  margin-bottom: 30px;
                                }
                                .detail-box {
                                  background: #f8fafc;
                                  padding: 12px;
                                  border-radius: 6px;
                                }
                                .detail-label {
                                  font-size: 11px;
                                  color: #64748b;
                                  font-weight: 600;
                                  margin-bottom: 4px;
                                }
                                .detail-value {
                                  font-size: 14px;
                                  font-weight: bold;
                                  color: #1e293b;
                                }
                                table {
                                  width: 100%;
                                  border-collapse: collapse;
                                  margin-bottom: 30px;
                                }
                                th {
                                  background: #0f172a;
                                  color: white;
                                  padding: 12px;
                                  text-align: left;
                                  font-size: 12px;
                                  font-weight: 600;
                                }
                                td {
                                  padding: 10px 12px;
                                  border-bottom: 1px solid #e2e8f0;
                                  font-size: 11px;
                                  color: #475569;
                                }
                                tr:hover {
                                  background: #f8fafc;
                                }
                                .totals {
                                  text-align: right;
                                  margin-top: 20px;
                                }
                                .total-row {
                                  display: flex;
                                  justify-content: flex-end;
                                  padding: 8px 0;
                                  font-size: 14px;
                                }
                                .total-label {
                                  width: 150px;
                                  text-align: right;
                                  padding-right: 20px;
                                  color: #64748b;
                                }
                                .total-value {
                                  width: 120px;
                                  font-weight: bold;
                                  color: #1e293b;
                                }
                                .grand-total {
                                  border-top: 2px solid #d4a72c;
                                  padding-top: 10px;
                                  margin-top: 10px;
                                }
                                .grand-total .total-label,
                                .grand-total .total-value {
                                  font-size: 18px;
                                  color: #1e40af;
                                }
                                .footer {
                                  margin-top: 40px;
                                  padding-top: 20px;
                                  border-top: 1px solid #e2e8f0;
                                  text-align: center;
                                  font-size: 11px;
                                  color: #64748b;
                                }
                                .notes {
                                  background: #fef3c7;
                                  border-left: 4px solid #f59e0b;
                                  padding: 15px;
                                  margin-top: 30px;
                                  border-radius: 4px;
                                }
                                .notes-title {
                                  font-weight: bold;
                                  color: #92400e;
                                  margin-bottom: 8px;
                                }
                                .notes-text {
                                  color: #78350f;
                                  font-size: 12px;
                                  line-height: 1.5;
                                }
                                @media print {
                                  body { background: white; }
                                  .toolbar { display: none; }
                                  .invoice-container { margin: 0; padding: 0; max-width: none; box-shadow: none; }
                                  .invoice-header, th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                                  @page { margin: 0.5in; }
                                }
                              </style>
                            </head>
                            <body>
                              <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
                              <div class="invoice-container">
                                <div class="invoice-header">
                                  <div class="company-info">
                                    <img class="company-logo" src="${INVOICE_LOGO_URL}" alt="Black Point Protection">
                                    <div class="company-copy"><div class="company-name">${config?.company_legal_name || 'Black Point Protection Services'}</div>
                                    <div class="company-details" style="color:#cbd5e1">
                                      ${config?.company_address || '1971 University Blvd, Lynchburg, VA 24515'}<br>
                                      Email: ${config?.payroll_email || 'admin@blackpointkjs.com'} • Phone: ${config?.company_phone || 'Not provided'}<br>
                                      EIN: ${config?.employer_ein || 'Not provided'}
                                    </div></div>
                                  </div>
                                  <div class="invoice-title">
                                    <div class="invoice-number">#${invoice.invoice_number}</div>
                                    <div class="invoice-date">Date: ${format(new Date(invoice.created_date), 'MMM d, yyyy')}</div>
                                    <div class="invoice-date">Due: ${format(new Date(invoice.due_date), 'MMM d, yyyy')}</div>
                                  </div>
                                </div>

                                <div class="bill-to">
                                  <div class="bill-to-label">BILL TO</div>
                                  <div class="bill-to-name">${clientName}</div>
                                  <div class="company-details">${invoice.site_name}</div>
                                </div>

                                <div class="invoice-details">
                                  <div class="detail-box">
                                    <div class="detail-label">SERVICE PERIOD</div>
                                    <div class="detail-value">${format(new Date(invoice.period_start), 'MMM d')} - ${format(new Date(invoice.period_end), 'MMM d, yyyy')}</div>
                                  </div>
                                  <div class="detail-box">
                                    <div class="detail-label">TOTAL HOURS</div>
                                    <div class="detail-value">${invoice.total_hours.toFixed(2)} hrs</div>
                                  </div>
                                  <div class="detail-box">
                                    <div class="detail-label">HOURLY RATE</div>
                                    <div class="detail-value">$${invoice.bill_rate.toFixed(2)}/hr</div>
                                  </div>
                                </div>

                                <table>
                                  <thead>
                                    <tr>
                                      <th>Date</th>
                                      <th>Officer</th>
                                      <th>Clock In</th>
                                      <th>Clock Out</th>
                                      <th style="text-align: right;">Hours</th>
                                      <th style="text-align: right;">Rate</th>
                                      <th style="text-align: right;">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    ${shifts.map(shift => `
                                      <tr>
                                        <td>${shift.date}</td>
                                        <td>${shift.officer}</td>
                                        <td>${shift.clockIn}</td>
                                        <td>${shift.clockOut}</td>
                                        <td style="text-align: right;">${shift.hours}</td>
                                        <td style="text-align: right;">$${shift.rate}</td>
                                        <td style="text-align: right;">$${shift.amount}</td>
                                      </tr>
                                    `).join('')}
                                  </tbody>
                                </table>

                                <div class="totals">
                                  <div class="total-row">
                                    <div class="total-label">Subtotal:</div>
                                    <div class="total-value">$${invoice.total_amount.toFixed(2)}</div>
                                  </div>
                                  <div class="total-row grand-total">
                                    <div class="total-label">Total Due:</div>
                                    <div class="total-value">$${invoice.total_amount.toFixed(2)}</div>
                                  </div>
                                </div>

                                ${invoice.notes ? `
                                  <div class="notes">
                                    <div class="notes-title">Notes</div>
                                    <div class="notes-text">${invoice.notes}</div>
                                  </div>
                                ` : ''}

                                <div class="footer">
                                  <p>Thank you for your business!</p>
                                  <p>Payment is due within 15 days. Please remit payment to the address above.</p>
                                  <p><strong>${config?.company_legal_name || 'Black Point Protection Services'}</strong> • Professional Security Services</p>
                                  <p>${DCJS_ID}</p>
                                </div>
                              </div>
                            </body>
                            </html>
                          `);
                        }}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        View / Print
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}