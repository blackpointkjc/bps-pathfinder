import { confirmInApp } from '@/lib/inAppDialog';
import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, DollarSign, Pencil, Plus, Trash2, Repeat2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const emptyForm = { period_name: "", start_date: "", end_date: "", deposit_date: "", period_number: "", status: "upcoming" };

export default function PayrollDates({ readOnly = false }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const canManage = !readOnly && (user?.role === 'admin' || roles.has('accounting'));
  const { data: periods = [], isLoading } = useQuery({ queryKey: ['payrollPeriods'], queryFn: () => base44.entities.PayrollPeriod.list('-start_date') });

  const sorted = useMemo(() => [...periods].sort((a,b) => a.start_date.localeCompare(b.start_date)), [periods]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const current = sorted.find(p => p.start_date <= today && p.end_date >= today);
  const allPeriods = sorted;

  const rollingMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('maintainRollingPayrollPeriods', {});
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] });
      toast.success(data.created ? `${data.created} payroll periods generated through ${data.through}` : `Rolling schedule is current through ${data.through}`);
      localStorage.setItem('bps-payroll-roll-last-run', today);
    },
    onError: error => toast.error(error?.message || 'Unable to generate rolling payroll schedule'),
  });

  useEffect(() => {
    if (!canManage || sorted.length < 3) return;
    if (localStorage.getItem('bps-payroll-roll-last-run') === today) return;
    rollingMutation.mutate();
  }, [canManage, sorted.length, today]);

  const saveMutation = useMutation({
    mutationFn: async data => {
      if (!canManage) throw new Error('Accounting access required');
      const response = await base44.functions.invoke('maintainRollingPayrollPeriods', { action: 'save', period: editing ? { ...data, id: editing.id } : data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] });
      setDialogOpen(false); setEditing(null); setForm(emptyForm); toast.success('Payroll dates saved');
    },
    onError: e => toast.error(e.message || 'Unable to save payroll dates'),
  });

  const deleteMutation = useMutation({ mutationFn: async id => { const response = await base44.functions.invoke('maintainRollingPayrollPeriods', { action: 'delete', id }); const payload = response?.data || response || {}; if (payload.error) throw new Error(payload.error); return payload; }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] }) });

  const openForm = period => { setEditing(period || null); setForm(period ? { ...period, period_number: String(period.period_number || '') } : emptyForm); setDialogOpen(true); };
  const submit = e => {
    e.preventDefault();
    const data = { ...form, year: Number(form.start_date?.slice(0,4) || new Date().getFullYear()), period_number: Number(form.period_number) };
    saveMutation.mutate(data);
  };

  return <div className="min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="rounded-lg border border-blue-500/40 bg-blue-950/30 p-3"><CalendarClock className="h-7 w-7 text-blue-400" /></div><div><h1 className="text-3xl font-bold">Payroll Dates</h1><p className="text-slate-400">Enter the first three periods once, then repeat the pattern on a rolling two-year schedule.</p></div></div>
        {canManage && <div className="flex gap-2"><Button variant="outline" onClick={() => rollingMutation.mutate()} disabled={rollingMutation.isPending || sorted.length < 3}>{rollingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat2 className="mr-2 h-4 w-4" />}Generate Rolling 2 Years</Button><Button onClick={() => openForm(null)}><Plus className="mr-2 h-4 w-4" />Add Payroll Period</Button></div>}
      </div>

      {canManage && sorted.length < 3 && <Card className="border-amber-600/50 bg-amber-950/20"><CardContent className="p-4 text-sm text-amber-200"><strong>Setup required:</strong> Enter the first three consecutive payroll periods. Pathfinder will review their spacing, pay-period length, and deposit-date offset, then generate the remaining periods for the next two years.</CardContent></Card>}

      {current && <Card className="border-emerald-700/60 bg-emerald-950/20"><CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400" />Current Payroll Period</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div><p className="text-xs uppercase text-slate-400">Period</p><p className="text-lg font-bold">{current.period_name}</p></div><div><p className="text-xs uppercase text-slate-400">Dates</p><p className="font-semibold">{format(parseISO(current.start_date),'MMM d')} – {format(parseISO(current.end_date),'MMM d, yyyy')}</p></div><div><p className="text-xs uppercase text-slate-400">Deposit</p><p className="font-semibold text-emerald-400">{format(parseISO(current.deposit_date),'EEEE, MMM d, yyyy')}</p></div></CardContent></Card>}

      <Card><CardHeader><CardTitle>All Payroll Dates</CardTitle></CardHeader><CardContent className="space-y-3">{isLoading ? <p className="text-slate-400">Loading payroll dates…</p> : allPeriods.length === 0 ? <p className="text-slate-400">No payroll periods have been published.</p> : allPeriods.map(period => <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/30 p-4"><div><div className="flex items-center gap-2"><p className="font-bold">{period.period_name}</p><Badge variant="outline">{period.status || (period.end_date < today ? 'closed' : 'upcoming')}</Badge></div><p className="mt-1 text-sm text-slate-400">{format(parseISO(period.start_date),'MMM d')} – {format(parseISO(period.end_date),'MMM d, yyyy')}</p><p className="text-sm font-semibold text-emerald-400">Deposit: {format(parseISO(period.deposit_date),'EEEE, MMM d, yyyy')}</p></div>{canManage && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openForm(period)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" className="text-red-400" onClick={async () => await confirmInApp('Delete this payroll period?') && deleteMutation.mutate(period.id)}><Trash2 className="h-4 w-4" /></Button></div>}</div>)}</CardContent></Card>
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Edit Payroll Period' : `Add Payroll Period ${sorted.length < 3 ? `(${sorted.length + 1} of 3 setup periods)` : ''}`}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><div><Label>Period Name</Label><Input required value={form.period_name} onChange={e => setForm({...form, period_name:e.target.value})} placeholder="PP 01-2026" /></div><div className="grid grid-cols-2 gap-3"><div><Label>Start Date</Label><Input required type="date" value={form.start_date} onChange={e => setForm({...form,start_date:e.target.value})} /></div><div><Label>End Date</Label><Input required type="date" value={form.end_date} onChange={e => setForm({...form,end_date:e.target.value})} /></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Deposit Date</Label><Input required type="date" value={form.deposit_date} onChange={e => setForm({...form,deposit_date:e.target.value})} /></div><div><Label>Period Number</Label><Input required type="number" min="1" value={form.period_number} onChange={e => setForm({...form,period_number:e.target.value})} /></div></div><div><Label>Status</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="upcoming">Upcoming</option><option value="current">Current</option><option value="closed">Closed</option></select></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>Save</Button></div></form></DialogContent></Dialog>
  </div>;
}