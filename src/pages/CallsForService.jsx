import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PullToRefresh from "../components/PullToRefresh";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, AlertTriangle, Radio, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CallsForService() {
  const [selectedCall, setSelectedCall] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: calls } = useQuery({
    queryKey: ['callsForService'],
    queryFn: () => base44.entities.CallForService.list('-call_time'),
    refetchInterval: 10000, // Refresh every 10 seconds
    initialData: [],
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-clock_in',
        100
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  const attachToCallMutation = useMutation({
    mutationFn: async ({ callId, status }) => {
      const call = calls.find(c => c.id === callId);
      const existingAttached = call.attached_officers || [];
      const newAttachment = {
        officer_email: user.email,
        unit_number: user.unit_number || 'N/A',
        rank: user.rank || 'Officer',
        last_name: user.last_name || user.email,
        status: status,
        attached_time: new Date().toISOString(),
      };
      const updatedAttached = [...existingAttached.filter(a => a.officer_email !== user.email), newAttachment];
      await base44.entities.CallForService.update(callId, {
        attached_officers: updatedAttached,
        acknowledged: true,
      });
    },
    onMutate: async ({ callId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['callsForService'] });
      const previous = queryClient.getQueryData(['callsForService']);
      queryClient.setQueryData(['callsForService'], (old) =>
        (old || []).map(c => {
          if (c.id !== callId) return c;
          const existingAttached = c.attached_officers || [];
          const newAttachment = {
            officer_email: user.email,
            unit_number: user.unit_number || 'N/A',
            rank: user.rank || 'Officer',
            last_name: user.last_name || user.email,
            status,
            attached_time: new Date().toISOString(),
          };
          return {
            ...c,
            acknowledged: true,
            attached_officers: [...existingAttached.filter(a => a.officer_email !== user.email), newAttachment],
          };
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['callsForService'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['callsForService'] });
    },
  });

  const createIncidentReportMutation = useMutation({
    mutationFn: async (call) => {
      // Navigate to incident reports page with pre-filled data via URL params
      const params = new URLSearchParams({
        from_call: 'true',
        call_id: call.id,
        call_number: call.call_number || '',
        location: call.affected_sites?.[0] || call.address,
        incident_type: call.incident_type?.toLowerCase().replace(/\s+/g, '_') || 'other',
        description: `Call for Service: ${call.incident_type || 'Unknown Incident'}\nLocation: ${call.address}\nDetails: ${call.details || 'See call notes'}`,
        incident_time: format(new Date(call.call_time), 'HH:mm'),
      });
      
      navigate(`${createPageUrl("IncidentReports")}?${params.toString()}`);
    },
  });

  const activeCalls = calls?.filter(c => !c.final_disposition) || [];
  const completedCalls = calls?.filter(c => c.final_disposition) || [];

  const myAttachedCalls = activeCalls.filter(call => 
    call.attached_officers?.some(a => a.officer_email === user?.email)
  );

  const nearbyActiveCalls = activeCalls.filter(call => {
    if (!activeEntry?.location) return false;
    const mySite = activeEntry.location.split(' - ')[0];
    return call.affected_sites?.includes(mySite);
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'responding': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'on_scene': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'call_cleared': return 'bg-green-100 text-green-800 border-green-300';
      case 'unfounded': return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'off_property': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['callsForService'] });
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <Radio className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Calls for Service</h1>
                <p className="text-slate-600">Active dispatch and incident tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-semibold text-slate-700">LIVE</span>
            </div>
          </div>
        </div>

        {!activeEntry && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <p className="text-amber-900 font-medium">You must be clocked in to respond to calls for service.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {myAttachedCalls.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Badge className="bg-blue-600 text-white">My Active Calls ({myAttachedCalls.length})</Badge>
            </h2>
            <div className="grid gap-4">
              {myAttachedCalls.map((call) => {
                const myStatus = call.attached_officers?.find(a => a.officer_email === user?.email);
                return (
                  <Card key={call.id} className="border-blue-300 bg-blue-50 shadow-lg">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            {call.incident_type || 'Unknown Incident'}
                          </CardTitle>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2 text-slate-700">
                              <Clock className="w-4 h-4" />
                              {format(new Date(call.call_time), 'MMM d, yyyy h:mm a')}
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                              <MapPin className="w-4 h-4" />
                              {call.address}
                            </div>
                          </div>
                        </div>
                        <Badge className={getStatusColor(myStatus?.status)}>
                          {myStatus?.status?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {call.details && (
                        <p className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                          {call.details}
                        </p>
                      )}
                      
                      <div className="flex gap-2 flex-wrap">
                        <Select
                          value={myStatus?.status || 'responding'}
                          onValueChange={(status) => attachToCallMutation.mutate({ callId: call.id, status })}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="responding">Responding</SelectItem>
                            <SelectItem value="on_scene">On Scene</SelectItem>
                            <SelectItem value="call_cleared">Call Cleared</SelectItem>
                            <SelectItem value="unfounded">Unfounded</SelectItem>
                            <SelectItem value="off_property">Off Property</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          onClick={() => createIncidentReportMutation.mutate(call)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Create Report Draft
                        </Button>
                      </div>

                      {call.attached_officers && call.attached_officers.length > 1 && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-semibold text-slate-600 mb-2">Other Units:</p>
                          <div className="flex flex-wrap gap-2">
                            {call.attached_officers
                              .filter(a => a.officer_email !== user?.email)
                              .map((officer, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {officer.rank} {officer.last_name} (Unit {officer.unit_number}) - {officer.status}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {nearbyActiveCalls.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Nearby Active Calls ({nearbyActiveCalls.length})
            </h2>
            <div className="grid gap-4">
              {nearbyActiveCalls.map((call) => {
                const isAttached = call.attached_officers?.some(a => a.officer_email === user?.email);
                if (isAttached) return null; // Already shown in "My Active Calls"
                
                return (
                  <Card key={call.id} className="shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-5 h-5 text-orange-600" />
                            {call.incident_type || 'Unknown Incident'}
                          </CardTitle>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2 text-slate-700">
                              <Clock className="w-4 h-4" />
                              {format(new Date(call.call_time), 'MMM d, yyyy h:mm a')}
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                              <MapPin className="w-4 h-4" />
                              {call.address}
                            </div>
                          </div>
                        </div>
                        {!call.acknowledged && (
                          <Badge className="bg-red-500 text-white animate-pulse">NEW</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {call.details && (
                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                          {call.details}
                        </p>
                      )}
                      
                      {activeEntry && (
                        <Button
                          onClick={() => attachToCallMutation.mutate({ callId: call.id, status: 'responding' })}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          disabled={attachToCallMutation.isPending}
                        >
                          <Radio className="w-4 h-4 mr-2" />
                          {attachToCallMutation.isPending ? 'Attaching...' : 'Respond to Call'}
                        </Button>
                      )}

                      {call.attached_officers?.length > 0 && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-semibold text-slate-600 mb-2">Units Attached:</p>
                          <div className="flex flex-wrap gap-2">
                            {call.attached_officers.map((officer, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {officer.rank} {officer.last_name} (Unit {officer.unit_number})
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {activeCalls.filter(c => 
          !nearbyActiveCalls.includes(c) && 
          !myAttachedCalls.includes(c)
        ).length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">All Active Calls</h2>
            <div className="grid gap-4">
              {activeCalls
                .filter(c => !nearbyActiveCalls.includes(c) && !myAttachedCalls.includes(c))
                .map((call) => (
                  <Card key={call.id} className="opacity-75">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {call.incident_type || 'Unknown'} - {call.address}
                      </CardTitle>
                      <p className="text-sm text-slate-600">
                        {format(new Date(call.call_time), 'h:mm a')}
                      </p>
                    </CardHeader>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {completedCalls.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Completed Calls (Last 24 Hours)</h2>
            <div className="grid gap-3">
              {completedCalls.slice(0, 5).map((call) => (
                <Card key={call.id} className="bg-slate-50 opacity-60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{call.incident_type}</p>
                        <p className="text-sm text-slate-600">{call.address}</p>
                      </div>
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        {call.final_disposition}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeCalls.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">All Clear</h3>
              <p className="text-slate-600">No active calls for service at this time</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}