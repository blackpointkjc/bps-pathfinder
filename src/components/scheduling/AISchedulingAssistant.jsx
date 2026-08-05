import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, AlertTriangle, CheckCircle, TrendingUp, Users, MapPin, Loader2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO } from "date-fns";

export default function AISchedulingAssistant({ 
  schedules, 
  allUsers, 
  locations, 
  weekStart, 
  weekEnd,
  calculateShiftHours,
  onClose 
}) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeSchedule = async () => {
    setLoading(true);
    try {
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // Filter schedules for this period
      const periodSchedules = schedules?.filter(s => 
        s.shift_date >= weekStartStr && s.shift_date <= weekEndStr
      ) || [];

      // Get officer availability
      const availability = await base44.entities.OfficerAvailability.list();
      
      // Get time off requests
      const timeOffRequests = await base44.entities.TimeOffRequest.list();
      const approvedTimeOff = timeOffRequests.filter(r => 
        r.status === 'approved' &&
        r.start_date <= weekEndStr &&
        r.end_date >= weekStartStr
      );

      // Build context for AI
      const activeOfficers = allUsers?.filter(u => !u.termination_date && u.role !== 'admin' && !u.additional_roles?.includes('support_staff')) || [];
      
      const officerContext = activeOfficers.map(o => {
        const officerSchedules = periodSchedules.filter(s => s.officer_email === o.email);
        const totalHours = officerSchedules.reduce((sum, s) => sum + calculateShiftHours(s.start_time, s.end_time), 0);
        const officerAvail = availability.filter(a => a.officer_email === o.email);
        
        return {
          name: `${o.first_name || ''} ${o.last_name || ''}`.trim() || o.email,
          email: o.email,
          rank: o.rank,
          assigned_sites: o.assigned_sites || [],
          current_hours: totalHours,
          max_hours: officerAvail[0]?.max_hours_per_week || 40,
          availability: officerAvail.map(a => ({
            day: a.day_of_week,
            available: a.available,
            preferred_times: `${a.preferred_start_time || ''}-${a.preferred_end_time || ''}`
          }))
        };
      });

      const locationContext = locations?.map(loc => {
        const locationSchedules = periodSchedules.filter(s => s.location.includes(loc.site_name));
        const totalHours = locationSchedules.reduce((sum, s) => sum + calculateShiftHours(s.start_time, s.end_time), 0);
        const officersAssigned = new Set(locationSchedules.map(s => s.officer_email)).size;
        
        return {
          site_name: loc.site_name,
          coverage_days: loc.coverage_days || 7,
          min_officers: loc.min_officers_per_shift || 1,
          max_officers: loc.max_officers_per_shift || 2,
          current_hours: totalHours,
          max_hours: loc.max_hours_per_week,
          officers_assigned: officersAssigned,
          required_hours: (loc.preferred_shift_length || 8) * loc.coverage_days
        };
      }) || [];

      // Check for conflicts
      const conflicts = [];
      const openShifts = periodSchedules.filter(s => s.is_open);
      const difficultShifts = [];

      // Detect double bookings
      periodSchedules.forEach((s1, i) => {
        periodSchedules.slice(i + 1).forEach(s2 => {
          if (s1.officer_email === s2.officer_email && s1.officer_email !== 'OPEN' && s1.shift_date === s2.shift_date) {
            const start1 = parseInt(s1.start_time.replace(':', ''));
            const end1 = parseInt(s1.end_time.replace(':', ''));
            const start2 = parseInt(s2.start_time.replace(':', ''));
            const end2 = parseInt(s2.end_time.replace(':', ''));
            
            if ((start1 < end2 && start2 < end1) || (end1 <= start1 || end2 <= start2)) {
              conflicts.push({
                type: 'double_booking',
                officer: `${allUsers?.find(u => u.email === s1.officer_email)?.first_name || ''} ${allUsers?.find(u => u.email === s1.officer_email)?.last_name || ''}`.trim(),
                date: s1.shift_date,
                shifts: [s1, s2]
              });
            }
          }
        });
      });

      // Identify difficult to fill shifts (open for >7 days or overnight)
      openShifts.forEach(shift => {
        const isOvernight = parseInt(shift.end_time.replace(':', '')) < parseInt(shift.start_time.replace(':', ''));
        if (isOvernight || shift.is_open) {
          difficultShifts.push({
            date: shift.shift_date,
            time: `${shift.start_time}-${shift.end_time}`,
            location: shift.location.split(':')[0],
            reason: isOvernight ? 'Overnight shift' : 'Open for extended period'
          });
        }
      });

      // Call AI for analysis
      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an AI scheduling assistant for a security company. Analyze this schedule and provide insights.

PERIOD: ${format(weekStart, 'MMM d, yyyy')} to ${format(weekEnd, 'MMM d, yyyy')}

OFFICERS:
${JSON.stringify(officerContext, null, 2)}

LOCATIONS:
${JSON.stringify(locationContext, null, 2)}

CONFLICTS DETECTED:
${JSON.stringify(conflicts, null, 2)}

OPEN/DIFFICULT SHIFTS:
${JSON.stringify(difficultShifts, null, 2)}

TIME OFF REQUESTS:
${JSON.stringify(approvedTimeOff.map(r => ({
  officer: r.created_by,
  dates: `${r.start_date} to ${r.end_date}`
})), null, 2)}

Provide:
1. Overall schedule health score (0-100)
2. Key issues identified (max 5)
3. Achievements/positive highlights (max 3)
4. Specific recommendations for improvements with officer emails
5. Hard-to-fill shift solutions with specific officer suggestions
6. Coverage gaps at locations

Return structured JSON with actionable insights.`,
        response_json_schema: {
          type: "object",
          properties: {
            health_score: { type: "number" },
            summary: { type: "string" },
            critical_issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  severity: { type: "string" },
                  affected: { type: "string" }
                }
              }
            },
            achievements: {
              type: "array",
              items: { type: "string" }
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  officer_email: { type: "string" },
                  shift_details: { type: "string" },
                  reasoning: { type: "string" }
                }
              }
            },
            coverage_gaps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  issue: { type: "string" },
                  suggested_officers: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          }
        }
      });

      setAnalysis(aiResponse);
    } catch (error) {
      console.error('AI analysis error:', error);
      alert('Failed to analyze schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-purple-300 shadow-xl bg-gradient-to-br from-purple-50 to-indigo-50">
      <CardHeader className="border-b border-purple-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            AI Scheduling Assistant
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
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-purple-400" />
            <p className="text-slate-700 mb-4">
              Let AI analyze your schedule for conflicts, optimization opportunities, and hard-to-fill shifts
            </p>
            <Button
              onClick={analyzeSchedule}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Schedule
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-purple-600 animate-spin" />
            <p className="text-slate-700">AI is analyzing your schedule...</p>
            <p className="text-sm text-slate-500 mt-2">This may take a moment</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-6">
            {/* Health Score */}
            <div className="text-center p-6 bg-white rounded-lg border-2 border-purple-200">
              <p className="text-sm text-slate-600 mb-2">Schedule Health Score</p>
              <div className="relative">
                <div className={`text-6xl font-bold ${
                  analysis.health_score >= 80 ? 'text-green-600' :
                  analysis.health_score >= 60 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {analysis.health_score}
                  <span className="text-2xl">/100</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-3">{analysis.summary}</p>
            </div>

            {/* Critical Issues */}
            {analysis.critical_issues && analysis.critical_issues.length > 0 && (
              <div>
                <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Critical Issues ({analysis.critical_issues.length})
                </h3>
                <ScrollArea className="h-64 bg-white rounded-lg border border-red-200">
                  <div className="p-4 space-y-3">
                    {analysis.critical_issues.map((issue, idx) => (
                      <Alert key={idx} variant="destructive">
                        <AlertDescription>
                          <div className="flex items-start gap-2 mb-2">
                            <Badge className={
                              issue.severity === 'critical' ? 'bg-red-600' :
                              issue.severity === 'high' ? 'bg-orange-600' :
                              'bg-amber-600'
                            }>
                              {issue.severity}
                            </Badge>
                            <strong className="flex-1">{issue.title}</strong>
                          </div>
                          <p className="text-sm mb-1">{issue.description}</p>
                          <p className="text-xs text-slate-600">Affected: {issue.affected}</p>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Achievements */}
            {analysis.achievements && analysis.achievements.length > 0 && (
              <div>
                <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Highlights ({analysis.achievements.length})
                </h3>
                <div className="space-y-2">
                  {analysis.achievements.map((achievement, idx) => (
                    <div key={idx} className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-900">✓ {achievement}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div>
                <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  AI Recommendations ({analysis.recommendations.length})
                </h3>
                <ScrollArea className="h-80 bg-white rounded-lg border border-indigo-200">
                  <div className="p-4 space-y-3">
                    {analysis.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                        <div className="flex items-start gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-indigo-600 mt-1" />
                          <div className="flex-1">
                            <p className="font-semibold text-indigo-900">{rec.action}</p>
                            {rec.officer_email && (
                              <div className="mt-2 flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-600" />
                                <span className="text-sm text-indigo-700">
                                  {allUsers?.find(u => u.email === rec.officer_email)?.first_name} {allUsers?.find(u => u.email === rec.officer_email)?.last_name}
                                </span>
                              </div>
                            )}
                            {rec.shift_details && (
                              <p className="text-sm text-slate-700 mt-1">{rec.shift_details}</p>
                            )}
                            <p className="text-xs text-slate-600 mt-2 italic">{rec.reasoning}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Coverage Gaps */}
            {analysis.coverage_gaps && analysis.coverage_gaps.length > 0 && (
              <div>
                <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Coverage Gaps ({analysis.coverage_gaps.length})
                </h3>
                <div className="space-y-3">
                  {analysis.coverage_gaps.map((gap, idx) => (
                    <div key={idx} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-amber-600 mt-1" />
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900">{gap.location}</p>
                          <p className="text-sm text-slate-700 mt-1">{gap.issue}</p>
                          {gap.suggested_officers && gap.suggested_officers.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-amber-800 mb-1">Suggested Officers:</p>
                              <div className="flex flex-wrap gap-2">
                                {gap.suggested_officers.map((email, i) => {
                                  const officer = allUsers?.find(u => u.email === email);
                                  return (
                                    <Badge key={i} variant="outline" className="bg-white">
                                      {officer ? `${officer.first_name} ${officer.last_name}` : email}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4 border-t border-purple-200">
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