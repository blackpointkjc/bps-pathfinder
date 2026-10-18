import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Send, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const INVOICE_LOGO_URL = "/black-point-shield.webp";
const DCJS_ID = "DCJS ID: 11-30423 • KJC Security Solution LLC DBA Black Point Protection";

function HistoricalRateEditor({invoice, saving, onApprove}) {
  const [rate,setRate]=useState('');
  return <div className="mt-2 flex flex-wrap items-center gap-2"><Input type="number" min="0.01" step="0.01" className="w-36" placeholder="Rate per hour" value={rate} onChange={event=>setRate(event.target.value)}/><Button type="button" size="sm" variant="outline" disabled={saving} onClick={()=>onApprove(invoice,rate)}>Save Rate</Button></div>;
}

export default function AccountingInvoices() {
  const [selectedSite, setSelectedSite] = useState("");
  const [invoiceStart,setInvoiceStart]=useState('');
  const [invoiceEnd,setInvoiceEnd]=useState('');
  const [confirmAction,setConfirmAction]=useState(null);
  const [billingEmailInput, setBillingEmailInput] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [billingRunIssues, setBillingRunIssues] = useState([]);
  const [savingBillingEmail, setSavingBillingEmail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checkingOverdue,setCheckingOverdue]=useState(false);
  const [overdueReport,setOverdueReport]=useState(null);
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [savingPaymentId, setSavingPaymentId] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const isAccountingRole = user?.role === 'admin' || roles.has('accounting') || roles.has('full_access');

  const { data: accountingData = {}, error: clientsError, refetch: refetchAccounting } = useQuery({
    queryKey: ['accountingBilling'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', { scope: 'invoices' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: isAccountingRole,
    staleTime: 30000,
    refetchOnMount: 'always',
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const clients = accountingData.clients || [];
  const locations = accountingData.locations || [];
  const config = accountingData.config || null;
  const invoices = (accountingData.invoices || []).filter(invoice => !['void','cancelled'].includes(String(invoice.status || '').toLowerCase()));
 

  const askConfirmation=(title,message,execute)=>setConfirmAction({title,message,execute});
  const syncInvoiceData=async()=>{
    // Accounting saves are committed on the server before cache refresh. A
    // throttled reload must not make a successful invoice look like it failed.
    await Promise.allSettled([
      queryClient.invalidateQueries({queryKey:['accountingBilling']}),
      queryClient.invalidateQueries({queryKey:['accountingFinance']}),
      queryClient.invalidateQueries({queryKey:['accountingProfit']}),
    ]);
  };
  const saveSelectedInvoice=async()=>{
    const site=locations.find(row=>row.site_name===selectedSite);
    if(!site||!invoiceStart||!invoiceEnd)return setBillingStatus('Choose the billing site and service start/end dates.');
    if(invoiceEnd<invoiceStart)return setBillingStatus('The service end date must not precede the start date.');
    setGenerating(true);
    setBillingStatus('Creating invoice and requesting email delivery…');
    try{
      const response=await base44.functions.invoke('generateWeeklyInvoices',{
        action:'create_invoice',location_id:site.id,period_start:invoiceStart,period_end:invoiceEnd,
      });
      const payload=response?.data||response||{};
      if(payload.error)throw new Error(payload.error);
      if(payload.processing_failed)throw new Error((payload.results||[]).find(item=>item.error)?.error||'Invoice processing failed');
      await syncInvoiceData();
      if(payload.created||payload.updated){
        setBillingStatus(`Invoice ${payload.created||0} created or ${payload.updated||0} updated for ${site.site_name}, ${invoiceStart}–${invoiceEnd}. ${payload.sent||0} email request(s) accepted; ${payload.delivery_failed||0} failed; ${payload.held||0} held for review. Add another without refreshing.`);
        setInvoiceStart('');setInvoiceEnd('');
      } else {
        const issue=(payload.results||[]).find(item=>item.reason||item.error);
        setBillingStatus(issue?.reason||`No new invoice saved: ${payload.held||0} overlapping interval(s), ${payload.skipped||0} without new billable hours. Existing invoices remain unchanged.`);
      }
    }catch(error){setBillingStatus(`Invoice could not be saved: ${error?.response?.data?.error||error?.message||'Server error'}`);}
    finally{setGenerating(false);}
  };
  const checkOverdueInvoices=async(action='preview')=>{
    setCheckingOverdue(true);
    try{
      const response=await base44.functions.invoke('applyInvoiceLateFees',{action});
      const result=response?.data||response||{};
      if(result.error)throw new Error(result.error);
      setOverdueReport(result);
      if(action==='run_now'){
        await syncInvoiceData();
        setBillingStatus(`Overdue processing completed: ${result.fees_assessed||0} new 10% late fees, ${result.overdue||0} overdue balances updated, ${result.emails_accepted||0} email requests accepted, ${result.failed||0} failures.`);
      }
    }catch(error){setBillingStatus(`Unable to check overdue invoices: ${error?.response?.data?.error||error?.message||'Backend unavailable'}`);}
    finally{setCheckingOverdue(false);}
  };
  const dueSummary=(()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p=(type)=>parts.find(item=>item.type===type)?.value||'';
    const today=`${p('year')}-${p('month')}-${p('day')}`;
    const drafts=invoices.filter(row=>row.status==='draft').length;
    const issued=invoices.filter(row=>['sent','pending','partial','overdue'].includes(row.status));
    const pastDue=issued.filter(row=>row.due_date&&row.due_date<today&&Number(row.amount_paid||0)<Number(row.total_amount||0));
    const ready=pastDue.filter(row=>row.delivery_status==='accepted'&&!row.billing_review_required);
    const nextDue=issued.filter(row=>row.due_date>=today).map(row=>row.due_date).sort()[0]||invoices.filter(row=>row.due_date>=today).map(row=>row.due_date).sort()[0]||null;
    return {drafts,issued:issued.length,pastDue:pastDue.length,ready:ready.length,nextDue,today,lateFees:invoices.reduce((sum,row)=>sum+Number(row.late_fee_amount||0),0)};
  })();
  const sendVerifiedDrafts=async()=>{
    setGenerating(true);setBillingStatus('Verifying historical drafts, service date overlaps and confirmed billing rates before sending…');
    try{
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'send_ready_drafts'});
      const data=response?.data||response||{};
      if(data.error)throw new Error(data.error);
      setBillingRunIssues((data.results||[]).filter(row=>row.status!=='sent').map(row=>({...row,invoice_number:row.invoice_number||row.invoice,status:row.status,error:row.error||row.status})));
      setBillingStatus(`Historical invoicing: ${data.sent||0} verified invoices emailed; ${data.held||0} held for rate/overlap/date review; ${data.failed||0} send failures; ${data.due_dates_updated||0} due dates corrected.`);
      await syncInvoiceData();
    }catch(error){setBillingStatus(`Historical invoice processing failed: ${error?.response?.data?.error||error?.message||'Server failure'}`);}
    finally{setGenerating(false);}
  };
  const runInvoices = async () => {
    if (generating) return;
    setGenerating(true);
    setBillingRunIssues([]);
    setBillingStatus('Generating and reconciling invoices for the last completed service week…');
    try {
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'run_now'});
      const data=response?.data||response||{};
      if(data.error) throw new Error(data.error);
      setBillingStatus(`Billing ${data.period_start}–${data.period_end}: ${data.created || 0} created, ${data.updated || 0} updated, ${data.sent || 0} email request(s) accepted, ${data.held || 0} held to prevent overlapping invoices, ${data.delivery_failed || 0} delivery failure(s), ${data.processing_failed || 0} site processing failure(s).`);
      setBillingRunIssues((data.results || []).filter(item => ['overlap_requires_review','legacy_delivery_unconfirmed','processing_failed','delivery_failed'].includes(String(item.status))));
      await syncInvoiceData();
    } catch(error) { setBillingStatus(`Invoice run failed: ${error?.response?.data?.error || error?.message || 'Unknown server error'}`); }
    finally { setGenerating(false); }
  };
  const reconcileHistoricalDrafts = async () => {
    setGenerating(true);
    setBillingStatus('Reconciling historical invoice drafts from recorded time entries and contract rate history…');
    try {
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'backfill_drafts'});
      const data=response?.data || response || {};
      if(data.error)throw new Error(data.error);
      setBillingStatus(`Historical draft reconciliation: ${data.created||0} new drafts, ${data.updated||0} updated, ${data.held||0} overlapping invoices held, ${data.processing_failed||0} errors. No emails sent.`);
      await queryClient.invalidateQueries({queryKey:['accountingBilling']});
    }catch(error){setBillingStatus(`Historical draft reconciliation failed: ${error?.response?.data?.error||error?.message||'Server error'}`);}
    finally{setGenerating(false);}
  };
  const saveBillingContact = async () => {
    const location=locations.find(row=>row.site_name===selectedSite);
    if (!location) return setBillingStatus('Select the site whose billing address needs updating.');
    try {
      setSavingBillingEmail(true);
      const result=await base44.functions.invoke('manageAccountingRecords',{action:'set_billing_contact',location_id:location.id,contact_email:billingEmailInput});
      const payload=result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      await syncInvoiceData();
      setBillingStatus(`Billing recipient saved for ${location.site_name}: ${billingEmailInput || 'management@blackpointkjc.com (fallback)'}`);
    }catch(error){setBillingStatus(`Unable to save billing recipient: ${error?.message || 'Unknown error'}`);}
    finally {setSavingBillingEmail(false);}
  };
  const approveHistoricalRate = async (invoice, inputRate) => {
    const value=Number(inputRate);
    if(!Number.isFinite(value)||value<=0) return setBillingStatus('Enter a valid verified historical contract rate first.');
    setGenerating(true);
    try {
      const response=await base44.functions.invoke('generateWeeklyInvoices',{action:'approve_historical_rate',invoice_id:invoice.id,verified_rate:value});
      const payload=response?.data||response||{};
      if(payload.error)throw new Error(payload.error);
      // Update the shared UI cache immediately, then reconcile other ledgers
      // from the server once without blocking the rate editor.
      queryClient.setQueryData(['accountingBilling'], previous => previous ? ({
        ...previous,
        invoices: (previous.invoices||[]).map(item=>item.id===invoice.id ? ({...item,...(payload.invoice||{}),
          total_amount:payload.total_amount,bill_rate:value,billing_review_required:false,
          billing_review_reason:'',delivery_status:'pending'}) : item),
      }) : previous);
      queryClient.invalidateQueries({queryKey:['accountingBilling']});
      setBillingStatus(`Invoice ${invoice.invoice_number} recalculated at verified rate $${value.toFixed(2)}/hour. Review before sending.`);
    }catch(error){setBillingStatus(`Unable to verify historical rate: ${error?.message || 'Unknown error'}`);}
    finally {setGenerating(false);}
  };
  const updateInvoicePayment = async (invoice, forcedStatus) => {
    const state=paymentDrafts[invoice.id] || {};
    const target=forcedStatus || state.status || String(invoice.status || 'pending');
    const amount=target==='paid'?Number(invoice.total_amount):state.amount_paid !== undefined?Number(state.amount_paid):Number(invoice.amount_paid||0);
    if(invoice.billing_review_required) return setBillingStatus('Review and verify this invoice’s historical contract rate before posting payments.');
    setSavingPaymentId(invoice.id);
    try {
      const response=await base44.functions.invoke('manageAccountingRecords',{
        action:'update_invoice_payment',invoice_id:invoice.id,payment_status:target,amount_paid:amount,
        payment_reference:state.payment_reference||invoice.payment_reference||'',payment_method:state.payment_method||invoice.payment_method||'',
        paid_date:new Date().toISOString().slice(0,10),
      });
      const result=response?.data||response||{};
      if(result.error)throw new Error(result.error);
      queryClient.setQueryData(['accountingBilling'],previous => previous ? ({...previous,
        invoices:(previous.invoices||[]).map(row=>row.id===invoice.id?{...row,...(result.record||{})}:row),
      }):previous);
      await Promise.all([
        queryClient.invalidateQueries({queryKey:['accountingBilling']}),
        queryClient.invalidateQueries({queryKey:['accountingOverviewSnapshot']}),
      ]);
      setBillingStatus(`Invoice ${invoice.invoice_number} updated to ${target.toUpperCase()} — $${amount.toFixed(2)} received, balance $${Math.max(0,Number(invoice.total_amount)-amount).toFixed(2)}.`);
    }catch(error){setBillingStatus(`Could not update invoice ${invoice.invoice_number}: ${error?.response?.data?.error||error?.message||'Server rejected update'}`);}
    finally{setSavingPaymentId(null);}
  };
  const sendExistingInvoice = async invoice => {
    setGenerating(true);
    try {
      const result=await base44.functions.invoke('generateWeeklyInvoices',{action:'send_existing',invoice_id:invoice.id});
      const payload=result?.data || result || {};
      if(payload.error) throw new Error(payload.error);
      setBillingStatus(`Invoice ${invoice.invoice_number} accepted by email provider for ${payload.recipient}.`);
      await syncInvoiceData();
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
        <div><h1 className="text-3xl font-black">Black Point · Client Billing</h1><p className="mt-1 text-sm text-slate-300">Company-wide invoices, service revenue, recipients and payments</p></div>
        <Button type="button" onClick={runInvoices} disabled={generating} className="bg-emerald-600 text-white hover:bg-emerald-500"><Send className="mr-2 h-4 w-4"/>{generating?'Running Billing…':'Run Invoices'}</Button>
      </div>
      <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900">
        <div className="font-black">Automatic 10% Overdue Fees · Invoice Eligibility</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><span>Unsent drafts: <strong>{dueSummary.drafts}</strong></span><span>Issued invoices: <strong>{dueSummary.issued}</strong></span><span>Past due balances: <strong>{dueSummary.pastDue}</strong></span><span>Eligible for late fee: <strong>{dueSummary.ready}</strong></span><span>Late fees assessed: <strong>${dueSummary.lateFees.toFixed(2)}</strong></span><span>Next due: <strong>{dueSummary.nextDue||'No upcoming date'}</strong></span></div>
        <p className="mt-2 text-xs text-slate-600">The automated service checks every morning at 8 AM Eastern. It assesses one 10% charge only after the due date on an issued, provider-accepted, unpaid invoice. Drafts and future-dated invoices are not charged.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={checkingOverdue||generating} onClick={()=>checkOverdueInvoices('preview')}>{checkingOverdue?'Checking…':'Check Overdue Eligibility'}</Button><Button type="button" disabled={checkingOverdue||generating} onClick={()=>askConfirmation('Process Overdue Invoices','Mark truly past-due issued invoices overdue, assess each one-time 10% charge, update client balances, and request notices. Future due dates and drafts will be skipped.',()=>checkOverdueInvoices('run_now'))}>Process Overdue Now</Button></div>
        {overdueReport?.summary && <p role="status" className="mt-2 rounded bg-white p-2 text-xs">As of {overdueReport.as_of?.slice(0,10)}: {overdueReport.summary.eligible} eligible; {overdueReport.summary.future_due} not yet due; {overdueReport.summary.drafts} drafts; {overdueReport.summary.not_provider_accepted} awaiting verified email acceptance; {overdueReport.summary.under_review} under rate review. {overdueReport.summary.future_dated_overdue>0?`${overdueReport.summary.future_dated_overdue} record(s) are incorrectly labeled overdue before their due date and need reconciliation.`:''}</p>}
      </div>
      <div className="mb-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={generating} onClick={()=>askConfirmation('Reconcile Historical Invoices','Recalculate only unsent invoice drafts for the past 16 weeks. Sent and paid invoices will not be changed.',reconcileHistoricalDrafts)}>Reconcile Historical Drafts (16 Weeks)</Button><Button type="button" variant="outline" disabled={generating} onClick={()=>askConfirmation('Issue Verified Historical Drafts','Send previously unsent invoices whose rates and items are verified. Invoice due dates will use period end + 15 days; overlapping invoices are held to avoid double billing.',sendVerifiedDrafts)}>Send All Verified Drafts</Button><Button type="button" variant="outline" disabled={generating} onClick={()=>refetchAccounting()}>Refresh Billing Records</Button></div>
      {billingStatus && <div role="status" className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm font-medium text-slate-900">{billingStatus}</div>}
      {billingRunIssues.length>0 && <div className="mb-4 space-y-2 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"><strong>Billing items requiring action</strong>{billingRunIssues.map((item,index)=><div key={`${item.site}-${index}`} className="border-t border-amber-300 pt-2"><strong>{item.site || 'Unassigned site'}</strong> — {item.status==='overlap_requires_review' ? `Existing invoice #${item.invoice_number} covers these dates; a second invoice was not sent.` : item.status==='legacy_delivery_unconfirmed' ? `Invoice #${item.invoice_number} was held because prior email delivery cannot be confirmed.` : `Billing failed: ${item.error || 'Review this site'}`}</div>)}</div>}
      <Card className="mb-5 border-slate-200"><CardContent className="space-y-3 p-4">
        <div><h2 className="text-lg font-bold text-slate-900">Create & Send Invoice for Recorded Service</h2><p className="text-sm text-slate-600">Choose a site and completed service dates. Invoices with verified rates are automatically emailed; unverified rates remain drafts for review. Saving another date range or site does not require refreshing the page.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto] lg:items-end">
          <div><Label>Billable Site</Label><Select value={selectedSite} onValueChange={name=>{setSelectedSite(name);const site=locations.find(row=>row.site_name===name);setBillingEmailInput(site?.billing_contact_email||'')}}><SelectTrigger className="w-full"><SelectValue placeholder="Choose site"/></SelectTrigger><SelectContent>{locations.filter(loc=>Number(loc.site_bill_rate)>0).map(site=><SelectItem key={site.id} value={site.site_name}>{site.site_name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Service Start</Label><Input type="date" value={invoiceStart} onChange={e=>setInvoiceStart(e.target.value)}/></div>
          <div><Label>Service End</Label><Input type="date" value={invoiceEnd} onChange={e=>setInvoiceEnd(e.target.value)}/></div>
          <Button type="button" disabled={generating||!selectedSite||!invoiceStart||!invoiceEnd} onClick={saveSelectedInvoice}>{generating?'Saving…':'Create & Send Invoice'}</Button>
        </div>
      </CardContent></Card>
      <Card className="mb-5 border-slate-200"><CardContent className="p-4"><Label>Client Invoice Delivery Address</Label><div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={selectedSite} onValueChange={name=>{setSelectedSite(name);const site=locations.find(row=>row.site_name===name);setBillingEmailInput(site?.billing_contact_email||'')}}><SelectTrigger className="w-[260px] max-w-full"><SelectValue placeholder="Select site to edit recipient"/></SelectTrigger><SelectContent>{locations.map(site=><SelectItem key={site.id} value={site.site_name}>{site.site_name}</SelectItem>)}</SelectContent></Select>
        <Input type="email" className="min-w-[220px] flex-1" placeholder="Blank uses management@blackpointkjc.com" value={billingEmailInput} onChange={event=>setBillingEmailInput(event.target.value)}/>
        <Button type="button" variant="outline" disabled={!selectedSite||savingBillingEmail} onClick={saveBillingContact}>{savingBillingEmail?'Saving…':'Save Address'}</Button>
      </div></CardContent></Card>
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
                const clientName = client ? (`${client.first_name || ''} ${client.last_name || ''}`.trim() || client.full_name || client.email) : (invoice.delivery_email || invoice.client_email || 'Client');
                
                return (
                  <div key={invoice.id} className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-5">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-bold text-blue-600">#{invoice.invoice_number}</p><p className="text-xs text-slate-600">Delivery: {invoice.delivery_status || 'not recorded'} · Recipient: {invoice.delivery_email || invoice.client_email || 'none'}</p>{invoice.billing_review_required && <p className="mt-1 text-xs font-semibold text-red-700">Billing review required: {invoice.billing_review_reason || 'Historical rate unavailable'}</p>}{invoice.billing_review_required && invoice.status==='draft' && <HistoricalRateEditor key={invoice.id} invoice={invoice} saving={generating} onApprove={(invoice,rate)=>askConfirmation('Verify Contract Rate',`Confirm $${Number(rate).toFixed(2)} per hour for ${invoice.site_name} (${invoice.period_start}–${invoice.period_end}).`,()=>approveHistoricalRate(invoice,rate))}/>}{invoice.status === 'draft' && !invoice.billing_review_required && <button type="button" disabled={generating} className="mt-1 block rounded-md border border-emerald-600 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50" onClick={()=>askConfirmation('Send Client Invoice',`Send invoice ${invoice.invoice_number} to the verified client billing email, or management@blackpointkjc.com if unavailable?`,()=>sendExistingInvoice(invoice))}>Send Reviewed Draft Invoice</button>}
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
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 lg:block lg:text-right">
                      <p className="text-2xl font-bold text-green-600">
                        ${invoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => {
                          let shifts=[];
                          try {const parsed=JSON.parse(invoice.shifts||'[]');shifts=Array.isArray(parsed)?parsed:[];}
                          catch {setBillingStatus(`Invoice ${invoice.invoice_number} has invalid line items. Reload the billing ledger before printing.`);return;}
                          const client = clients.find(c => c.email === invoice.client_email);
                          const clientName = client ? (`${client.first_name || ''} ${client.last_name || ''}`.trim() || client.full_name || client.email) : (invoice.delivery_email || invoice.client_email || 'Client');
                          
                          const invoiceWindow = window.open('', '_blank');
                          if(!invoiceWindow){setBillingStatus('Your browser blocked the invoice print tab. Allow pop-ups for Pathfinder and click View / Print again.');return;}
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
                                    <div class="total-value">$${Number(invoice.base_amount||Number(invoice.total_amount||0)-Number(invoice.late_fee_amount||0)).toFixed(2)}</div>
                                  </div>
                                  ${Number(invoice.late_fee_amount||0)>0?`<div class="total-row"><div class="total-label">One-time late fee (10%):</div><div class="total-value">$${Number(invoice.late_fee_amount).toFixed(2)}</div></div>`:''}
                                  <div class="total-row grand-total">
                                    <div class="total-label">Total Due:</div>
                                    <div class="total-value">$${Math.max(0,Number(invoice.total_amount||0)-Number(invoice.amount_paid||0)).toFixed(2)}</div>
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
                                  <p>Payment is due by the due date shown above. A one-time 10% overdue fee may apply under the client service agreement. Please remit payment to the address above.</p>
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
                    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 lg:col-span-2">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-700">Payment tracking</span>
                        <span className="text-sm font-bold text-slate-800">Received: ${Number(invoice.amount_paid|| (invoice.status==='paid'?invoice.total_amount:0)).toFixed(2)} · Balance: ${Math.max(0,Number(invoice.total_amount||0)-Number(invoice.amount_paid||(invoice.status==='paid'?invoice.total_amount:0))).toFixed(2)}</span>
                      </div>
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(125px,1fr)_minmax(120px,1fr)_minmax(130px,1fr)_minmax(140px,1fr)_auto_auto] xl:items-end">
                        <div><Label className="text-xs text-slate-600">Payment status</Label><Select value={paymentDrafts[invoice.id]?.status || (['paid','partial','pending','overdue'].includes(invoice.status)?invoice.status:'pending')} onValueChange={value=>setPaymentDrafts(current=>({...current,[invoice.id]:{...current[invoice.id],status:value}}))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{['pending','partial','paid','overdue'].map(status=><SelectItem key={status} value={status}>{status==='pending'?'Pending Payment':status.charAt(0).toUpperCase()+status.slice(1)}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label className="text-xs text-slate-600">Payment received ($)</Label><Input type="number" min="0" max={invoice.total_amount} step="0.01" value={paymentDrafts[invoice.id]?.amount_paid ?? (invoice.amount_paid||0)} onChange={event=>setPaymentDrafts(current=>({...current,[invoice.id]:{...current[invoice.id],amount_paid:event.target.value}}))} /></div>
                        <div><Label className="text-xs text-slate-600">Payment method</Label><Input placeholder="ACH, check, card..." value={paymentDrafts[invoice.id]?.payment_method ?? (invoice.payment_method||'')} onChange={event=>setPaymentDrafts(current=>({...current,[invoice.id]:{...current[invoice.id],payment_method:event.target.value}}))}/></div>
                        <div><Label className="text-xs text-slate-600">Reference / check #</Label><Input placeholder="Payment reference" value={paymentDrafts[invoice.id]?.payment_reference ?? (invoice.payment_reference||'')} onChange={event=>setPaymentDrafts(current=>({...current,[invoice.id]:{...current[invoice.id],payment_reference:event.target.value}}))}/></div>
                        <Button type="button" variant="outline" disabled={savingPaymentId===invoice.id || invoice.billing_review_required} onClick={()=>askConfirmation('Save Invoice Payment Status',`Save invoice ${invoice.invoice_number} with updated payment details and status?`,()=>updateInvoicePayment(invoice))} className="whitespace-nowrap">{savingPaymentId===invoice.id?'Saving…':'Save Status'}</Button>
                        <Button type="button" disabled={savingPaymentId===invoice.id || invoice.status==='paid' || invoice.billing_review_required} onClick={()=>askConfirmation('Mark Invoice Paid',`Confirm that the full $${Number(invoice.total_amount||0).toFixed(2)} was actually received for invoice ${invoice.invoice_number}. This does not initiate a transfer.`,()=>updateInvoicePayment(invoice,'paid'))} className="whitespace-nowrap bg-emerald-700 text-white hover:bg-emerald-600">Mark Paid</Button>
                      </div>
                      {Number(invoice.late_fee_amount||0)>0 && <p className="mt-2 text-sm font-bold text-red-700">One-time overdue fee (10%): ${Number(invoice.late_fee_amount||0).toFixed(2)} · Included in invoice total</p>}
                      {invoice.status==='draft' && <p className="mt-2 text-xs text-amber-700">This invoice is still a draft. Recording a payment does not mean the invoice was emailed to the client.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!confirmAction} onOpenChange={open=>{if(!open)setConfirmAction(null)}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{confirmAction?.title||'Confirm Accounting Action'}</DialogTitle></DialogHeader><p className="text-sm text-slate-700">{confirmAction?.message}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setConfirmAction(null)}>Cancel</Button><Button type="button" disabled={generating||!!savingPaymentId} onClick={()=>{const action=confirmAction?.execute;setConfirmAction(null);if(action)void action();}}>Confirm</Button></div></DialogContent></Dialog>
    </div>
  );
}