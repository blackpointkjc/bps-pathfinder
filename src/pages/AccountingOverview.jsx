import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, Receipt, TrendingUp, ArrowRight, CalendarClock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { buildDirectoryIndex, operationalName } from '@/lib/operationalDisplay';

const actions = [
  { label: 'Payroll Center', detail: 'Generate and review payroll entries', icon: DollarSign, page: 'AccountingPayroll' },
  { label: 'Payroll Dates', detail: 'Review payroll periods and processing dates', icon: CalendarClock, page: 'PayrollDates' },
  { label: 'Client Invoices', detail: 'Billing, invoice status and client receivables', icon: FileText, page: 'AccountingInvoices' },
  { label: 'Expenses', detail: 'Bills, officer reimbursements and approvals', icon: Receipt, page: 'AccountingExpenses' },
  { label: 'Company Profit', detail: 'Revenue, labor, expenses and profitability', icon: TrendingUp, page: 'AccountingProfit' },
];

export default function AccountingOverview() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ['accountingOverviewSnapshot'],
    queryFn: async () => {
      const users = await listDirectoryUsers('-last_updated', 500).catch(() => []);
      const result = await base44.functions.invoke('getAccountingData', { scope: 'payroll' }).catch(() => ({}));
      const payload = result?.data || result || {};
      const expenses = await base44.entities.ExpenseReport.list('-expense_date', 120).catch(() => []);
      return { users, payload, expenses };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const directory = buildDirectoryIndex(data.users || []);
  const payload = data.payload || {};
  const payrollEntries = payload.payroll_entries || payload.payrollEntries || [];
  const periods = payload.periods || payload.payroll_periods || [];
  const expenses = data.expenses || [];
  const pendingExpenses = expenses.filter(row => String(row.status || '').toLowerCase() === 'pending');
  const currentPeriod = periods.find(row => ['open','current','active'].includes(String(row.status || '').toLowerCase())) || periods[0];
  const totalPaymentDue = payrollEntries.reduce((sum,row) => sum + Number(row.total_payment_due || row.net_pay || 0), 0);
  const recentPayroll = payrollEntries.slice(0,5);

  return (
    <div className="min-h-[calc(100vh-190px)] bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#0f2b27] via-[#0b1724] to-[#070d17] p-6 shadow-2xl md:p-8"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl"/><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-emerald-300"><DollarSign className="h-4 w-4"/>Finance & Accounting</div><h2 className="mt-2 text-3xl font-black md:text-4xl">Financial Operations Dashboard</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Payroll workload, current period, reimbursements and finance actions visible immediately.</p></div><div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-200">{isLoading ? 'LOADING FINANCE DATA' : 'FINANCE ONLINE'}</div></div></section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Payroll Entries',payrollEntries.length,DollarSign,'Entries loaded for payroll review'],['Current Period',currentPeriod?.period_name || currentPeriod?.name || currentPeriod?.start_date || '—',CalendarClock,'Active/latest payroll period'],['Pending Expenses',pendingExpenses.length,AlertTriangle,'Reimbursements awaiting action'],['Payment Due',`$${totalPaymentDue.toLocaleString(undefined,{maximumFractionDigits:2})}`,Receipt,'Total due across loaded payroll entries']].map(([label,value,Icon,detail]) => <div key={label} className="rounded-2xl border border-slate-800 bg-[#0b1624] p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Icon className="h-5 w-5"/></div><span className="max-w-[70%] text-right text-2xl font-black">{value}</span></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>)}</div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="text-xs font-black uppercase tracking-[.16em] text-emerald-300">Payroll Activity</div><h3 className="mt-1 text-xl font-black">Recent payroll entries</h3><div className="mt-4 space-y-2">{recentPayroll.length ? recentPayroll.map((row,index) => <div key={row.id || index} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div><div className="text-sm font-bold">{operationalName(row, directory, { fallback: 'Employee' })}</div><div className="text-xs text-slate-500">{row.period_name || currentPeriod?.period_name || 'Payroll entry'}</div></div><div className="text-sm font-black text-emerald-200">${Number(row.total_payment_due || row.net_pay || 0).toLocaleString(undefined,{maximumFractionDigits:2})}</div></div>) : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No payroll entries loaded.</div>}</div></section><section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5"><div className="text-xs font-black uppercase tracking-[.16em] text-emerald-300">Expense Queue</div><h3 className="mt-1 text-xl font-black">Awaiting review</h3><div className="mt-4 space-y-2">{pendingExpenses.slice(0,6).map((row,index) => <div key={row.id || index} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold">{operationalName(row, directory, { fallback: 'Employee' })}</div><div className="text-sm font-black text-amber-200">${Number(row.amount || 0).toLocaleString(undefined,{maximumFractionDigits:2})}</div></div><div className="text-xs text-slate-500">{row.expense_type || row.category || 'Reimbursement'}</div><Link to={createPageUrl('AccountingExpenses')} className="self-end rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-500/20">OPEN TASK</Link></div>)}{!pendingExpenses.length && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No pending expenses.</div>}</div></section></div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{actions.map(({label,detail,icon:Icon,page}) => <Link key={label} to={createPageUrl(page)} className="group rounded-2xl border border-slate-800 bg-[#0b1624] p-4 transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-[#10251f]"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-emerald-300"><Icon className="h-5 w-5"/></div><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300"/></div><div className="mt-4 text-sm font-black">{label}</div><div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div></Link>)}</div>
      </div>
    </div>
  );
}