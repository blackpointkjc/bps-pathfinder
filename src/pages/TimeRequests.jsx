import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Plus, Clock3, CheckCircle2, History } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "../components/dashboard/StatusBadge";
import { toast } from 'sonner';

export default function TimeRequests() {
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [requestType, setRequestType] = useState("paid");
  const queryClient = useQueryClient();
  const recalculatedForRef = useRef('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user?.email || recalculatedForRef.current === user.email) return;
    recalculatedForRef.current = user.email;
    base44.functions.invoke('calculatePTOForOfficer', { officer_email: user.email })
      .then(() => queryClient.invalidateQueries({ queryKey: ['currentUser'] }))
      .catch(error => console.warn('[PTO] accrual refresh failed:', error?.message));
  }, [user?.email, queryClient]);

  const { data: requests = [], error: requestsError } = useQuery({
    queryKey: ['timeOffRequests', user?.email],
    queryFn: async () => {
      const response = await base44.functions.invoke('getPTORequests', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.requests || [];
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
    initialData: [],
  });

  const { data: ptoAdjustments = [] } = useQuery({
    queryKey: ['ptoAdjustments', user?.email],
    queryFn: () => base44.entities.PTOAdjustment.filter({ officer_email: String(user?.email || '').toLowerCase(), active: true }, '-granted_at', 500),
    enabled: !!user?.email,
    initialData: [],
    refetchInterval: 30000,
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
      const response = await base44.functions.invoke('getPTORequests', { action: 'submit', ...data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.request;
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
      toast.error(`Insufficient PTO balance: ${(user?.pto_balance_hours || 0).toFixed(1)} hours available, ${hoursRequested} requested.`);
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
  const annualEntitlement = useMemo(() => {
    const rank = String(user?.rank || '').trim().toLowerCase();
    return rank === 'colonel' || rank === 'lt colonel' || rank === 'lieutenant colonel' ? 180 : 40;
  }, [user?.rank]);
  const usedYtd = Number(user?.pto_year_to_date_used || 0);
  const bonusHours = useMemo(() => (ptoAdjustments || [])
    .filter(adjustment => adjustment?.active !== false)
    .reduce((sum, adjustment) => sum + Number(adjustment.hours || 0), 0), [ptoAdjustments]);
  const accruedPercent = annualEntitlement > 0 ? Math.min(100, Math.round((ptoYearToDate / annualEntitlement) * 100)) : 0;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07101a] p-3 text-slate-100 sm:p-4 md:p-6">
      <div className="mx-auto w-full min-w-0 space-y-4" style={{ maxWidth: '1180px' }}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0d1725] to-[#0a1320] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-300">Leave Management</div>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Time Off</h1>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />New Request
          </Button>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="min-w-0 border border-emerald-900/60 bg-[#0d1725] text-white shadow-lg"><CardContent className="flex h-full min-w-0 flex-col p-4"><CheckCircle2 className="h-5 w-5 text-emerald-400" /><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Available PTO</div><div className="mt-1 text-3xl font-black text-emerald-300">{ptoBalance.toFixed(1)}h</div><div className="mt-2 text-[11px] leading-5 text-slate-400">{ptoYearToDate.toFixed(1)} earned + {bonusHours.toFixed(1)} bonus/grant − {usedYtd.toFixed(1)} used</div></CardContent></Card>
          <Card className="min-w-0 border border-blue-900/60 bg-[#0d1725] text-white shadow-lg"><CardContent className="flex h-full min-w-0 flex-col p-4"><Clock3 className="h-5 w-5 text-blue-400" /><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Earned YTD</div><div className="mt-1 text-3xl font-black text-blue-300">{ptoYearToDate.toFixed(1)}h</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${accruedPercent}%` }} /></div><div className="mt-2 text-[10px] text-slate-500">Annual earned-PTO target: {annualEntitlement}h</div></CardContent></Card>
          <Card className="min-w-0 border border-violet-900/60 bg-[#0d1725] text-white shadow-lg"><CardContent className="flex h-full min-w-0 flex-col p-4"><CalendarClock className="h-5 w-5 text-violet-400" /><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Bonus / Grants</div><div className="mt-1 text-3xl font-black text-violet-300">{bonusHours.toFixed(1)}h</div><div className="mt-2 text-[10px] leading-5 text-slate-500">Separate from earned accrual and included in Available PTO.</div></CardContent></Card>
          <Card className="min-w-0 border border-amber-900/60 bg-[#0d1725] text-white shadow-lg"><CardContent className="flex h-full min-w-0 flex-col p-4"><History className="h-5 w-5 text-amber-400" /><div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Used YTD</div><div className="mt-1 text-3xl font-black text-amber-300">{usedYtd.toFixed(1)}h</div><div className="mt-2 text-[10px] text-slate-500">Approved paid leave deducted from available balance.</div></CardContent></Card>
        </div>

        {showForm && (
          <Card className="overflow-hidden border border-slate-800 bg-[#0d1725] text-slate-100 shadow-xl">
            <CardHeader className="border-b border-slate-800 bg-[#101b29]">
              <CardTitle className="flex items-center gap-2 text-white"><CalendarClock className="h-5 w-5 text-blue-400" />New Time Off Request</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
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
                  <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-3 text-sm text-blue-100">
                    {calculateBusinessDays(startDate, endDate)} business days · {calculateRequestedHours()} hours
                    {requestType === 'paid' && <span className="ml-2 text-blue-300">· {(ptoBalance - calculateRequestedHours()).toFixed(1)}h remaining</span>}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="request_type">Request Type *</Label>
                  <select
                    id="request_type"
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-[#08111d] px-3 text-slate-100"
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
                    placeholder="Reason for request"
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

        {requestsError && (
          <Card className="border-red-700/50 bg-red-950/20">
            <CardContent className="p-4 text-red-300">Unable to load your PTO requests: {requestsError.message}</CardContent>
          </Card>
        )}

        <Card className="border border-slate-800 bg-[#0d1725] text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800"><CardTitle className="text-white">Request History</CardTitle></CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {requests?.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-800 bg-[#101b29] p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-white">
                          {format(new Date(request.start_date), 'MMM d, yyyy')} - {format(new Date(request.end_date), 'MMM d, yyyy')}
                        </p>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="mb-2 text-sm text-slate-300">{request.reason}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>Type: <strong className={request.request_type === 'paid' ? 'text-green-600' : 'text-orange-600'}>{request.request_type === 'paid' ? 'PAID' : 'UNPAID'}</strong></span>
                        <span>Hours: <strong>{request.hours_requested || 0}h</strong></span>
                        {request.request_type === 'paid' && (
                          <span>Balance at request: <strong>{(request.pto_balance_at_request || 0).toFixed(1)}h</strong></span>
                        )}
                        {String(request.status || '').toLowerCase() === 'cancelled' && Number(request.hours_restored || 0) > 0 && (
                          <span className="font-semibold text-emerald-600">Hours returned: {Number(request.hours_restored).toFixed(1)}h</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {String(request.status || '').toLowerCase() === 'cancelled' && (
                    <div className="mt-3 rounded border border-emerald-700/40 bg-emerald-950/20 p-3">
                      <p className="text-sm font-semibold text-emerald-300">This request was cancelled by HR.</p>
                      <p className="mt-1 text-sm text-emerald-200">{Number(request.hours_restored || 0).toFixed(1)} hours were returned to your PTO balance.</p>
                    </div>
                  )}
                  {request.admin_notes && String(request.status || '').toLowerCase() !== 'cancelled' && (
                    <div className="mt-3 rounded-lg border border-slate-700 bg-[#08111d] p-3"><p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Admin Notes</p><p className="text-sm text-slate-300">{request.admin_notes}</p></div>
                  )}
                </div>
              ))}
              {!requests?.length && (
                <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/20 px-4 py-8 text-center text-slate-500">No requests yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}