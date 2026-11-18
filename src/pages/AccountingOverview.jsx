import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { calculateLiveHours, normalizeSiteName, resolveBillingRate } from '@/lib/billingRates';
import { DollarSign, FileText, Receipt, TrendingUp, ArrowRight, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';

const actions = [
  { label: 'Payroll Center', detail: 'Generate and review payroll entries', icon: DollarSign, page: 'AccountingPayroll' },
  { label: 'Payroll Dates', detail: 'Review payroll periods and processing dates', icon: CalendarClock, page: 'PayrollDates' },
  { label: 'Client Invoices', detail: 'Billing, invoice status and client receivables', icon: FileText, page: 'AccountingInvoices' },
  { label: 'Expenses', detail: 'Bills, officer reimbursements and approvals', icon: Receipt, page: 'AccountingExpenses' },
  { label: 'Company Profit', detail: 'Revenue, labor, expenses and profitability', icon: TrendingUp, page: 'AccountingProfit' },
];

export default function AccountingOverview() {
  const [liveNow,setLiveNow] = useState(() => new Date());
  useEffect(() => { const timer=window.setInterval(()=>{if (document.visibilityState==='visible') setLiveNow(new Date());},15000); return ()=>window.clearInterval(timer); },[]);
  const { data: payload = {}, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['accountingFinance'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', { scope: 'finance' });
      const response = result?.data || result || {};
      if (response.error) throw new Error(response.error);
      return response;
    },
    staleTime: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 90000,
    refetchIntervalInBackground: false,
  });

  const periods = payload.payrollPeriods || payload.payroll_periods || payload.periods || [];
  const loadErrors = payload.load_errors || [];
  const todayKey=liveNow.toISOString().slice(0,10);
  const currentPeriod = periods.find(row=>row.start_date<=todayKey&&row.end_date>=todayKey) || [...periods].filter(row=>row.end_date<todayKey).sort((a,b)=>String(b.end_date).localeCompare(String(a.end_date)))[0];
  const timeEntries=payload.timeEntries||[];
  const locations=payload.locations||[];
  const schedules=payload.schedules||[];
  const startKey=currentPeriod?.start_date || liveNow.toISOString().slice(0,7)+'-01';
  const endKey=currentPeriod?.end_date || liveNow.toISOString().slice(0,10);
  const liveCompany = timeEntries.reduce((sum,entry)=>{
    const day=String(entry.clock_in||'').slice(0,10);
    if (!entry.clock_in || entry.archived===true || day<startKey || day>endKey) return sum;
    const site=locations.find(loc=>normalizeSiteName(loc.site_name)===normalizeSiteName(entry.location));
    const hours=calculateLiveHours(entry,liveNow);
    const rate=resolveBillingRate(entry,site,schedules).rate;
    sum.hours+=hours;
    sum.earned+=hours*rate;
    if (!entry.clock_out) sum.onDuty++;
    return sum;
  },{hours:0,earned:0,onDuty:0});
  const summary = payload.financialSummary || {};
  const moneySummary = key => summary[key] == null ? '—' : `$${Number(summary[key]).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#0f2b27] via-[#0b1724] to-[#070d17] p-6 shadow-2xl md:p-8"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl"/><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-emerald-300"><DollarSign className="h-4 w-4"/>Finance & Accounting</div><h2 className="mt-2 text-3xl font-black md:text-4xl">Financial Operations Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Clear separation of earned services, issued invoices, client receipts, payroll liability, and estimated operating margin.</p><p className="mt-1 text-xs text-slate-500">Last data sync: {payload.as_of ? new Date(payload.as_of).toLocaleTimeString() : 'Awaiting first load'} · {liveCompany.onDuty} on-duty shifts · {liveNow.toLocaleTimeString()}</p></div><div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING FINANCE DATA' : error ? 'FINANCE DATA ERROR' : loadErrors.length ? 'PARTIAL FINANCE DATA' : isFetching ? 'REFRESHING FINANCE DATA' : 'FINANCE ONLINE'}</div></div></section>

        {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"><span>Financial data could not be loaded: {error?.response?.data?.error || error.message}</span><button type="button" onClick={() => refetch()} className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-black hover:bg-red-500/20">RETRY</button></div>}

        {!!loadErrors.length && <div className="mb-3 rounded-lg border border-amber-500/40 p-3 text-sm">Ledger refresh interrupted: {loadErrors.join(', ')}. <button onClick={()=>refetch()} className="underline">Retry</button></div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[
          ['Earned Service Revenue',moneySummary('earned_service_revenue'),'Accrued from recorded work hours; not cash received or invoices issued'],
          ['Issued Client Invoices',moneySummary('billed_total'),'Sent, pending, partially paid or overdue invoices; drafts excluded'],
          ['Outstanding Receivables',moneySummary('outstanding_client_invoices'),'Issued invoice totals minus recorded client payments'],
          ['Overdue Fees (10%)',moneySummary('late_fees'),'One-time overdue charges included in issued invoices and receivables'],
          ['Accrued Payroll Wages',moneySummary('payroll_total'),'All saved payroll wages, including checks awaiting approval'],
          ['Estimated Operating Profit',moneySummary('estimated_profit'),'Earned revenue less accrued wages, reimbursements and operating costs'],
        ].map(([name,value,explanation])=><div key={name} className="flex min-w-0 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#0b1624] p-5 text-center"><div className="text-xs font-bold uppercase tracking-wide text-emerald-300">{name}</div><div className="mt-2 break-words text-[clamp(1.2rem,2vw,1.8rem)] font-black">{value}</div><p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">{explanation}</p></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0a1421] p-4"><p className="text-sm text-slate-300">Client payments received: <strong className="text-white">{moneySummary('client_payments')}</strong> · Awaiting payroll check approval: <strong className="text-white">{moneySummary('pending_payroll_approval')}</strong> · Unpaid vendor bills: <strong className="text-white">{moneySummary('unpaid_company_bills')}</strong></p><Link to={createPageUrl('AccountingProfit')} className="text-sm font-bold text-emerald-300 underline">See date-based financial breakdown</Link></div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{actions.map(({label,detail,icon:Icon,page}) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-[#10251f]"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-emerald-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300"/></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}