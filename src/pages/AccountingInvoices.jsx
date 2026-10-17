import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Send, FileText } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const INVOICE_LOGO_URL = "/black-point-shield.webp";
const DCJS_ID = "DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection";

function HistoricalRateEditor({invoice, saving, onApprove}) {
  const [rate,setRate]=useState('');
  return <div className="mt-2 flex flex-wrap items-center gap-2"><Input type="number" min="0.01" step="0.01" className="w-36" placeholder="Rate per hour" value={rate} onChange={event=>setRate(event.target.value)}/><Button type="button" size="sm" variant="outline" disabled={saving} onClick={()=>onApprove(invoice,rate)}>Save Rate</Button></div>;
}

export default function AccountingInvoices() {
  const [selectedSite, setSelectedSite] = useState("");
  const [billingEmailInput, setBillingEmailInput] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [savingBillingEmail, setSavingBillingEmail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isAccountingRole = user?.role === 'admin' || roles.has('accounting') || roles.has('full_access');

  const { data: accountingData = {}, error: clientsError, refetch: refetchAccounting } = useQuery({
    queryKey: ['accountingFinance'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', { scope: 'finance' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: isAccountingRole,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const clients = accountingData.clients || [];
  const locations = accountingData.locations || [];
  const config = accountingData.config || null;
  const invoices = accountingData.invoices || [];
  const companyLedger=accountingData.financialSummary || {}; 

  const runInvoices = async () => {
    if (generating) return;
    setGenerating(true);
    setBillingStatus('Generating and reconciling invoices for the last completed service week…');
    try {
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'run_now'});
      const data=response?.data||response||{};
      if(data.error) throw new Error(data.error);
      setBillingStatus(`Billing ${data.period_start}–${data.period_end}: ${data.created || 0} created, ${data.updated || 0} updated, ${data.sent || 0} email request(s) accepted, ${data.held || 0} held to prevent overlapping invoices, ${data.delivery_failed || 0} delivery failure(s).`);
      queryClient.invalidateQueries({queryKey:['accountingData']});
      queryClient.invalidateQueries({queryKey:['accountingFinance']});
    } catch(error) { setBillingStatus(`Invoice run failed: ${error?.response?.data?.error || error?.message || 'Unknown server error'}`); }
    finally { setGenerating(false); }
  };
  const saveBillingContact = async () => {
    const location=locations.find(row=>row.site_name===selectedSite);
    if (!location) return alert('Select the site whose client billing address needs updating.');
    try {
      setSavingBillingEmail(true);
      const result=await base44.functions.invoke('manageAccountingRecords',{action:'set_billing_contact',location_id:location.id,contact_email:billingEmailInput});
      const payload=result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      queryClient.invalidateQueries({queryKey:['accountingData']});
      queryClient.invalidateQueries({queryKey:['accountingFinance']});
      setBillingStatus(`Billing recipient saved for ${location.site_name}: ${billingEmailInput || 'management@blackpointkjc.com (fallback)'}`);
    }catch(error){setBillingStatus(`Unable to save billing recipient: ${error?.message || 'Unknown error'}`);}
    finally {setSavingBillingEmail(false);}
  };
  const approveHistoricalRate = async (invoice, inputRate) => {
    const value=Number(inputRate);
    if(!Number.isFinite(value)||value<=0) return setBillingStatus('Enter a valid verified historical contract rate first.');
    if(!window.confirm(`Verify that $${value.toFixed(2)}/hour was the correct contractual billing rate for ${invoice.site_name} during ${invoice.period_start}–${invoice.period_end}. Recalculate this unsent invoice?`)) return;
    setGenerating(true);
    try {
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'approve_historical_rate',invoice_id:invoice.id,verified_rate:value});
      const payload=response?.data||response||{};
      if(payload.error)throw new Error(payload.error);
      queryClient.invalidateQueries({queryKey:['accountingData']});
      queryClient.invalidateQueries({queryKey:['accountingFinance']});
      setBillingStatus(`Invoice ${invoice.invoice_number} recalculated at verified rate $${value.toFixed(2)}/hour. Review before sending.`);
    }catch(error){setBillingStatus(`Unable to verify historical rate: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
  };
  const sendExistingInvoice = async invoice => {
    if (!window.confirm(`Send invoice ${invoice.invoice_number} for ${invoice.site_name}? It will use that site's saved billing contact or management@blackpointkjc.com.`)) return;
    setGenerating(true);
    try {
      const result=await base44.functions.invoke('generateWeeklyInvoices',{action:'send_existing',invoice_id:invoice.id});
      const payload=result?.data || result || {};
      if(payload.error) throw new Error(payload.error);
      setBillingStatus(`Invoice ${invoice.invoice_number} accepted by email provider for ${payload.recipient}.`);
      queryClient.invalidateQueries({queryKey:['accountingData']});
      queryClient.invalidateQueries({queryKey:['accountingFinance']});
    }catch(error){setBillingStatus(`Invoice email failed: ${error?.message || 'Unknown error'}`);}
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

  return (
    <div className="container mx-auto max-w-7xl p-4 md:p-6 min-h-screen">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white">
        <div><h1 className="text-3xl font-black">Black Point · Client Billing</h1><p className="mt-1 text-sm text-slate-300">Invoices, recipients and payment records</p></div>
        <Button type="button" onClick={runInvoices} disabled={generating} className="bg-emerald-600 text-white hover:bg-emerald-500"><Send className="mr-2 h-4 w-4"/>{generating?'Running Billing…':'Run Invoices'}</Button>
      </div>
      {billingStatus && <div role="status" className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm font-medium text-slate-900">{billingStatus}</div>}
      <Card className="mb-5 border-slate-200"><CardContent className="p-4"><Label>Client Invoice Delivery Address</Label><div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={selectedSite} onValueChange={name=>{setSelectedSite(name);const site=locations.find(row=>row.site_name===name);setBillingEmailInput(site?.billing_contact_email||'')}}><SelectTrigger className="w-[260px] max-w-full"><SelectValue placeholder="Select site to edit recipient"/></SelectTrigger><SelectContent>{locations.map(site=><SelectItem key={site.id} value={site.site_name}>{site.site_name}</SelectItem>)}</SelectContent></Select>
        <Input type="email" className="min-w-[220px] flex-1" placeholder="Blank uses management@blackpointkjc.com" value={billingEmailInput} onChange={event=>setBillingEmailInput(event.target.value)}/>
        <Button type="button" variant="outline" disabled={!selectedSite||savingBillingEmail} onClick={saveBillingContact}>{savingBillingEmail?'Saving…':'Save Address'}</Button>
      </div></CardContent></Card>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Total Invoiced',companyLedger.billed_total],['Client Payments',companyLedger.client_payments],['Outstanding Invoices',companyLedger.outstanding_client_invoices],['Estimated Profit',companyLedger.estimated_profit],
      ].map(([title,value])=><div key={title} className="rounded-xl border bg-white p-4"><div className="text-xs font-bold uppercase text-slate-500">{title}</div><div className="mt-2 text-xl font-black text-slate-900">{value==null?'—':`$${Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</div></div>)}</div>
      {(clientsError || accountingData.partial) && <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{clientsError ? `Billing data load failed: ${clientsError.message}` : `Some billing sources need retry: ${(accountingData.load_errors||[]).join(', ')}`} <button className="ml-2 underline" onClick={()=>refetchAccounting()}>Retry</button></div>}
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
                        <p className="font-bold text-blue-600">#{invoice.invoice_number}</p><p className="text-xs text-slate-600">Delivery: {invoice.delivery_status || 'not recorded'} · Recipient: {invoice.delivery_email || invoice.client_email || 'none'}</p>{invoice.billing_review_required && <p className="mt-1 text-xs font-semibold text-red-700">Billing review required: {invoice.billing_review_reason || 'Historical rate unavailable'}</p>}{invoice.billing_review_required && invoice.status==='draft' && <HistoricalRateEditor key={invoice.id} invoice={invoice} saving={generating} onApprove={approveHistoricalRate}/>}{invoice.status === 'draft' && !invoice.billing_review_required && <button type="button" disabled={generating} className="mt-1 block rounded-md border border-emerald-600 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50" onClick={()=>sendExistingInvoice(invoice)}>Send Reviewed Draft Invoice</button>}
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