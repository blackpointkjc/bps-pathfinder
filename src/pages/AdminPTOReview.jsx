import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CalendarClock, Check, X } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminPTOReview() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [actionType, setActionType] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['pendingPTORequests'],
    queryFn: () => base44.entities.TimeOffRequest.filter({ status: 'pending' }, '-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: reviewedRequests } = useQuery({
    queryKey: ['reviewedPTORequests'],
    queryFn: async () => {
      const approved = await base44.entities.TimeOffRequest.filter({ status: 'approved' }, '-reviewed_date', 50);
      const denied = await base44.entities.TimeOffRequest.filter({ status: 'denied' }, '-reviewed_date', 50);
      return [...approved, ...denied];
    },
    enabled: user?.role === 'admin',
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      await base44.entities.TimeOffRequest.update(id, {
        status,
        admin_notes: notes,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString()
      });

      // Send email notification
      const request = pendingRequests.find(r => r.id === id);
      if (request) {
        await base44.integrations.Core.SendEmail({
          to: request.created_by,
          subject: `Time Off Request ${status === 'approved' ? 'Approved' : 'Denied'}`,
          body: `Your time off request from ${format(new Date(request.start_date), 'MMM d, yyyy')} to ${format(new Date(request.end_date), 'MMM d, yyyy')} has been ${status}.\n\n${notes ? `Admin Notes: ${notes}` : ''}\n\nVirtus Security\nRichmond, VA`
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPTORequests'] });
      queryClient.invalidateQueries({ queryKey: ['reviewedPTORequests'] });
      setShowDialog(false);
      setSelectedRequest(null);
      setAdminNotes("");
    },
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

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">PTO Requests</h1>
            <p className="text-slate-600">Review and approve time-off requests</p>
          </div>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-600" />
              Pending Requests ({pendingRequests?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {pendingRequests?.map((request) => (
                <div key={request.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-amber-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 mb-2">{request.created_by}</p>
                      <p className="text-sm text-slate-600 mb-2">
                        {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-slate-700 mb-3">{request.reason}</p>
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
              ))}
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
                    <div>
                      <p className="font-semibold text-slate-900">{request.created_by}</p>
                      <p className="text-sm text-slate-600">
                        {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                      </p>
                      {request.admin_notes && (
                        <p className="text-xs text-slate-600 mt-2">Notes: {request.admin_notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={
                        request.status === 'approved' 
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                      }>
                        {request.status}
                      </Badge>
                      <p className="text-xs text-slate-500 mt-1">
                        by {request.reviewed_by?.split('@')[0]}
                      </p>
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
                <p className="font-semibold text-slate-900">{selectedRequest.created_by}</p>
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