import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Users, MapPin, Bell, Loader2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function AIOpenShiftManager({ 
  schedules, 
  allUsers, 
  locations,
  onClose 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const queryClient = useQueryClient();

  const analyzeOpenShifts = async () => {
    setLoading(true);
    try {
      const openShifts = schedules?.filter(s => s.is_open) || [];
      
      if (openShifts.length === 0) {
        alert('No open shifts found');
        setLoading(false);
        return;
      }

      // Get officer availability and current hours
      const [availability, timeOffRequests] = await Promise.all([
        base44.entities.OfficerAvailability.list(),
        base44.entities.TimeOffRequest.list()
      ]);

      const activeOfficers = allUsers?.filter(u => 
        !u.termination_date && 
        u.role !== 'admin' &&
        !u.additional_roles?.includes('support_staff')
      ) || [];

      // Calculate current hours for each officer
      const officerHours = {};
      schedules?.forEach(s => {
        if (s.officer_email !== 'OPEN' && !s.is_open) {
          if (!officerHours[s.officer_email]) officerHours[s.officer_email] = 0;
          const startMinutes = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
          const endMinutes = parseInt(s.end_time.split(':')[0]) * 60 + parseInt(s.end_time.split(':')[1]);
          const hours = endMinutes > startMinutes ? (endMinutes - startMinutes) / 60 : (1440 - startMinutes + endMinutes) / 60;
          officerHours[s.officer_email] += hours;
        }
      });

      const approvedTimeOff = timeOffRequests.filter(r => r.status === 'approved');

      // Build context for each open shift
      const shiftMatches = await Promise.all(openShifts.map(async (shift) => {
        const location = locations?.find(l => shift.location.includes(l.site_name));
        const shiftDate = parseISO(shift.shift_date);
        const dayOfWeek = format(shiftDate, 'EEEE');

        const eligibleOfficers = activeOfficers
          .filter(o => {
            // Check time off
            const hasTimeOff = approvedTimeOff.some(r => 
              o.email === r.created_by &&
              shift.shift_date >= r.start_date &&
              shift.shift_date <= r.end_date
            );
            if (hasTimeOff) return false;

            // Check site assignments
            if (o.assigned_sites && o.assigned_sites.length > 0) {
              if (!o.assigned_sites.includes(location?.site_name)) return false;
            }

            // Check max hours
            const currentHours = officerHours[o.email] || 0;
            const maxHours = availability.find(a => a.officer_email === o.email)?.max_hours_per_week || 40;
            const shiftHours = parseInt(shift.end_time.split(':')[0]) - parseInt(shift.start_time.split(':')[0]);
            if (currentHours + shiftHours > maxHours) return false;

            return true;
          })
          .map(o => ({
            email: o.email,
            name: `${o.first_name || ''} ${o.last_name || ''}`.trim() || o.email,
            rank: o.rank,
            current_hours: officerHours[o.email] || 0,
            assigned_sites: o.assigned_sites || []
          }));

        return {
          shift,
          eligible: eligibleOfficers
        };
      }));

      // Get AI recommendations
      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze these open shifts and recommend the best officers to fill them.

OPEN SHIFTS:
${JSON.stringify(shiftMatches.map(m => ({
  date: m.shift.shift_date,
  time: `${m.shift.start_time}-${m.shift.end_time}`,
  location: m.shift.location.split(':')[0],
  eligible_officers: m.eligible.map(o => ({
    name: o.name,
    email: o.email,
    rank: o.rank,
    current_hours: o.current_hours
  }))
})), null, 2)}

For each shift, provide:
1. Top 3 recommended officers (with emails)
2. Match score (0-100) for each recommendation
3. Reasoning for each recommendation
4. Difficulty level (easy/moderate/hard to fill)

Consider:
- Fair distribution of hours
- Officer rank and experience
- Site assignments
- Current workload balance`,
        response_json_schema: {
          type: "object",
          properties: {
            shift_recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  shift_date: { type: "string" },
                  shift_time: { type: "string" },
                  location: { type: "string" },
                  difficulty: { 
                    type: "string",
                    enum: ["easy", "moderate", "hard"]
                  },
                  top_matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        officer_email: { type: "string" },
                        officer_name: { type: "string" },
                        match_score: { type: "number" },
                        reasoning: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      setAnalysis(aiResponse);
    } catch (error) {
      console.error('Open shift analysis error:', error);
      alert('Failed to analyze open shifts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const notifyOfficers = async (shiftRec) => {
    setNotifying(true);
    try {
      const promises = shiftRec.top_matches.slice(0, 3).map(async (match) => {
        await base44.entities.Notification.create({
          recipient_email: match.officer_email,
          type: 'shift_available',
          title: `🔓 Open Shift Available - ${shiftRec.location}`,
          message: `An open shift on ${format(parseISO(shiftRec.shift_date), 'MMM d, yyyy')} (${shiftRec.shift_time}) at ${shiftRec.location} is available. You're a top match! Visit Open Shifts to claim it.`,
          priority: shiftRec.difficulty === 'hard' ? 'high' : 'normal',
          action_link: '/OpenShifts'
        });
      });

      await Promise.all(promises);
      
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      alert(`✅ Notified ${shiftRec.top_matches.slice(0, 3).length} officers about this shift`);
    } catch (error) {
      console.error('Notification error:', error);
      alert('Failed to send notifications');
    } finally {
      setNotifying(false);
    }
  };

  const openShifts = schedules?.filter(s => s.is_open) || [];

  return (
    <Card className="border-2 border-cyan-300 shadow-xl bg-gradient-to-br from-cyan-50 to-blue-50">
      <CardHeader className="border-b border-cyan-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-cyan-900">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            AI Open Shift Manager
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {!analysis && !loading && (
          <div className="text-center py-8">
            <Users className="w-16 h-16 mx-auto mb-4 text-cyan-400" />
            <p className="text-slate-700 mb-2">
              {openShifts.length} open shift{openShifts.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-sm text-slate-600 mb-4">
              AI will analyze and recommend the best officers for each shift
            </p>
            <Button
              onClick={analyzeOpenShifts}
              disabled={openShifts.length === 0}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Find Best Matches
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-cyan-600 animate-spin" />
            <p className="text-slate-700">Finding best officer matches...</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-lg border-2 border-cyan-200">
              <p className="text-center text-slate-700">
                <span className="text-2xl font-bold text-cyan-900">{analysis.shift_recommendations?.length || 0}</span>
                <span className="text-sm ml-2">open shifts analyzed</span>
              </p>
            </div>

            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {analysis.shift_recommendations?.map((shiftRec, idx) => (
                  <div key={idx} className="p-4 bg-white rounded-lg border-2 border-cyan-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-cyan-600" />
                          <p className="font-bold text-slate-900">{shiftRec.location}</p>
                          <Badge className={
                            shiftRec.difficulty === 'easy' ? 'bg-green-600' :
                            shiftRec.difficulty === 'moderate' ? 'bg-amber-600' :
                            'bg-red-600'
                          }>
                            {shiftRec.difficulty} to fill
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span>📅 {format(parseISO(shiftRec.shift_date), 'MMM d, yyyy (EEE)')}</span>
                          <span>🕐 {shiftRec.shift_time}</span>
                        </div>
                      </div>
                      <Button
                        onClick={() => notifyOfficers(shiftRec)}
                        disabled={notifying}
                        size="sm"
                        className="bg-cyan-600 hover:bg-cyan-700"
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Notify Top Matches
                      </Button>
                    </div>

                    <div className="space-y-2 mt-4">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Recommended Officers:</p>
                      {shiftRec.top_matches?.map((match, matchIdx) => (
                        <div key={matchIdx} className="p-3 bg-gradient-to-r from-cyan-50 to-blue-50 rounded border border-cyan-200">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{match.officer_name}</p>
                              <p className="text-xs text-slate-600">{match.officer_email}</p>
                            </div>
                            <div className="text-center">
                              <div className={`text-2xl font-bold ${
                                match.match_score >= 80 ? 'text-green-600' :
                                match.match_score >= 60 ? 'text-amber-600' :
                                'text-red-600'
                              }`}>
                                {match.match_score}
                              </div>
                              <p className="text-xs text-slate-500">match</p>
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 italic">{match.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-3 justify-end pt-4 border-t border-cyan-200">
              <Button
                variant="outline"
                onClick={() => setAnalysis(null)}
              >
                Run New Analysis
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}