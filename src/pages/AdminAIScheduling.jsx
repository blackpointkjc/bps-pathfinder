import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Sparkles, Loader2, CheckCircle, Shield, Clock } from "lucide-react";
import { format, parseISO, addDays, startOfWeek } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listDirectoryLocations, listOfficerDirectory } from '@/lib/appDirectory';

export default function AdminAIScheduling() {
  const [startDate, setStartDate] = useState(format(startOfWeek(addDays(new Date(), 7), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(parseISO(startDate || new Date()), 6), 'yyyy-MM-dd'));
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [generating, setGenerating] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['officerDirectory', 'adminAIScheduling'],
    queryFn: async () => {
      const users = await listOfficerDirectory('last_name', 1000, true);
      console.log('AI Scheduling - Fetched users:', users);
      return users;
    },
    enabled: user?.role === 'admin',
    staleTime: 0,
  });

  const [excludedOfficers, setExcludedOfficers] = useState([]);

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const all = await listDirectoryLocations();
      return all.filter(loc => loc.active);
    },
  });

  const { data: availability } = useQuery({
    queryKey: ['officerAvailability'],
    queryFn: () => base44.entities.OfficerAvailability.list(),
  });

  const { data: callOuts } = useQuery({
    queryKey: ['historicalCallOuts'],
    queryFn: () => base44.entities.CallOut.list('-created_date', 100),
  });

  const { data: timeOffRequests } = useQuery({
    queryKey: ['upcomingTimeOff'],
    queryFn: async () => {
      const all = await base44.entities.TimeOffRequest.list();
      return all.filter(r => r.status === 'approved');
    },
  });

  const generateSchedule = async () => {
    setGenerating(true);
    try {
      const activeOfficers = allUsers?.filter(u => 
        !u.termination_date && 
        u.role !== 'admin' &&
        !u.additional_roles?.includes('support_staff') &&
        !excludedOfficers.includes(u.email)
      ) || [];
      const locationsList = selectedLocation === 'all' 
        ? locations 
        : locations?.filter(l => l.id === selectedLocation);

      // Build officer assignments map (only for officers with complete names)
      const officerAssignments = activeOfficers.filter(o => o.first_name && o.last_name).map(o => {
        const assignedSites = [];
        
        // Check if officer has assigned_location (single location assignment)
        if (o.assigned_location) {
          assignedSites.push(o.assigned_location);
        }
        
        // Check if officer has assigned_locations array (multiple locations)
        if (o.assigned_locations && Array.isArray(o.assigned_locations)) {
          o.assigned_locations.forEach(loc => {
            if (!assignedSites.includes(loc)) {
              assignedSites.push(loc);
            }
          });
        }
        
        // Check if officer is a supervisor assigned to any locations
        locationsList?.forEach(loc => {
          if (loc.assigned_supervisors?.includes(o.email)) {
            if (!assignedSites.includes(loc.site_name)) {
              assignedSites.push(loc.site_name);
            }
          }
        });
        
        return {
          email: o.email,
          name: o.first_name + ' ' + o.last_name,
          rank: o.rank,
          division: o.division,
          assigned_sites: assignedSites.length > 0 ? assignedSites : null
        };
      });

      // Calculate actual number of days in the range
      const daysDiff = Math.ceil((parseISO(endDate) - parseISO(startDate)) / (1000 * 60 * 60 * 24)) + 1;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a scheduling AI for a security company. Generate optimal shift schedules.

DATE RANGE: ${format(parseISO(startDate), 'MMM d, yyyy')} to ${format(parseISO(endDate), 'MMM d, yyyy')} (${daysDiff} days)

LOCATIONS: ${JSON.stringify(locationsList?.map(l => ({
  site_name: l.site_name,
  coverage_days: l.coverage_days,
  min_officers: l.min_officers_per_shift,
  max_officers: l.max_officers_per_shift,
  shift_start: l.shift_start_time,
  shift_end: l.shift_end_time,
  shift_length: l.preferred_shift_length,
  assigned_supervisors: l.assigned_supervisors || []
})))}

AVAILABLE OFFICERS WITH SITE ASSIGNMENTS: ${JSON.stringify(officerAssignments)}

CRITICAL REQUIREMENTS:
1. SITE ASSIGNMENTS (MANDATORY): If an officer has "assigned_sites" array, they can ONLY work at those sites. Never assign them to other locations.
2. ROTATING WEEKEND COVERAGE: Ensure ALL weekends (Saturday & Sunday) have full coverage. Rotate officers so different people work each weekend.
3. TARGET 40 HOURS PER WEEK: Each officer should work approximately 40 hours per week. For multi-week schedules, distribute hours evenly across weeks.
4. FULL SITE COVERAGE: Every day must have minimum required officers based on location requirements.
5. RESPECT TIME OFF: ${JSON.stringify(timeOffRequests?.filter(r => {
  return r.start_date >= startDate && r.start_date <= endDate;
}).map(r => ({ officer: r.created_by, dates: r.start_date + ' to ' + r.end_date })))}

SCHEDULING LOGIC:
- For 8-hour shifts: Officers work 5 shifts per week (5 x 8 = 40 hours)
- For 10-hour shifts: Officers work 4 shifts per week (4 x 10 = 40 hours)
- For 12-hour shifts: Officers work 3-4 shifts per week (3 x 12 = 36, 4 x 12 = 48 hours)
- Ensure weekend shifts are distributed fairly - if Officer A works this weekend, Officer B works next weekend
- Generate shifts for EVERY SINGLE DAY in the date range
- Each location must have min_officers working every day

Generate complete week schedule with rotating weekend coverage and 40-hour workweeks.`,
        response_json_schema: {
          type: "object",
          properties: {
            schedule: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  officer_email: { type: "string" },
                  shift_date: { type: "string" },
                  start_time: { type: "string" },
                  end_time: { type: "string" },
                  location: { type: "string" },
                  confidence: { type: "number" },
                  notes: { type: "string" }
                }
              }
            },
            summary: { type: "string" },
            warnings: { 
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });

      setGeneratedSchedule(response);
    } catch (error) {
      console.error('Schedule generation error:', error);
      alert('Failed to generate schedule. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const approveScheduleMutation = useMutation({
    mutationFn: async () => {
      const shifts = generatedSchedule.schedule;
      await base44.entities.Schedule.bulkCreate(shifts.map(s => ({
        officer_email: s.officer_email,
        shift_date: s.shift_date,
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location,
        special_instructions: s.notes || 'AI Generated Schedule'
      })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setGeneratedSchedule(null);
      alert('✅ Schedule approved and created!');
    },
  });

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900">Admin Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2 mb-2">
            <Sparkles className="w-8 h-8 text-purple-600" />
            AI Schedule Generator
          </h1>
          <p className="text-slate-600">Generate optimal schedules using AI</p>
        </div>

        {!generatedSchedule ? (
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
              <CardTitle>Schedule Parameters</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locations?.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.site_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Exclude Officers (Optional)</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                  {allUsers?.filter(u => !u.termination_date && u.role !== 'admin' && !u.additional_roles?.includes('support_staff') && u.first_name && u.last_name).map(officer => {
                    const displayName = officer.first_name && officer.last_name 
                      ? `${officer.first_name} ${officer.last_name}` 
                      : officer.email;
                    const isPending = !officer.first_name || !officer.last_name;
                    
                    return (
                      <label key={officer.email} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 px-2 rounded">
                        <input
                          type="checkbox"
                          checked={excludedOfficers.includes(officer.email)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExcludedOfficers([...excludedOfficers, officer.email]);
                            } else {
                              setExcludedOfficers(excludedOfficers.filter(email => email !== officer.email));
                            }
                          }}
                          className="rounded"
                        />
                        <span className={`text-sm ${isPending ? 'text-amber-600' : ''}`}>
                          {displayName}
                          {isPending && <span className="ml-2 text-xs">(Pending Setup)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <Button
                onClick={generateSchedule}
                disabled={generating}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Schedule...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate AI Schedule
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="border-none shadow-lg bg-gradient-to-r from-green-50 to-emerald-50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-green-900 mb-2">Schedule Generated Successfully</h3>
                    <p className="text-green-700">{generatedSchedule.summary}</p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
                {generatedSchedule.warnings && generatedSchedule.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 rounded border border-amber-200">
                    <p className="font-semibold text-amber-900 mb-2">⚠️ Warnings:</p>
                    <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                      {generatedSchedule.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>Generated Shifts ({generatedSchedule.schedule.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {generatedSchedule.schedule.map((shift, idx) => {
                    const officer = allUsers?.find(u => u.email === shift.officer_email);
                    return (
                      <div key={idx} className="p-4 bg-slate-50 rounded-lg border">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="font-semibold text-slate-900">
                                {officer ? `${officer.first_name} ${officer.last_name}` : shift.officer_email}
                              </p>
                              {shift.confidence && (
                                <Badge variant="outline" className={
                                  shift.confidence >= 0.8 ? 'bg-green-50 text-green-700' :
                                  shift.confidence >= 0.6 ? 'bg-amber-50 text-amber-700' :
                                  'bg-red-50 text-red-700'
                                }>
                                  {Math.round(shift.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                {format(parseISO(shift.shift_date), 'MMM d, yyyy')}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-500" />
                                {shift.start_time} - {shift.end_time}
                              </div>
                              <div className="col-span-2 text-slate-600">
                                📍 {shift.location}
                              </div>
                            </div>
                            {shift.notes && (
                              <p className="text-xs text-slate-500 mt-2 italic">{shift.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setGeneratedSchedule(null)}
              >
                Discard
              </Button>
              <Button
                onClick={() => approveScheduleMutation.mutate()}
                disabled={approveScheduleMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {approveScheduleMutation.isPending ? 'Creating...' : 'Approve & Create Schedule'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}