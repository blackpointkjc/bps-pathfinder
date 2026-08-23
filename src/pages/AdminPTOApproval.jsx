import { confirmInApp } from '@/lib/inAppDialog';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CalendarClock, Check, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LOGO_URL = "/black-point-shield.svg";

export default function AdminPTOApproval() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [actionType, setActionType] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasHRAccess = user?.role === 'admin' || user?.additional_roles?.includes('hr') || user?.additional_roles?.includes('full_access');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['appDirectoryUsers', 'ptoApproval'],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    enabled: hasHRAccess,
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const { data: allPTORequests = [], isLoading: ptoLoading, error: ptoError } = useQuery({
    queryKey: ['allPTORequestsForHR'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getPTORequests', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.requests || [];
    },
    enabled: hasHRAccess,
    initialData: [],
    refetchInterval: 30000,
  });

  const pendingRequests = allPTORequests.filter(request => String(request.status || '').toLowerCase() === 'pending');
  const reviewedRequests = allPTORequests
    .filter(request => ['approved', 'denied'].includes(String(request.status || '').toLowerCase()))
    .sort((a, b) => new Date(b.reviewed_date || b.updated_date || b.created_date || 0) - new Date(a.reviewed_date || a.updated_date || a.created_date || 0));

  const getAdminName = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Admin';
    const admin = allUsers.find(u => u.email === email);
    if (!admin) return 'Admin';
    if (admin.first_name && admin.last_name) {
      return `${admin.first_name} ${admin.last_name}`;
    }
    return admin.full_name || 'Admin'; // Fallback to full_name or 'Admin'
  };

  const resolveOfficer = (requestOrEmail) => {
    const request = requestOrEmail && typeof requestOrEmail === 'object' ? requestOrEmail : null;
    const rawEmail = request ? (request.requested_by_email || request.created_by || '') : requestOrEmail;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const rawName = request?.requested_by_name;
    const savedName = typeof rawName === 'string' ? rawName.trim() : '';
    const officer = allUsers.find(u => String(u.email || '').trim().toLowerCase() === email);
    const fullName = officer
      ? ([officer.first_name, officer.last_name].filter(Boolean).join(' ') || officer.full_name || savedName)
      : savedName;
    const rank = officer?.rank || '';
    return {
      officer,
      email: email || 'Email unavailable',
      name: fullName || 'Unknown Employee',
      displayName: [rank, fullName].filter(Boolean).join(' ') || 'Unknown Employee',
      photo: officer?.profile_photo_url || '',
      unit: officer?.unit_number || officer?.badge_number || '',
    };
  };

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      const response = await base44.functions.invoke('getPTORequests', {
        action: 'review',
        request_id: id,
        status,
        admin_notes: notes,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allPTORequestsForHR'] });
      setShowDialog(false);
      setSelectedRequest(null);
      setAdminNotes("");
    },
  });

  const removeApprovedMutation = useMutation({
    mutationFn: async (request) => {
      const response = await base44.functions.invoke('getPTORequests', {
        action: 'cancel_approved',
        request_id: request.id,
        admin_notes: 'Approved PTO removed by HR and hours restored.',
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: payload => {
      queryClient.invalidateQueries({ queryKey: ['allPTORequestsForHR'] });
      queryClient.invalidateQueries({ queryKey: ['hrUsers'] });
      toast.success(`Request removed and ${Number(payload.restored_hours || 0).toFixed(1)} PTO hours restored`);
    },
    onError: error => toast.error(error?.message || 'Unable to remove approved PTO'),
  });

  const handleAction = (request, type) => {
    setSelectedRequest(request);
    setActionType(type);
    setAdminNotes("");
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (selectedRequest && actionType) {
      updateRequestMutation.mutate({
        id: selectedRequest.id,
        status: actionType,
        notes: adminNotes
      });
    }
  };

  if (!hasHRAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">HR Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Black Point Protection" className="w-16 h-16 object-contain" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">PTO Approval</h1>
            <p className="text-slate-600">Review pending requests and complete PTO decision history</p>
          </div>
        </div>

        {ptoLoading && <p className="text-slate-400">Loading PTO requests…</p>}
        {ptoError && <Card className="border-red-700/50 bg-red-950/20"><CardContent className="p-4 text-red-300">Unable to load PTO requests: {ptoError.message}</CardContent></Card>}

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-600" />
              Pending Requests ({pendingRequests?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {pendingRequests?.map((request) => {
                const officer = allUsers?.find(u => u.email === (request.requested_by_email || request.created_by));
                return (
                <div key={request.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-amber-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {(() => {
                        const identity = resolveOfficer(request);
                        return <div className="mb-3 flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-600 bg-slate-800 text-sm font-bold text-white">
                            {identity.photo ? <img src={identity.photo} alt="" className="h-full w-full object-cover" /> : identity.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-100">{identity.displayName}</p>
                            <p className="text-xs text-slate-400">{identity.email}{identity.unit ? ` · Unit ${identity.unit}` : ''}</p>
                          </div>
                        </div>;
                      })()}
                      <p className="text-sm text-slate-600 mb-2">
                        {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-slate-700 mb-2">{request.reason}</p>
                      <div className="flex gap-4 text-xs mb-2">
                        <span className={`font-medium ${request.request_type === 'paid' ? 'text-green-600' : 'text-orange-600'}`}>
                          {request.request_type === 'paid' ? '💰 PAID' : '⭕ UNPAID'}
                        </span>
                        <span className="text-slate-600">Hours: <strong>{request.hours_requested || 0}h</strong></span>
                        {request.request_type === 'paid' && (
                          <>
                            <span className="text-slate-600">Balance: <strong>{(request.pto_balance_at_request || 0).toFixed(1)}h</strong></span>
                            <span className="text-slate-600">Current: <strong>{(officer?.pto_balance_hours || 0).toFixed(1)}h</strong></span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Submitted: {format(new Date(request.created_date), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAction(request, 'approved')}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleAction(request, 'denied')}
                        variant="destructive"
                        size="sm"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Deny
                      </Button>
                    </div>
                  </div>
                </div>
              )})}
              {!pendingRequests?.length && (
                <p className="text-center text-slate-500 py-8">No pending requests</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Reviewed Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {reviewedRequests?.map((request) => (
                <div key={request.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-100">{resolveOfficer(request).displayName}</p>
                      <p className="text-xs text-slate-400">{resolveOfficer(request).email}</p>
                      <p className="text-sm text-slate-600">
                        {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                      </p>
                      <div className="flex gap-3 text-xs text-slate-500 mt-1">
                        <span className={request.request_type === 'paid' ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                          {request.request_type === 'paid' ? 'PAID' : 'UNPAID'}
                        </span>
                        <span>{request.hours_requested || 0}h</span>
                      </div>
                      {request.admin_notes && (
                        <p className="text-xs text-slate-600 mt-2">Notes: {request.admin_notes}</p>
                      )}
                    </div>
                    <div className="text-right space-y-2">
                      <Badge variant="outline" className={
                        request.status === 'approved'
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : request.status === 'cancelled'
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-red-100 text-red-800 border-red-200'
                      }>
                        {request.status}
                      </Badge>
                      <p className="text-xs text-slate-500">
                        by {getAdminName(request.reviewed_by)}
                      </p>
                      {request.status === 'approved' && request.request_type === 'paid' && !String(request.admin_notes || '').startsWith('Manual ') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={removeApprovedMutation.isPending}
                          onClick={async () => {
                            const hours = Number(request.hours_requested || 0);
                            if (await confirmInApp(`Remove this approved PTO request and return ${hours.toFixed(1)} hours to ${resolveOfficer(request).name}?`)) {
                              removeApprovedMutation.mutate(request);
                            }
                          }}
                          className="border-amber-500 text-amber-700 hover:bg-amber-50"
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Remove & Restore
                        </Button>
                      )}

                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approved' ? 'Approve' : 'Deny'} Time Off Request
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold text-slate-100">{resolveOfficer(selectedRequest).displayName}</p>
                <p className="text-xs text-slate-400">{resolveOfficer(selectedRequest).email}</p>
                <p className="text-sm text-slate-600">
                  {format(new Date(selectedRequest.start_date), 'MMM d, yyyy')} - {format(new Date(selectedRequest.end_date), 'MMM d, yyyy')}
                </p>
                <p className="text-sm text-slate-700 mt-2">{selectedRequest.reason}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin_notes">Notes to Officer (Optional)</Label>
                <Textarea
                  id="admin_notes"
                  placeholder="Add any notes or comments..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={updateRequestMutation.isPending}
                  className={actionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {updateRequestMutation.isPending ? 'Processing...' : actionType === 'approved' ? 'Approve Request' : 'Deny Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}