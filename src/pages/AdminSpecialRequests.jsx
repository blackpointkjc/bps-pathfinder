import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Calendar, Clock, Users, AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function AdminSpecialRequests() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: requests } = useQuery({
    queryKey: ['allSpecialRequests'],
    queryFn: () => base44.entities.SpecialCoverageRequest.list('-created_date'),
    enabled: user?.role === 'admin',
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SpecialCoverageRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSpecialRequests'] });
      setSelectedRequest(null);
      setAdminNotes("");
    },
  });

  const handleApprove = (req) => {
    updateRequestMutation.mutate({
      id: req.id,
      data: {
        status: "approved",
        admin_notes: adminNotes,
        reviewed_by: user?.email,
        reviewed_date: new Date().toISOString(),
      }
    });
  };

  const handleReject = (req) => {
    if (!adminNotes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    updateRequestMutation.mutate({
      id: req.id,
      data: {
        status: "rejected",
        admin_notes: adminNotes,
        reviewed_by: user?.email,
        reviewed_date: new Date().toISOString(),
      }
    });
  };

  const handleScheduled = (req) => {
    updateRequestMutation.mutate({
      id: req.id,
      data: {
        status: "scheduled",
        admin_notes: adminNotes || "Scheduled in system",
        reviewed_by: user?.email,
        reviewed_date: new Date().toISOString(),
      }
    });
  };

  const getClientName = (email) => {
    const client = allUsers?.find(u => u.email === email);
    return client ? `${client.first_name} ${client.last_name}` : email;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const approvedRequests = requests?.filter(r => r.status === 'approved') || [];
  const scheduledRequests = requests?.filter(r => r.status === 'scheduled') || [];
  const rejectedRequests = requests?.filter(r => r.status === 'rejected') || [];

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to view this page.</p>
      </div>
    );
  }

  const RequestCard = ({ req }) => (
    <div className="p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-900">{req.location}</h3>
            <Badge className={getStatusColor(req.status)}>
              {req.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-slate-600 mb-2">{req.reason}</p>
          <p className="text-xs text-slate-500">
            Requested by: {getClientName(req.created_by)} on {format(new Date(req.created_date), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="w-4 h-4" />
          <span>{format(new Date(req.start_date), 'MMM d')} - {format(new Date(req.end_date), 'MMM d')}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Clock className="w-4 h-4" />
          <span>{req.shift_times}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Users className="w-4 h-4" />
          <span>{req.officers_needed} officer{req.officers_needed > 1 ? 's' : ''}</span>
        </div>
        {req.special_requirements && (
          <div className="flex items-center gap-2 text-slate-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">{req.special_requirements}</span>
          </div>
        )}
      </div>

      {req.admin_notes && (
        <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
          <p className="text-xs font-semibold text-blue-900">Admin Notes:</p>
          <p className="text-sm text-blue-700">{req.admin_notes}</p>
        </div>
      )}

      {selectedRequest?.id === req.id ? (
        <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="space-y-2">
            <Label htmlFor="admin_notes" className="text-sm">Admin Notes</Label>
            <Textarea
              id="admin_notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add notes about this request..."
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            {req.status === 'pending' && (
              <>
                <Button
                  onClick={() => handleApprove(req)}
                  className="bg-green-600 hover:bg-green-700 flex-1"
                  size="sm"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  onClick={() => handleReject(req)}
                  variant="destructive"
                  className="flex-1"
                  size="sm"
                >
                  <X className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </>
            )}
            {req.status === 'approved' && (
              <Button
                onClick={() => handleScheduled(req)}
                className="bg-blue-600 hover:bg-blue-700 flex-1"
                size="sm"
              >
                <Calendar className="w-4 h-4 mr-1" />
                Mark as Scheduled
              </Button>
            )}
            <Button
              onClick={() => {
                setSelectedRequest(null);
                setAdminNotes("");
              }}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => {
            setSelectedRequest(req);
            setAdminNotes(req.admin_notes || "");
          }}
          variant="outline"
          size="sm"
          className="w-full"
        >
          Review & Respond
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Special Coverage Requests</h1>
            <p className="text-slate-600">Review and schedule client special coverage requests</p>
          </div>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({approvedRequests.length})
            </TabsTrigger>
            <TabsTrigger value="scheduled">
              Scheduled ({scheduledRequests.length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({rejectedRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="text-yellow-700">Pending Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingRequests.map(req => <RequestCard key={req.id} req={req} />)}
                  {pendingRequests.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No pending requests</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved">
            <Card>
              <CardHeader>
                <CardTitle className="text-green-700">Approved - Ready to Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {approvedRequests.map(req => <RequestCard key={req.id} req={req} />)}
                  {approvedRequests.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No approved requests</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scheduled">
            <Card>
              <CardHeader>
                <CardTitle className="text-blue-700">Scheduled</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {scheduledRequests.map(req => <RequestCard key={req.id} req={req} />)}
                  {scheduledRequests.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No scheduled requests</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rejected">
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700">Rejected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {rejectedRequests.map(req => <RequestCard key={req.id} req={req} />)}
                  {rejectedRequests.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No rejected requests</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}