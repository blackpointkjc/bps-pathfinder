import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Save, CheckCircle2, Clock3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function OfficerAvailability() {
  const queryClient = useQueryClient();
  const [availability, setAvailability] = useState({});

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: existingAvailability } = useQuery({
    queryKey: ['myAvailability', user?.email],
    queryFn: () => base44.entities.OfficerAvailability.filter({ officer_email: user?.email }),
    enabled: !!user?.email,
    onSuccess: (data) => {
      const mapped = {};
      data.forEach(entry => {
        mapped[entry.day_of_week] = {
          available: entry.available,
          preferred_start_time: entry.preferred_start_time || '18:00',
          preferred_end_time: entry.preferred_end_time || '06:00'
        };
      });
      setAvailability(mapped);
    }
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: ['myAvailabilityRequests', user?.email],
    queryFn: () => base44.entities.AvailabilityRequest.filter({ officer_email: user?.email }, '-requested_at', 20),
    enabled: !!user?.email,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const snapshot = DAYS.map(day => ({
        day_of_week: day,
        available: availability[day]?.available !== false,
        preferred_start_time: availability[day]?.preferred_start_time || '18:00',
        preferred_end_time: availability[day]?.preferred_end_time || '06:00'
      }));
      return base44.entities.AvailabilityRequest.create({
        officer_email: user.email,
        officer_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email,
        requested_at: new Date().toISOString(),
        status: 'pending',
        availability_snapshot: JSON.stringify(snapshot)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAvailabilityRequests'] });
      alert('Availability change submitted for admin approval. Your current approved availability remains in effect until it is approved.');
    }
  });

  const handleDayToggle = (day) => {
    setAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        available: !(prev[day]?.available !== false)
      }
    }));
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Availability</h1>
            <p className="text-slate-600">Set your weekly availability preferences</p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Weekly Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {DAYS.map(day => (
              <div key={day} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={availability[day]?.available !== false}
                    onCheckedChange={() => handleDayToggle(day)}
                  />
                  <Label className="capitalize font-medium cursor-pointer" onClick={() => handleDayToggle(day)}>
                    {day}
                  </Label>
                </div>
                {availability[day]?.available !== false && (
                  <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:w-auto">
                    <input
                      type="time"
                      value={availability[day]?.preferred_start_time || '18:00'}
                      onChange={(e) => setAvailability(prev => ({
                        ...prev,
                        [day]: { ...prev[day], preferred_start_time: e.target.value }
                      }))}
                      className="min-w-0 w-full p-2 border rounded"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={availability[day]?.preferred_end_time || '06:00'}
                      onChange={(e) => setAvailability(prev => ({
                        ...prev,
                        [day]: { ...prev[day], preferred_end_time: e.target.value }
                      }))}
                      className="min-w-0 w-full p-2 border rounded"
                    />
                  </div>
                )}
              </div>
            ))}

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Submitting...' : 'Submit Availability for Approval'}
            </Button>
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" />Recent Requests</div>
              {myRequests.length === 0 ? <p className="text-sm text-slate-500">No availability requests submitted yet.</p> : myRequests.slice(0,5).map(req => (
                <div key={req.id} className="flex items-center justify-between border-t py-2 text-sm first:border-t-0">
                  <span>{new Date(req.requested_at).toLocaleString()}</span>
                  <span className={`font-semibold ${req.status === 'approved' ? 'text-green-600' : req.status === 'denied' ? 'text-red-600' : 'text-amber-600'}`}>{String(req.status).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}