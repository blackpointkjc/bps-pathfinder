import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, AlertCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { listOfficerDirectory } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';

export default function AdminManualPTO() {
  const [showDialog, setShowDialog] = useState(false);
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

  const { data: schedules } = useQuery({
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

      // Send notification email
      await base44.integrations.Core.SendEmail({
        from_name: "Black Point Protection HR",
        to: data.officer_email,
        subject: `${data.pto_type === 'pto' ? 'PTO' : 'Sick Time'} Added to Your Account`,
        body: `
          <p>Hello ${officer?.first_name || 'Officer'},</p>
          <p>${data.pto_type === 'pto' ? 'PTO time' : 'Sick time'} has been added to your account from an outside source.</p>
          <p><strong>Type:</strong> ${data.pto_type === 'pto' ? 'Paid Time Off' : 'Sick Time'}<br>
          <strong>Hours Added:</strong> ${data.hours}h<br>
          <strong>Dates:</strong> ${format(new Date(data.start_date), 'MMM d, yyyy')} - ${format(new Date(data.end_date), 'MMM d, yyyy')}
          ${data.reason ? `<br><strong>Reason:</strong> ${data.reason}` : ''}</p>
          <p>You can view your updated balance in the Black Point Portal.</p>
        `
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
      alert('✅ PTO added successfully and shifts have been reassigned to open bids!');
    },
    onError: (error) => {
      alert('❌ Error adding PTO: ' + error.message);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.officer_email || !formData.start_date || !formData.end_date || !formData.hours) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPTOMutation.mutateAsync(formData);
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
          <Button
            onClick={() => setShowDialog(true)}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add PTO/Sick Time
          </Button>
        </div>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">How it works:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Enter officer details and the PTO/sick time being added</li>
                  <li>Officer will be prompted to choose if they want to use this time immediately</li>
                  <li>If they accept, all shifts during the period will be removed and placed in open bid</li>
                  <li>Admins cannot schedule this officer during approved PTO periods</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add PTO or Sick Time</DialogTitle>
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

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div>
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Input
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  placeholder="e.g., Court ordered, Education, etc."
                />
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
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
              </div>

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
                  {isSubmitting || addPTOMutation.isPending ? 'Processing...' : 'Add PTO/Sick Time'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}