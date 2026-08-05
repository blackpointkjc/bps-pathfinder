import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, DollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const emptyForm = { period_name: "", start_date: "", end_date: "", deposit_date: "", period_number: "", status: "upcoming" };

export default function PayrollDates() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const canManage = user?.role === 'admin';
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: () => base44.entities.PayrollPeriod.list('-start_date'),
  });

  const sorted = useMemo(() => [...periods].sort((a,b) => a.start_date.localeCompare(b.start_date)), [periods]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const current = sorted.find(p => p.start_date <= today && p.end_date >= today);
  const upcoming = sorted.filter(p => p.end_date >= today);

  const saveMutation = useMutation({
    mutationFn: data => editing ? base44.entities.PayrollPeriod.update(editing.id, data) : base44.entities.PayrollPeriod.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] });
      setDialogOpen(false); setEditing(null); setForm(emptyForm); toast.success('Payroll dates saved');
    },
    onError: e => toast.error(e.message || 'Unable to save payroll dates'),
  });
  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.PayrollPeriod.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payrollPeriods'] }),
  });

  const openForm = period => {
    setEditing(period || null);
    setForm(period ? { ...period, period_number: String(period.period_number || '') } : emptyForm);
    setDialogOpen(true);
  };
  const submit = e => {
    e.preventDefault();
    saveMutation.mutate({
      ...form,
      year: Number(form.start_date?.slice(0,4) || new Date().getFullYear()),
      period_number: Number(form.period_number),
    });
  };

  return <div className="min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-blue-500/40 bg-blue-950/30 p-3"><CalendarClock className="h-7 w-7 text-blue-400" /></div>
          <div><h1 className="text-3xl font-bold">Payroll Dates</h1><p className="text-slate-400">Pay periods and direct-deposit dates</p></div>
        </div>
        {canManage && <Button onClick={() => openForm(null)}><Plus className="mr-2 h-4 w-4" />Add Payroll Period</Button>}
      </div>

      {current && <Card className="border-emerald-700/60 bg-emerald-950/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400" />Current Payroll Period</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div><p className="text-xs uppercase text-slate-400">Period</p><p className="text-lg font-bold">{current.period_name}</p></div>
          <div><p className="text-xs uppercase text-slate-400">Dates</p><p className="font-semibold">{format(parseISO(current.start_date),'MMM d')} – {format(parseISO(current.end_date),'MMM d, yyyy')}</p></div>
          <div><p className="text-xs uppercase text-slate-400">Deposit</p><p className="font-semibold text-emerald-400">{format(parseISO(current.deposit_date),'EEEE, MMM d, yyyy')}</p></div>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle>Published Payroll Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-slate-400">Loading payroll dates…</p> : upcoming.length === 0 ? <p className="text-slate-400">No payroll periods have been published.</p> : upcoming.map(period =>
            <div key={period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/30 p-4">
              <div>
                <div className="flex items-center gap-2"><p className="font-bold">{period.period_name}</p><Badge variant="outline">{period.status || 'upcoming'}</Badge></div>
                <p className="mt-1 text-sm text-slate-400">{format(parseISO(period.start_date),'MMM d')} – {format(parseISO(period.end_date),'MMM d, yyyy')}</p>
                <p className="text-sm font-semibold text-emerald-400">Deposit: {format(parseISO(period.deposit_date),'EEEE, MMM d, yyyy')}</p>
              </div>
              {canManage && <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openForm(period)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" className="text-red-400" onClick={() => window.confirm('Delete this payroll period?') && deleteMutation.mutate(period.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>}
            </div>)}
        </CardContent>
      </Card>
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit Payroll Period' : 'Add Payroll Period'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Period Name</Label><Input required value={form.period_name} onChange={e => setForm({...form, period_name:e.target.value})} placeholder="PP 01-2026" /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Start Date</Label><Input required type="date" value={form.start_date} onChange={e => setForm({...form,start_date:e.target.value})} /></div><div><Label>End Date</Label><Input required type="date" value={form.end_date} onChange={e => setForm({...form,end_date:e.target.value})} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Deposit Date</Label><Input required type="date" value={form.deposit_date} onChange={e => setForm({...form,deposit_date:e.target.value})} /></div><div><Label>Period Number</Label><Input required type="number" min="1" value={form.period_number} onChange={e => setForm({...form,period_number:e.target.value})} /></div></div>
          <div><Label>Status</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="upcoming">Upcoming</option><option value="current">Current</option><option value="closed">Closed</option></select></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}