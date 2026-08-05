import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Plus } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "../components/dashboard/StatusBadge";

export default function TimeRequests() {
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState("paid");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 5000,
  });

  const { data: requests } = useQuery({
    queryKey: ['timeOffRequests'],
    queryFn: () => base44.entities.TimeOffRequest.filter(
      { created_by: user?.email },
      '-created_date'
    ),
    enabled: !!user,
  });

  const calculateBusinessDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    let count = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const calculateRequestedHours = () => {
    return calculateBusinessDays(startDate, endDate) * 8;
  };

  const createRequestMutation = useMutation({
    mutationFn: async (data) => {
      const created = await base44.entities.TimeOffRequest.create(data);
      
      // If approved and paid, deduct from PTO balance
      if (data.status === 'approved' && data.request_type === 'paid') {
        await base44.auth.updateMe({
          pto_balance_hours: (user.pto_balance_hours || 0) - data.hours_requested,
          pto_year_to_date_used: (user.pto_year_to_date_used || 0) + data.hours_requested
        });
      }
      
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffRequests'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setRequestType("paid");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const hoursRequested = calculateRequestedHours();
    
    if (requestType === 'paid' && hoursRequested > (user?.pto_balance_hours || 0)) {
      alert(`Insufficient PTO balance. You have ${(user?.pto_balance_hours || 0).toFixed(1)} hours available, but requested ${hoursRequested} hours.`);
      return;
    }
    
    createRequestMutation.mutate({
      start_date: startDate,
      end_date: endDate,
      reason,
      request_type: requestType,
      hours_requested: hoursRequested,
      pto_balance_at_request: user?.pto_balance_hours || 0,
      status: "pending",
    });
  };

  const ptoBalance = user?.pto_balance_hours || 0;
  const ptoYearToDate = user?.pto_year_to_date_accrued || 0;

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Time Off Requests</h1>
            <p className="text-slate-600">Submit and track your time-off requests</p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        </div>

        <Card className="border-none shadow-lg bg-gradient-to-r from-green-50 to-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-slate-600 font-medium">PTO Balance</p>
                <p className="text-4xl font-bold text-emerald-900">{ptoBalance.toFixed(1)} hrs</p>
                <p className="text-xs text-slate-600 mt-1">
                  Earn up to 40 hrs/year (rate: 0.0196 hrs per hour worked)
                </p>
                </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 font-medium">Year to Date</p>
                <p className="text-2xl font-bold text-slate-900">{ptoYearToDate.toFixed(1)} hrs</p>
                <p className="text-xs text-slate-600 mt-1">Total Accrued</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 font-medium">Used This Year</p>
                <p className="text-2xl font-bold text-orange-900">{(user?.pto_year_to_date_used || 0).toFixed(1)} hrs</p>
                <p className="text-xs text-slate-600 mt-1">Total Used</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-blue-600" />
                New Time Off Request
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date *</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date *</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                {startDate && endDate && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">
                      Request Summary: {calculateBusinessDays(startDate, endDate)} business days = {calculateRequestedHours()} hours
                    </p>
                    {requestType === 'paid' && (
                      <p className="text-xs text-blue-700 mt-1">
                        Remaining balance after approval: {(ptoBalance - calculateRequestedHours()).toFixed(1)} hours
                      </p>
                    )}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="request_type">Request Type *</Label>
                  <select
                    id="request_type"
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    required
                  >
                    <option value="paid">Paid Time Off (PTO)</option>
                    <option value="unpaid">Unpaid Time Off</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Please provide a reason for your time off request..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    rows={4}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createRequestMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Your Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {requests?.map((request) => (
                <div key={request.id} className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-slate-900">
                          {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                        </p>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{request.reason}</p>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>Type: <strong className={request.request_type === 'paid' ? 'text-green-600' : 'text-orange-600'}>{request.request_type === 'paid' ? 'PAID' : 'UNPAID'}</strong></span>
                        <span>Hours: <strong>{request.hours_requested || 0}h</strong></span>
                        {request.request_type === 'paid' && (
                          <span>Balance at request: <strong>{(request.pto_balance_at_request || 0).toFixed(1)}h</strong></span>
                        )}
                      </div>
                    </div>
                  </div>
                  {request.admin_notes && (
                    <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                      <p className="text-xs text-slate-500 mb-1">Admin Notes:</p>
                      <p className="text-sm text-slate-700">{request.admin_notes}</p>
                    </div>
                  )}
                </div>
              ))}
              {!requests?.length && (
                <p className="text-center text-slate-500 py-8">No requests yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}