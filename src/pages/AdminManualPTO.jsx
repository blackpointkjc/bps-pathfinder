import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Gift, Plus, WalletCards } from "lucide-react";
import { invalidateAppDirectory, listOfficerDirectory } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { toast } from 'sonner';

export default function AdminManualPTO() {
  const [showDialog, setShowDialog] = useState(false);
  const [entryMode, setEntryMode] = useState('bonus');
  const [formData, setFormData] = useState({ officer_email: '', hours: '', reason: '', start_date: '', end_date: '', remove_shifts: false, call_out_date: '', use_pto: false });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasHRAccess = user?.role === 'admin' || user?.additional_roles?.includes('hr') || user?.additional_roles?.includes('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'manualPTO'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: hasHRAccess,
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const activeUsers = directoryUsers.filter(hasOfficerAdditionalRole);
  const officer = activeUsers.find(u => String(u.email || '').toLowerCase() === String(formData.officer_email || '').toLowerCase());

  const addPTOMutation = useMutation({
    mutationFn: async () => {
      const hours = Number(formData.hours || 0);
      if (!officer?.email) throw new Error('Select an officer');
      if (!Number.isFinite(hours) || hours <= 0) throw new Error('Enter positive PTO hours');
      const response = await base44.functions.invoke('getPTORequests', {
        action: entryMode === 'bonus' ? 'bonus' : entryMode === 'callout' ? 'record_callout' : 'manual',
        officer_email: officer.email,
        hours,
        reason: formData.reason.trim(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        remove_shifts: entryMode === 'manual' && formData.remove_shifts,
        call_out_date: formData.call_out_date,
        use_pto: entryMode === 'callout' && formData.use_pto,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: async (payload) => {
      invalidateAppDirectory();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['directoryUsers', 'manualPTO'] }),
        queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
        queryClient.invalidateQueries({ queryKey: ['ptoAdjustments'] }),
        queryClient.invalidateQueries({ queryKey: ['hrUsers'] }),
      ]);
      window.dispatchEvent(new CustomEvent('bps-directory-user-updated', { detail: { reason: 'pto-adjustment' } }));
      if (entryMode === 'callout') {
        toast.success(formData.use_pto ? `${Number(payload.pto_used || formData.hours).toFixed(1)} PTO hours applied to the call-out` : 'Call-out recorded as unpaid');
      } else {
        toast.success(`${Number(payload.hours_added || formData.hours).toFixed(1)} PTO hours added to ${officer?.rank || 'Officer'} ${officer?.last_name || ''}`.trim());
      }
      setShowDialog(false);
      setFormData({ officer_email: '', hours: '', reason: '', start_date: '', end_date: '', remove_shifts: false, call_out_date: '', use_pto: false });
    },
    onError: error => toast.error(error?.message || 'Unable to add PTO hours'),
  });

  if (!hasHRAccess) {
    return <div className="p-8 text-center"><AlertCircle className="mx-auto mb-4 h-14 w-14 text-slate-500"/><h2 className="text-2xl font-black">HR Access Required</h2></div>;
  }

  const openAdjustment = mode => {
    setEntryMode(mode);
    setFormData({ officer_email: '', hours: '', reason: '', start_date: '', end_date: '', remove_shifts: false, call_out_date: '', use_pto: false });
    setShowDialog(true);
  };

  return (
    <div className="min-h-screen bg-[#07101a] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0d1725] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10"><WalletCards className="h-5 w-5 text-blue-300"/></div>
            <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-blue-300">Human Resources</div><h1 className="text-2xl font-black text-white">PTO Adjustments</h1></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openAdjustment('bonus')} className="bg-violet-600 hover:bg-violet-500"><Gift className="mr-2 h-4 w-4"/>Add PTO Bonus</Button>
            <Button onClick={() => openAdjustment('manual')} className="bg-blue-600 hover:bg-blue-500"><Plus className="mr-2 h-4 w-4"/>Add PTO Hours</Button>
            <Button onClick={() => openAdjustment('callout')} className="bg-amber-600 hover:bg-amber-500">Record Call-Out</Button>
          </div>
        </div>

        <Card className="border-slate-800 bg-[#0d1725] text-slate-100">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-[#101b29] p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Officers</div><div className="mt-2 text-3xl font-black text-white">{activeUsers.length}</div></div>
            <div className="rounded-xl border border-slate-800 bg-[#101b29] p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Colonel / Lt Colonel</div><div className="mt-2 text-3xl font-black text-violet-300">180h</div><div className="text-xs text-slate-500">Annual earned PTO target</div></div>
            <div className="rounded-xl border border-slate-800 bg-[#101b29] p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Other Ranks</div><div className="mt-2 text-3xl font-black text-blue-300">40h</div><div className="text-xs text-slate-500">Annual earned PTO target</div></div>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-xl border-slate-700 bg-[#0d1725] text-slate-100">
            <DialogHeader><DialogTitle>{entryMode === 'bonus' ? 'Add PTO Bonus' : entryMode === 'callout' ? 'Record Officer Call-Out' : 'Add PTO Hours'}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); addPTOMutation.mutate(); }} className="space-y-5">
              <div className="space-y-2">
                <Label>Select Officer *</Label>
                <Select value={formData.officer_email} onValueChange={value => setFormData(current => ({ ...current, officer_email: value }))}>
                  <SelectTrigger className="border-slate-700 bg-[#08111d]"><SelectValue placeholder="Select an officer..."/></SelectTrigger>
                  <SelectContent>{activeUsers.map(u => <SelectItem key={u.email} value={u.email}>{u.rank || 'Officer'} {u.last_name || ''} · {u.first_name || ''} {u.last_name || ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {officer && <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-700 bg-[#101b29] p-3"><div className="text-[10px] font-black uppercase text-slate-500">Available PTO</div><div className="mt-1 text-2xl font-black text-emerald-300">{Number(officer.pto_balance_hours || 0).toFixed(1)}h</div></div>
                <div className="rounded-xl border border-slate-700 bg-[#101b29] p-3"><div className="text-[10px] font-black uppercase text-slate-500">Earned YTD</div><div className="mt-1 text-2xl font-black text-blue-300">{Number(officer.pto_year_to_date_accrued || 0).toFixed(1)}h</div></div>
                <div className="rounded-xl border border-slate-700 bg-[#101b29] p-3"><div className="text-[10px] font-black uppercase text-slate-500">Used YTD</div><div className="mt-1 text-2xl font-black text-amber-300">{Number(officer.pto_year_to_date_used || 0).toFixed(1)}h</div></div>
              </div>}

              <div className="space-y-2"><Label>{entryMode === 'bonus' ? 'Bonus Hours' : entryMode === 'callout' ? 'Call-Out Hours' : 'PTO Hours'} *</Label><Input type="number" min="0.5" step="0.5" value={formData.hours} onChange={e => setFormData(current => ({ ...current, hours: e.target.value }))} className="border-slate-700 bg-[#08111d]" placeholder="8" required/></div>
              {entryMode === 'callout' && (
                <div className="space-y-3 rounded-xl border border-slate-700 bg-[#101b29] p-4">
                  <div className="space-y-2"><Label>Call-Out Date *</Label><Input type="date" value={formData.call_out_date} onChange={e => setFormData(current => ({ ...current, call_out_date: e.target.value }))} className="border-slate-700 bg-[#08111d]" required/></div>
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-200"><input type="checkbox" checked={formData.use_pto} onChange={e => setFormData(current => ({ ...current, use_pto: e.target.checked }))} className="h-4 w-4"/>Use PTO for this call-out</label>
                  <div className="text-xs text-slate-400">If unchecked, the call-out is recorded as unpaid and no PTO is deducted. If checked, these hours are deducted from Available PTO and appear in payroll as straight-time PTO.</div>
                </div>
              )}
              {entryMode === 'manual' && <div className="space-y-3 rounded-xl border border-slate-700 bg-[#101b29] p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-200"><input type="checkbox" checked={formData.remove_shifts} onChange={e => setFormData(current => ({ ...current, remove_shifts: e.target.checked }))} className="h-4 w-4"/>Remove scheduled shifts and place them in Open Shifts</label>
                {formData.remove_shifts && <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Start Date *</Label><Input type="date" value={formData.start_date} onChange={e => setFormData(current => ({ ...current, start_date: e.target.value }))} className="border-slate-700 bg-[#08111d]" required/></div>
                  <div className="space-y-2"><Label>End Date *</Label><Input type="date" value={formData.end_date} onChange={e => setFormData(current => ({ ...current, end_date: e.target.value }))} className="border-slate-700 bg-[#08111d]" required/></div>
                </div>}
              </div>}
              <div className="space-y-2"><Label>Reason</Label><Input value={formData.reason} onChange={e => setFormData(current => ({ ...current, reason: e.target.value }))} className="border-slate-700 bg-[#08111d]" placeholder={entryMode === 'bonus' ? 'Officer of the Day, recognition, etc.' : entryMode === 'callout' ? 'Call-out reason or HR note' : 'Balance correction or approved adjustment'}/></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button><Button type="submit" disabled={addPTOMutation.isPending} className="bg-blue-600 hover:bg-blue-500">{addPTOMutation.isPending ? 'Saving…' : entryMode === 'bonus' ? 'Add Bonus PTO' : entryMode === 'callout' ? 'Record Call-Out' : 'Add PTO Hours'}</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
