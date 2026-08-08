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
import { Receipt, Plus, Trash2 } from 'lucide-react';

const categories = [
  ['rent','Rent'], ['utilities','Utilities'], ['insurance','Insurance'],
  ['software','Software'], ['equipment','Equipment'], ['supplies','Supplies'],
  ['fuel','Fuel'], ['maintenance','Maintenance'], ['professional_services','Professional services'],
  ['taxes_fees','Taxes & fees'], ['marketing','Marketing'], ['other','Other']
];

const emptyForm = {
  expense_date: format(new Date(), 'yyyy-MM-dd'), vendor: '', category: 'other',
  description: '', amount: '', site_name: '', reference_number: '', status: 'paid',
  due_date: '', paid_date: format(new Date(), 'yyyy-MM-dd'), notes: ''
};

export default function AccountingExpenses() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const allowed = user?.role === 'admin' || user?.additional_roles?.includes('accounting');
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['companyExpenses'],
    queryFn: () => base44.entities.CompanyExpense.list('-expense_date', 500),
    enabled: allowed,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const saveExpense = useMutation({
    mutationFn: data => base44.entities.CompanyExpense.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyExpenses'] });
      setForm(emptyForm);
    },
  });
  const removeExpense = useMutation({
    mutationFn: id => base44.entities.CompanyExpense.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companyExpenses'] }),
  });

  if (!allowed) return <div className="p-8 text-center">Accounting access required.</div>;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = e => {
    e.preventDefault();
    if (!form.vendor || !form.description || !(Number(form.amount) > 0)) return;
    saveExpense.mutate({
      ...form,
      amount: Number(form.amount),
      paid_date: form.status === 'paid' ? (form.paid_date || form.expense_date) : '',
    });
  };

  return <div className="container mx-auto max-w-7xl p-4 md:p-6">
    <header className="mb-8 rounded-3xl bg-slate-950 p-6 md:p-8 text-white shadow-xl">
      <div className="mb-3 inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">Accounts payable</div>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Company Bills & Expenses</h1>
      <p className="mt-2 text-slate-300">Record real operating costs used by the Company Profit report.</p>
    </header>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="h-fit rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold"><Plus className="h-5 w-5"/>Add bill or expense</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label>Expense date</Label><Input type="date" value={form.expense_date} onChange={e=>set('expense_date',e.target.value)} required/></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={v=>set('status',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Vendor / payee</Label><Input value={form.vendor} onChange={e=>set('vendor',e.target.value)} placeholder="Vendor name" required/></div>
            <div><Label>Category</Label><Select value={form.category} onValueChange={v=>set('category',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e=>set('description',e.target.value)} placeholder="What was purchased or billed" required/></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0.00" required/></div>
              <div><Label>Site / cost center</Label><Input value={form.site_name} onChange={e=>set('site_name',e.target.value)} placeholder="Optional"/></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label>Reference #</Label><Input value={form.reference_number} onChange={e=>set('reference_number',e.target.value)} placeholder="Optional"/></div>
              <div><Label>{form.status === 'paid' ? 'Paid date' : 'Due date'}</Label><Input type="date" value={form.status === 'paid' ? form.paid_date : form.due_date} onChange={e=>set(form.status === 'paid' ? 'paid_date' : 'due_date',e.target.value)}/></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Optional notes"/></div>
            <Button type="submit" disabled={saveExpense.isPending} className="w-full bg-slate-950 hover:bg-slate-800">{saveExpense.isPending ? 'Saving…' : 'Save expense'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><Receipt className="h-5 w-5"/>Expense ledger</h2><span className="text-sm text-slate-500">{expenses.length} records</span></div>
          {isLoading ? <p className="py-10 text-center text-slate-500">Loading expenses…</p> : expenses.length === 0 ? <p className="rounded-xl bg-slate-50 py-12 text-center text-slate-500">No company bills or expenses entered yet.</p> :
          <div className="space-y-3">{expenses.map(expense => <div key={expense.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{expense.vendor}</p><Badge className={expense.status==='paid'?'bg-emerald-600':'bg-amber-500'}>{expense.status}</Badge></div><p className="text-sm text-slate-600">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{format(new Date(expense.expense_date+'T00:00:00'),'MMM d, yyyy')} • {expense.category.replaceAll('_',' ')}{expense.site_name ? ' • '+expense.site_name : ''}</p></div>
            <div className="flex items-center justify-between gap-4 sm:justify-end"><p className="text-xl font-bold text-slate-900">{Number(expense.amount||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</p><Button type="button" size="icon" variant="ghost" onClick={()=>{if(window.confirm('Remove this expense?')) removeExpense.mutate(expense.id)}} aria-label="Delete expense"><Trash2 className="h-4 w-4 text-red-600"/></Button></div>
          </div>)}</div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
