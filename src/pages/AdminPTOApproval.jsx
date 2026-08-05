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

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

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

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(), // Fetches all users
    enabled: user?.role === 'admin', // Only fetch if user is admin
    initialData: [], // Add initialData to prevent undefined during first render
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

  const getAdminName = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Admin';
    const admin = allUsers.find(u => u.email === email);
    if (!admin) return 'Admin';
    if (admin.first_name && admin.last_name) {
      return `${admin.first_name} ${admin.last_name}`;
    }
    return admin.full_name || 'Admin'; // Fallback to full_name or 'Admin'
  };

  const getOfficerName = (email) => {
    if (!email || !allUsers || allUsers.length === 0) return 'Officer';
    const officer = allUsers.find(u => u.email === email);
    if (!officer) return 'Officer';
    if (officer.first_name && officer.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return officer.full_name || 'Officer'; // Fallback to full_name or 'Officer'
  };

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      const request = pendingRequests.find(r => r.id === id);
      
      await base44.entities.TimeOffRequest.update(id, {
        status,
        admin_notes: notes,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString()
      });

      // If approved and paid, deduct from officer's PTO balance
      if (status === 'approved' && request.request_type === 'paid') {
        const officer = allUsers?.find(u => u.email === request.created_by);
        if (officer) {
          const newBalance = (officer.pto_balance_hours || 0) - (request.hours_requested || 0);
          const newUsed = (officer.pto_year_to_date_used || 0) + (request.hours_requested || 0);
          
          await base44.entities.User.update(officer.id, {
            pto_balance_hours: Math.max(0, newBalance),
            pto_year_to_date_used: newUsed
          });
        }
      }

      if (request) {
        const officer = allUsers?.find(u => u.email === request.created_by);
        
        // Send email notification
        await base44.integrations.Core.SendEmail({
          from_name: "Virtus Security HR",
          to: request.created_by,
          subject: `Time Off Request ${status === 'approved' ? 'Approved ✅' : 'Denied ❌'}`,
          body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${status === 'approved' ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .info-box { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 2px solid ${status === 'approved' ? '#10b981' : '#dc2626'}; }
    .info-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .info-item:last-child { border-bottom: none; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
    .button { background: ${status === 'approved' ? '#10b981' : '#dc2626'}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${status === 'approved' ? '✅ Request Approved!' : '❌ Request Denied'}</h1>
      <p style="margin: 10px 0 0 0;">Virtus Security Services</p>
    </div>
    
    <div class="content">
      <h2 style="color: ${status === 'approved' ? '#10b981' : '#dc2626'}; margin-top: 0;">Time Off Request ${status === 'approved' ? 'Approved' : 'Denied'}</h2>
      
      <p>Hello ${getOfficerName(request.created_by)},</p>
      
      <p>Your time off request has been ${status}.</p>
      
      <div class="info-box">
        <div class="info-item"><strong>Dates:</strong> ${format(new Date(request.start_date), 'MMM d, yyyy')} - ${format(new Date(request.end_date), 'MMM d, yyyy')}</div>
        <div class="info-item"><strong>Reason:</strong> ${request.reason}</div>
        <div class="info-item"><strong>Status:</strong> <span style="color: ${status === 'approved' ? '#10b981' : '#dc2626'}; font-weight: bold;">${status.toUpperCase()}</span></div>
        ${notes ? `<div class="info-item"><strong>Admin Notes:</strong> ${notes}</div>` : ''}
      </div>
      
      ${status === 'approved' ? '<p style="color: #10b981; font-weight: bold;">&#10003; Your time off has been approved. Enjoy your time away!</p>' : '<p style="color: #dc2626; font-weight: bold;">Your request was not approved at this time. Please contact your supervisor if you have questions.</p>'}
      
      <center>
        <a href="https://virtusconnect.base44.app" class="button">View in VirtusConnect</a>
      </center>
      
      <div class="footer">
        <p><strong>Virtus Security Services</strong><br/>
        Richmond, Virginia</p>
      </div>
    </div>
  </div>
</body>
</html>`
        });
        
        // Send SMS notification if phone number is available and request is approved
        if (officer?.mobile_phone && status === 'approved') {
          const smsCarriers = [
            '@txt.att.net',
            '@vtext.com',
            '@tmomail.net',
            '@messaging.sprintpcs.com',
            '@vmobl.com',
            '@mmst5.tracfone.com'
          ];
          
          for (const carrier of smsCarriers) {
            try {
              await base44.integrations.Core.SendEmail({
                from_name: "Virtus Security",
                to: officer.mobile_phone + carrier,
                subject: "",
                body: `Virtus Security: Your PTO request for ${format(new Date(request.start_date), 'MMM d')}-${format(new Date(request.end_date), 'MMM d')} has been APPROVED. Check VirtusConnect for details.`
              });
            } catch (error) {
              console.log(`SMS attempt failed for carrier ${carrier}`);
            }
          }
        }
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

  const getPendingForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return pendingRequests?.filter(req => {
      // Compare date strings directly
      // Assuming req.start_date and req.end_date are ISO 8601 strings (e.g., "YYYY-MM-DDTHH:mm:ss.sssZ")
      const startDate = req.start_date.split('T')[0];
      const endDate = req.end_date.split('T')[0];
      return dateStr >= startDate && dateStr <= endDate;
    }) || [];
  };

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
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Virtus Security" className="w-16 h-16 object-contain" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">PTO Approval</h1>
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
              {pendingRequests?.map((request) => {
                const officer = allUsers?.find(u => u.email === request.created_by);
                return (
                <div key={request.id} className="p-5 bg-slate-50 rounded-lg border-l-4 border-amber-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 mb-2">{getOfficerName(request.created_by)}</p>
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
                      <p className="font-semibold text-slate-900">{getOfficerName(request.created_by)}</p>
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
                    <div className="text-right">
                      <Badge variant="outline" className={
                        request.status === 'approved' 
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                      }>
                        {request.status}
                      </Badge>
                      <p className="text-xs text-slate-500 mt-1">
                        by {getAdminName(request.reviewed_by)}
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
                <p className="font-semibold text-slate-900">{getOfficerName(selectedRequest.created_by)}</p>
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