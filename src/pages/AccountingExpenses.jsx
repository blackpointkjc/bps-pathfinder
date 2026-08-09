import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, Plus, Trash2, Check, X, Eye } from 'lucide-react';
import { toast } from 'sonner';

const categories = [
  ['rent','Rent'], ['utilities','Utilities'], ['insurance','Insurance'], ['software','Software'],
  ['equipment','Equipment'], ['supplies','Supplies'], ['fuel','Fuel'], ['maintenance','Maintenance'],
  ['professional_services','Professional services'], ['taxes_fees','Taxes & fees'], ['marketing','Marketing'], ['other','Other']
];
const emptyForm = { expense_date: format(new Date(), 'yyyy-MM-dd'), vendor: '', category: 'other', description: '', amount: '', site_name: '', reference_number: '', status: 'paid', due_date: '', paid_date: format(new Date(), 'yyyy-MM-dd'), notes: '' };

export default function AccountingExpenses() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [reviewNotes, setReviewNotes] = useState({});
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const allowed = user?.role === 'admin' || user?.additional_roles?.includes('accounting') || user?.additional_roles?.includes('full_access');

  const { data: accountingData = {}, isLoading, error } = useQuery({
    queryKey: ['accountingData', 'expenses'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAccountingData', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: allowed,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const expenses = accountingData.companyExpenses || [];
  const officerExpenses = accountingData.expenseReports || [];
  const pending = officerExpenses.filter(item => item.status === 'pending');
  const approved = officerExpenses.filter(item => item.status === 'approved' || item.status === 'reimbursed');

  const invokeExpense = async payload => {
    const result = await base44.functions.invoke('manageAccountingExpenses', payload);
    const data = result?.data || result || {};
    if (data.error) throw new Error(data.error);
    return data;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accountingData'] });

  const saveExpense = useMutation({
    mutationFn: data => invokeExpense({ action: 'create_company', data }),
    onSuccess: () => { refresh(); setForm(emptyForm); toast.success('Expense added to ledger'); },
    onError: e => toast.error(e.message || 'Unable to save expense'),
  });
  const removeExpense = useMutation({
    mutationFn: id => invokeExpense({ action: 'delete_company', id }),
    onSuccess: () => { refresh(); toast.success('Expense removed'); },
    onError: e => toast.error(e.message || 'Unable to remove expense'),
  });
  const reviewExpense = useMutation({
    mutationFn: ({ id, approved: approve }) => invokeExpense({ action: approve ? 'approve_report' : 'reject_report', id, notes: reviewNotes[id] || '' }),
    onSuccess: (_, variables) => {
      refresh();
      toast.success(variables.approved ? 'Expense approved and added to ledger' : 'Expense rejected');
      setReviewNotes(current => { const next = { ...current }; delete next[variables.id]; return next; });
    },
    onError: e => toast.error(e.message || 'Unable to review expense'),
  });

  if (!allowed) return <div className="p-8 text-center">Accounting access required.</div>;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = e => {
    e.preventDefault();
    if (!form.vendor || !form.description || !(Number(form.amount) > 0)) return;
    saveExpense.mutate({ ...form, amount: Number(form.amount), paid_date: form.status === 'paid' ? (form.paid_date || form.expense_date) : '' });
  };

  return <div className="container mx-auto max-w-7xl p-4 md:p-6">
    <header className="mb-6 rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8">
      <div className="mb-3 inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">Accounting Center</div>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Bills, Expenses & Approvals</h1>
      <p className="mt-2 text-slate-300">One workflow for company bills and officer expense approvals. Approved officer expenses are automatically posted to the company ledger.</p>
    </header>

    {error && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">Accounting data could not load: {error.message}</div>}

    <Tabs defaultValue="ledger" className="space-y-5">
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-slate-100 p-1">
        <TabsTrigger value="ledger">Ledger ({expenses.length})</TabsTrigger>
        <TabsTrigger value="pending">Pending approvals ({pending.length})</TabsTrigger>
        <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="ledger">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <Card className="h-fit rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-5 md:p-6">
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold"><Plus className="h-5 w-5"/>Add bill or expense</h2>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2"><div><Label>Expense date</Label><Input type="date" value={form.expense_date} onChange={e=>set('expense_date',e.target.value)} required/></div><div><Label>Status</Label><Select value={form.status} onValueChange={v=>set('status',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem></SelectContent></Select></div></div>
              <div><Label>Vendor / payee</Label><Input value={form.vendor} onChange={e=>set('vendor',e.target.value)} required/></div>
              <div><Label>Category</Label><Select value={form.category} onValueChange={v=>set('category',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Description</Label><Input value={form.description} onChange={e=>set('description',e.target.value)} required/></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>set('amount',e.target.value)} required/></div><div><Label>Site / cost center</Label><Input value={form.site_name} onChange={e=>set('site_name',e.target.value)}/></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><Label>Reference #</Label><Input value={form.reference_number} onChange={e=>set('reference_number',e.target.value)}/></div><div><Label>{form.status === 'paid' ? 'Paid date' : 'Due date'}</Label><Input type="date" value={form.status === 'paid' ? form.paid_date : form.due_date} onChange={e=>set(form.status === 'paid' ? 'paid_date' : 'due_date',e.target.value)}/></div></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
              <Button type="submit" disabled={saveExpense.isPending} className="w-full bg-slate-950 hover:bg-slate-800">{saveExpense.isPending ? 'Saving…' : 'Save to ledger'}</Button>
            </form>
          </CardContent></Card>
          <Card className="rounded-2xl border-slate-200 shadow-sm"><CardContent className="p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><Receipt className="h-5 w-5"/>Expense ledger</h2><span className="text-sm text-slate-500">{expenses.length} records</span></div>
            {isLoading ? <p className="py-10 text-center text-slate-500">Loading ledger…</p> : expenses.length === 0 ? <p className="rounded-xl bg-slate-50 py-12 text-center text-slate-500">No ledger expenses yet.</p> : <div className="space-y-3">{expenses.map(expense => <div key={expense.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{expense.vendor}</p><Badge className={expense.status==='paid'?'bg-emerald-600':'bg-amber-500'}>{expense.status}</Badge></div><p className="text-sm text-slate-600">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{expense.expense_date ? format(new Date(expense.expense_date+'T00:00:00'),'MMM d, yyyy') : 'No date'} • {String(expense.category || 'other').replaceAll('_',' ')}{expense.site_name ? ' • '+expense.site_name : ''}</p></div><div className="flex items-center justify-between gap-4 sm:justify-end"><p className="text-xl font-bold text-slate-900">{Number(expense.amount||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</p><Button type="button" size="icon" variant="ghost" onClick={()=>removeExpense.mutate(expense.id)} aria-label="Delete expense"><Trash2 className="h-4 w-4 text-red-600"/></Button></div></div>)}</div>}
          </CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="pending" className="space-y-3">
        {pending.length === 0 ? <Card><CardContent className="p-10 text-center text-slate-500">No pending officer expenses.</CardContent></Card> : pending.map(expense => <Card key={expense.id}><CardContent className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{expense.officer_name || expense.officer_email}</h3><Badge className="bg-amber-500">Pending</Badge></div><p className="mt-1 text-sm text-slate-600">{expense.description}</p><p className="mt-2 text-2xl font-black text-emerald-700">${Number(expense.amount || 0).toFixed(2)}</p><p className="text-xs text-slate-500">{expense.expense_date} • {String(expense.category || '').replaceAll('_',' ')}</p>{expense.receipt_url && <Button variant="outline" size="sm" className="mt-3" onClick={()=>window.open(expense.receipt_url,'_blank')}><Eye className="mr-2 h-4 w-4"/>Receipt</Button>}</div><div className="w-full space-y-2 lg:w-80"><Label>Reviewer notes</Label><Textarea value={reviewNotes[expense.id] || ''} onChange={e=>setReviewNotes(current=>({...current,[expense.id]:e.target.value}))} placeholder="Optional approval notes or rejection reason"/><div className="grid grid-cols-2 gap-2"><Button onClick={()=>reviewExpense.mutate({id:expense.id,approved:true})} className="bg-emerald-600 hover:bg-emerald-700"><Check className="mr-2 h-4 w-4"/>Approve</Button><Button variant="destructive" onClick={()=>reviewExpense.mutate({id:expense.id,approved:false})}><X className="mr-2 h-4 w-4"/>Reject</Button></div></div></div></CardContent></Card>)}
      </TabsContent>

      <TabsContent value="approved" className="space-y-3">
        {approved.length === 0 ? <Card><CardContent className="p-10 text-center text-slate-500">No approved officer expenses.</CardContent></Card> : approved.map(expense => <Card key={expense.id}><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="font-bold">{expense.officer_name || expense.officer_email}</div><div className="text-sm text-slate-600">{expense.description}</div><div className="text-xs text-slate-500">{expense.expense_date}</div></div><div className="text-right"><Badge className="bg-emerald-600">{expense.status}</Badge><div className="mt-1 text-xl font-black">${Number(expense.amount || 0).toFixed(2)}</div></div></CardContent></Card>)}
      </TabsContent>
    </Tabs>
  </div>;
}
