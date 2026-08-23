import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, AlertCircle, Plus, Gift } from "lucide-react";
import { format } from "date-fns";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';
import { toast } from 'sonner';

export default function AdminManualPTO() {
  const [showDialog, setShowDialog] = useState(false);
  const [entryMode, setEntryMode] = useState('leave');
  const [formData, setFormData] = useState({
    officer_email: "",
    start_date: "",
    end_date: "",
    pto_type: "pto", // pto or sick
    hours: "",
    reason: "",
    remove_shifts: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'manualPTO'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: user?.role === 'admin' || user?.additional_roles?.includes('hr') || user?.additional_roles?.includes('full_access') || String(user?.rank || '').toLowerCase() === 'human resources',
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const activeUsers = directoryUsers.filter(hasOfficerAdditionalRole);

  const addPTOMutation = useMutation({
    mutationFn: async (data) => {
      const officer = activeUsers.find(u => u.email === data.officer_email);
      if (!officer) throw new Error('Officer not found');
      const response = await base44.functions.invoke('getPTORequests', { action: data.entry_mode === 'bonus' ? 'bonus' : 'manual', ...data });
    queryKey: ['schedules'],
    queryFn: () => base44.entities.Schedule.list(),
    initialData: [],
  });

  const addPTOMutation = useMutation({
    mutationFn: async (data) => {
      const officer = activeUsers.find(u => u.email === data.officer_email);
      if (!officer) throw new Error('Officer not found');
      const response = await base44.functions.invoke('getPTORequests', { action: 'manual', ...data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);

      await base44.integrations.Core.SendEmail({
        from_name: "Black Point Protection HR",
        to: data.officer_email,
        subject: data.entry_mode === 'bonus' ? 'PTO Bonus Added to Your Account' : `${data.pto_type === 'pto' ? 'PTO' : 'Sick Time'} Added to Your Account`,
        body: data.entry_mode === 'bonus'
          ? `<p>Hello ${officer?.first_name || 'Officer'},</p><p>HR added <strong>${data.hours} hours</strong> of bonus PTO to your available balance.${data.reason ? ` Reason: ${data.reason}` : ''}</p><p>Your updated balance is available in Pathfinder.</p>`
          : `<p>Hello ${officer?.first_name || 'Officer'},</p><p>${data.pto_type === 'pto' ? 'PTO time' : 'Sick time'} has been added to your account.</p><p><strong>Hours Added:</strong> ${data.hours}h<br><strong>Dates:</strong> ${format(new Date(data.start_date), 'MMM d, yyyy')} - ${format(new Date(data.end_date), 'MMM d, yyyy')}${data.reason ? `<br><strong>Reason:</strong> ${data.reason}` : ''}</p>`
      });
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hrUsers'] });
      queryClient.invalidateQueries({ queryKey: ['allPTORequestsForHR'] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setShowDialog(false);
      setFormData({
        officer_email: "",
        start_date: "",
        end_date: "",
        pto_type: "pto",
        hours: "",
        reason: "",
        remove_shifts: true
      });
      toast.success(entryMode === 'bonus' ? 'Bonus PTO added to officer balance' : 'PTO entry added successfully');
    },
    onError: (error) => {
      toast.error(`Unable to add PTO: ${error.message}`);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.officer_email || !formData.hours || (entryMode !== 'bonus' && (!formData.start_date || !formData.end_date))) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPTOMutation.mutateAsync({ ...formData, entry_mode: entryMode });
    } finally {
      setIsSubmitting(false);
    }
  };

  const officer = activeUsers.find(u => u.email === formData.officer_email);

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('hr') && !user?.additional_roles?.includes('full_access') && String(user?.rank || '').toLowerCase() !== 'human resources') {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">Only HR administrators can access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manual PTO/Sick Time Entry</h1>
              <p className="text-slate-600">Add PTO or sick time from outside sources for officers</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setEntryMode('bonus'); setShowDialog(true); }} className="bg-violet-600 hover:bg-violet-500">
              <Gift className="mr-2 h-4 w-4" />Add PTO Bonus
            </Button>
            <Button onClick={() => { setEntryMode('leave'); setShowDialog(true); }} className="bg-blue-600 hover:bg-blue-500">
              <Plus className="mr-2 h-4 w-4" />Add PTO/Sick Time
            </Button>
          </div>
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{entryMode === 'bonus' ? 'Add PTO Bonus' : 'Add PTO or Sick Time'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="officer_email">Select Officer *</Label>
                <Select
                  value={formData.officer_email}
                  onValueChange={(value) => setFormData({...formData, officer_email: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an officer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUsers.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.first_name} {u.last_name} - {u.rank || 'Officer'} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {officer && (
                <Card className="bg-slate-50">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-600">Current PTO Balance</p>
                        <p className="text-lg font-bold text-green-600">{(officer.pto_balance_hours || 0).toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-slate-600">PTO Used YTD</p>
                        <p className="text-lg font-bold text-slate-900">{(officer.pto_year_to_date_used || 0).toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Current Sick Time Balance</p>
                        <p className="text-lg font-bold text-blue-600">{(officer.sick_time_balance_hours || 0).toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Sick Time Used YTD</p>
                        <p className="text-lg font-bold text-slate-900">{(officer.sick_time_year_to_date_used || 0).toFixed(1)}h</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {entryMode !== 'bonus' && <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pto_type">Type *</Label>
                  <Select
                    value={formData.pto_type}
                    onValueChange={(value) => setFormData({...formData, pto_type: value})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pto">PTO (Paid Time Off)</SelectItem>
                      <SelectItem value="sick">Sick Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="hours">Hours *</Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.hours}
                    onChange={(e) => setFormData({...formData, hours: e.target.value})}
                    placeholder="e.g., 8"
                    required
                  />
                </div>
              </div>}

              {entryMode !== 'bonus' && <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    required
                  />
                </div>
              </div>}

              {entryMode === 'bonus' && (
                <div>
                  <Label htmlFor="bonus_hours">Bonus Hours *</Label>
                  <Input id="bonus_hours" type="number" min="0.5" step="0.5" value={formData.hours} onChange={(e) => setFormData({...formData, hours: e.target.value})} placeholder="e.g., 8" required />
                </div>
              )}

              <div>
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Input
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  placeholder="e.g., Court ordered, Education, etc."
                />
              </div>

              {entryMode !== 'bonus' && <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <Label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={formData.remove_shifts}
                    onChange={(e) => setFormData({...formData, remove_shifts: e.target.checked})}
                    className="w-4 h-4 rounded"
                  />
                  Remove Scheduled Shifts & Place in Open Bid
                </Label>
                <p className="text-sm text-amber-800 mt-2">
                  If checked, all shifts scheduled during this period will be removed from the officer and placed as open shifts for other officers to bid on.
                </p>
              </div>}

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || addPTOMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting || addPTOMutation.isPending ? 'Processing...' : entryMode === 'bonus' ? 'Add Bonus PTO' : 'Add PTO/Sick Time'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}