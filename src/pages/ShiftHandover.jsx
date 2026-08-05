import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRightLeft, AlertTriangle, CheckCircle, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ShiftHandover() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    shift_date: format(new Date(), 'yyyy-MM-dd'),
    location: "",
    shift_start: "",
    shift_end: "",
    key_updates: "",
    ongoing_issues: "",
    pending_tasks: "",
    equipment_status: "",
    incident_count: 0,
    visitor_count: 0,
    patrol_count: 0,
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activeEntry } = useQuery({
    queryKey: ['activeTimeEntry', user?.email],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.filter(
        { officer_email: user.email },
        '-created_date',
        10
      );
      return entries.find(e => !e.clock_out) || null;
    },
    enabled: !!user?.email,
  });

  const { data: handovers } = useQuery({
    queryKey: ['shiftHandovers'],
    queryFn: () => base44.entities.ShiftHandover.list('-created_date', 20),
  });

  const { data: myHandovers } = useQuery({
    queryKey: ['myIncomingHandovers', user?.email],
    queryFn: async () => {
      const all = await base44.entities.ShiftHandover.filter(
        { incoming_officer_email: user.email },
        '-created_date',
        10
      );
      return all.filter(h => !h.acknowledged_by_incoming);
    },
    enabled: !!user?.email,
  });

  const createHandoverMutation = useMutation({
    mutationFn: async (data) => {
      const aiAnalysis = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this shift handover and provide a concise summary with urgent flags.

SHIFT DETAILS:
Location: ${data.location}
Date: ${data.shift_date}
Shift: ${data.shift_start} - ${data.shift_end}

KEY UPDATES: ${data.key_updates}
ONGOING ISSUES: ${data.ongoing_issues}
PENDING TASKS: ${data.pending_tasks}
EQUIPMENT STATUS: ${data.equipment_status}

Statistics:
- Incidents: ${data.incident_count}
- Visitors: ${data.visitor_count}
- Patrols: ${data.patrol_count}

Provide:
1. A brief 2-3 sentence summary
2. List any urgent items that need immediate attention (return empty array if none)`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            urgent_flags: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });

      return base44.entities.ShiftHandover.create({
        ...data,
        departing_officer_email: user.email,
        departing_officer_name: `${user.first_name} ${user.last_name}`,
        ai_summary: aiAnalysis.summary,
        urgent_flags: aiAnalysis.urgent_flags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftHandovers'] });
      setShowForm(false);
      setFormData({
        shift_date: format(new Date(), 'yyyy-MM-dd'),
        location: "",
        shift_start: "",
        shift_end: "",
        key_updates: "",
        ongoing_issues: "",
        pending_tasks: "",
        equipment_status: "",
        incident_count: 0,
        visitor_count: 0,
        patrol_count: 0,
      });
    },
  });

  const acknowledgeHandoverMutation = useMutation({
    mutationFn: (handoverId) => 
      base44.entities.ShiftHandover.update(handoverId, {
        acknowledged_by_incoming: true,
        acknowledgement_time: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myIncomingHandovers'] });
      queryClient.invalidateQueries({ queryKey: ['shiftHandovers'] });
    },
  });

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ArrowRightLeft className="w-8 h-8 text-blue-600" />
              Shift Handover
            </h1>
            <p className="text-slate-600">Transfer shift information to incoming officers</p>
          </div>
          {activeEntry && (
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Handover
            </Button>
          )}
        </div>

        {myHandovers && myHandovers.length > 0 && (
          <Card className="border-2 border-amber-300 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-5 h-5" />
                Pending Handovers for You ({myHandovers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myHandovers.map((handover) => (
                <div key={handover.id} className="p-4 bg-white rounded-lg border-2 border-amber-200">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-slate-900">{handover.location}</p>
                      <p className="text-sm text-slate-600">
                        From: {handover.departing_officer_name} | {format(new Date(handover.shift_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => acknowledgeHandoverMutation.mutate(handover.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Acknowledge
                    </Button>
                  </div>

                  {handover.urgent_flags && handover.urgent_flags.length > 0 && (
                    <div className="mb-3 p-3 bg-red-50 rounded border border-red-200">
                      <p className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        URGENT ITEMS:
                      </p>
                      <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                        {handover.urgent_flags.map((flag, i) => (
                          <li key={i}>{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-3 bg-blue-50 rounded border border-blue-200 mb-3">
                    <p className="font-semibold text-blue-900 mb-1">AI Summary:</p>
                    <p className="text-sm text-blue-800">{handover.ai_summary}</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <p className="font-semibold text-slate-700">Incidents:</p>
                      <p>{handover.incident_count || 0}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">Visitors:</p>
                      <p>{handover.visitor_count || 0}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">Patrols:</p>
                      <p>{handover.patrol_count || 0}</p>
                    </div>
                  </div>

                  {handover.key_updates && (
                    <div className="mb-2">
                      <p className="font-semibold text-slate-700 text-sm">Key Updates:</p>
                      <p className="text-sm text-slate-600">{handover.key_updates}</p>
                    </div>
                  )}

                  {handover.ongoing_issues && (
                    <div className="mb-2">
                      <p className="font-semibold text-slate-700 text-sm">Ongoing Issues:</p>
                      <p className="text-sm text-slate-600">{handover.ongoing_issues}</p>
                    </div>
                  )}

                  {handover.pending_tasks && (
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">Pending Tasks:</p>
                      <p className="text-sm text-slate-600">{handover.pending_tasks}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {showForm && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle>Create Shift Handover</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={(e) => { e.preventDefault(); createHandoverMutation.mutate(formData); }} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      placeholder="Site location"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift Date *</Label>
                    <Input
                      type="date"
                      value={formData.shift_date}
                      onChange={(e) => setFormData({...formData, shift_date: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shift Start</Label>
                    <Input
                      type="time"
                      value={formData.shift_start}
                      onChange={(e) => setFormData({...formData, shift_start: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift End</Label>
                    <Input
                      type="time"
                      value={formData.shift_end}
                      onChange={(e) => setFormData({...formData, shift_end: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Key Updates *</Label>
                  <Textarea
                    value={formData.key_updates}
                    onChange={(e) => setFormData({...formData, key_updates: e.target.value})}
                    placeholder="Important updates from your shift..."
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ongoing Issues</Label>
                  <Textarea
                    value={formData.ongoing_issues}
                    onChange={(e) => setFormData({...formData, ongoing_issues: e.target.value})}
                    placeholder="Issues that need continued attention..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pending Tasks</Label>
                  <Textarea
                    value={formData.pending_tasks}
                    onChange={(e) => setFormData({...formData, pending_tasks: e.target.value})}
                    placeholder="Tasks for the incoming officer..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Equipment Status</Label>
                  <Textarea
                    value={formData.equipment_status}
                    onChange={(e) => setFormData({...formData, equipment_status: e.target.value})}
                    placeholder="Status of radios, keys, vehicles, etc..."
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Incidents</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.incident_count}
                      onChange={(e) => setFormData({...formData, incident_count: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Visitors</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.visitor_count}
                      onChange={(e) => setFormData({...formData, visitor_count: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Patrols</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.patrol_count}
                      onChange={(e) => setFormData({...formData, patrol_count: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createHandoverMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {createHandoverMutation.isPending ? 'Creating...' : 'Create Handover'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Recent Handovers</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {handovers?.map((handover) => (
                  <div key={handover.id} className="p-4 bg-slate-50 rounded-lg border">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-slate-900">{handover.location}</p>
                        <p className="text-sm text-slate-600">
                          {handover.departing_officer_name} → {handover.incoming_officer_name || 'Next Officer'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(handover.shift_date), 'MMM d, yyyy')} | {handover.shift_start} - {handover.shift_end}
                        </p>
                      </div>
                      {handover.acknowledged_by_incoming ? (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Acknowledged
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-600 text-white">Pending</Badge>
                      )}
                    </div>
                    {handover.ai_summary && (
                      <p className="text-sm text-slate-600 mt-2">{handover.ai_summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}