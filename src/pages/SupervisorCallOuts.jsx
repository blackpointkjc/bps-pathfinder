import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserX, Clock, AlertTriangle, Plus, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { getCurrentDirectoryUser, listDirectoryLocations, listSupervisorDirectoryOfficers } from '@/lib/appDirectory';
import { hasOfficerAdditionalRole } from '@/lib/directoryUtils';

export default function SupervisorCallOuts() {
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    officer_email: "",
    call_out_type: "called_out",
    call_out_date: format(new Date(), 'yyyy-MM-dd'),
    call_out_time: format(new Date(), 'HH:mm'),
    reason: "",
    location: "",
    original_location: "",
    destination_location: "",
    exclude_original_incident_metric: false,
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'supervisorCallOuts'],
    queryFn: () => listSupervisorDirectoryOfficers('last_name', 1000),
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['directoryLocations', 'supervisorCallOuts'],
    queryFn: async () => {
      try {
        const direct = await base44.entities.Location.list('site_name', 1000);
        if (Array.isArray(direct) && direct.length) return direct.filter(loc => loc.active !== false);
      } catch (error) {
        console.warn('Direct location list failed:', error?.message);
      }
      const fallback = await listDirectoryLocations('site_name', 1000);
      return (fallback || []).filter(loc => loc.active !== false);
    },
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: callOuts } = useQuery({
    queryKey: ['callOuts'],
    queryFn: () => base44.entities.CallOut.list('-call_out_date'),
    initialData: [],
  });

  const createCallOutMutation = useMutation({
    mutationFn: async (data) => {
      const officer = allUsers.find(u => u.email === data.officer_email);
      return await base44.entities.CallOut.create({
        ...data,
        officer_name: officer ? `${officer.first_name} ${officer.last_name}` : data.officer_email,
        supervisor_email: user.email,
        supervisor_name: `${user.first_name} ${user.last_name}`,
        affects_pto: data.call_out_type !== 'reassigned',
        exclude_original_incident_metric: data.call_out_type === 'reassigned' ? true : !!data.exclude_original_incident_metric,
        location: data.call_out_type === 'reassigned' ? data.original_location : data.location,
        admin_notified: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callOuts'] });
      setShowDialog(false);
      resetForm();
      alert('Call-out documented successfully. Admin has been notified.');
    },
  });

  const resetForm = () => {
    setFormData({
      officer_email: "",
      call_out_type: "called_out",
      call_out_date: format(new Date(), 'yyyy-MM-dd'),
      call_out_time: format(new Date(), 'HH:mm'),
      reason: "",
      location: "",
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.call_out_type === 'reassigned' && (!formData.original_location || !formData.destination_location)) {
      alert('Select both the original property and the destination property/assignment.');
      return;
    }
    createCallOutMutation.mutate(formData);
  };

  const isSupervisorOrAdmin = user?.role === 'admin' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access');

  if (!isSupervisorOrAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
      </div>
    );
  }

  const officers = allUsers.filter(hasOfficerAdditionalRole);

  const recentCallOuts = callOuts.slice(0, 50);

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="mobile-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Call-Out Management</h1>
            <p className="text-slate-600">Document officer call-outs and early dismissals</p>
          </div>
          <Button onClick={() => setShowDialog(true)} className="w-full bg-red-600 hover:bg-red-700 sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Document Call-Out
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-red-50 to-rose-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <UserX className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-3xl font-bold text-red-900">
                    {callOuts.filter(c => c.call_out_type === 'called_out').length}
                  </p>
                  <p className="text-sm text-red-700">Called Out</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg bg-gradient-to-br from-amber-50 to-orange-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-amber-600" />
                <div>
                  <p className="text-3xl font-bold text-amber-900">
                    {callOuts.filter(c => c.call_out_type === 'sent_home').length}
                  </p>
                  <p className="text-sm text-amber-700">Sent Home</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Recent Call-Outs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCallOuts.length === 0 ? (
              <div className="text-center py-12">
                <UserX className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">No call-outs documented yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCallOuts.map((callOut) => (
                  <div key={callOut.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-900">{callOut.officer_name}</p>
                          <Badge className={callOut.call_out_type === 'called_out' ? 'bg-red-600' : callOut.call_out_type === 'reassigned' ? 'bg-blue-600' : 'bg-amber-600'}>
                            {callOut.call_out_type === 'called_out' ? 'Called Out' : callOut.call_out_type === 'reassigned' ? 'Reassigned' : 'Sent Home'}
                          </Badge>
                          {callOut.affects_pto && (
                            <Badge variant="outline" className="border-purple-600 text-purple-600">
                              No PTO Accrual
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-slate-600">
                          <p><strong>Date:</strong> {format(new Date(callOut.call_out_date), 'MMM d, yyyy')}</p>
                          <p><strong>Time:</strong> {callOut.call_out_time}</p>
                          {callOut.call_out_type === 'reassigned' ? (
                            <>
                              <p><strong>Original Property:</strong> {callOut.original_location || callOut.location || 'Not recorded'}</p>
                              <p><strong>Destination:</strong> {callOut.destination_location || 'Not recorded'}</p>
                              <p className="text-blue-700"><strong>Incident Metric:</strong> Original-property calls after reassignment are excluded.</p>
                            </>
                          ) : callOut.location ? <p><strong>Location:</strong> {callOut.location}</p> : null}
                          <p><strong>Reason:</strong> {callOut.reason}</p>
                          <p className="text-xs text-slate-500 mt-2">
                            Documented by: {callOut.supervisor_name} • {format(new Date(callOut.created_date), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Document Call-Out</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Officer *</Label>
              <Select value={formData.officer_email} onValueChange={(value) => setFormData({...formData, officer_email: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select officer..." />
                </SelectTrigger>
                <SelectContent>
                  {officers.length === 0 ? (
                    <div className="p-2 text-sm text-slate-500">No officers found</div>
                  ) : (
                    officers.map((officer) => (
                      <SelectItem key={officer.email} value={officer.email}>
                        {officer.first_name} {officer.last_name} - {officer.rank || 'Officer'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={formData.call_out_type} onValueChange={(value) => setFormData({...formData, call_out_type: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="called_out">Called Out (Officer called to say they can't come in)</SelectItem>
                  <SelectItem value="sent_home">Sent Home (Officer was sent home early)</SelectItem>
                  <SelectItem value="reassigned">Reassigned / Called to Another Property</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.call_out_date}
                  onChange={(e) => setFormData({...formData, call_out_date: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={formData.call_out_time}
                  onChange={(e) => setFormData({...formData, call_out_time: e.target.value})}
                  required
                />
              </div>
            </div>

            {formData.call_out_type === 'reassigned' ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Original Property *</Label>
                  <Select value={formData.original_location} onValueChange={(value) => setFormData({...formData, original_location: value, location: value, exclude_original_incident_metric: true})}>
                    <SelectTrigger><SelectValue placeholder="Select original property..." /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={`origin-${loc.id}`} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination Property / Assignment *</Label>
                  <Select value={formData.destination_location} onValueChange={(value) => setFormData({...formData, destination_location: value})}>
                    <SelectTrigger><SelectValue placeholder="Select destination..." /></SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => <SelectItem key={`dest-${loc.id}`} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Incident-report requirements at the original property after this reassignment time will be excluded from the officer's Job Duty metric.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Location (Optional)</Label>
                <Select value={formData.location} onValueChange={(value) => setFormData({...formData, location: value})}>
                  <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => <SelectItem key={loc.id} value={loc.site_name}>{loc.site_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                placeholder="Reason for call-out or being sent home..."
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                rows={3}
                required
              />
            </div>

            <div className={`p-4 rounded-lg border ${formData.call_out_type === 'reassigned' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className={`text-sm ${formData.call_out_type === 'reassigned' ? 'text-blue-800' : 'text-amber-800'}`}>
                <strong>Important:</strong> {formData.call_out_type === 'reassigned'
                  ? 'A reassignment does not count as an attendance call-out. Property-call Incident Report requirements at the original location after the reassignment time will be excluded from Job Duty performance.'
                  : 'This will prevent PTO accrual for this officer on this date and will appear in attendance performance analytics.'}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={createCallOutMutation.isPending}>
                Document Call-Out
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}