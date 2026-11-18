import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, TrendingUp, TrendingDown, AlertCircle, Award, Clock, Calendar, Loader2, X } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function AIPerformanceAnalyzer({ allUsers, schedules, onClose }) {
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeOfficer = async () => {
    if (!selectedOfficer) return;
    
    setLoading(true);
    try {
      const officer = allUsers?.find(u => u.email === selectedOfficer);
      
      // Get historical data
      const [officerSchedules, timeEntries, performanceReviews, commendations, complaints, writeUps] = await Promise.all([
        base44.entities.Schedule.filter({ officer_email: selectedOfficer }),
        base44.entities.TimeEntry.filter({ officer_email: selectedOfficer }),
        base44.entities.PerformanceReview.filter({ officer_email: selectedOfficer }),
        base44.entities.Commendation.filter({ officer_email: selectedOfficer }),
        base44.entities.Complaint.filter({ officer_email: selectedOfficer }),
        base44.entities.WriteUpReport.filter({ officer_email: selectedOfficer })
      ]);

      // Calculate punctuality
      let onTimeCount = 0;
      let lateCount = 0;
      const lateInstances = [];

      timeEntries.forEach(entry => {
        if (!entry.clock_in || !entry.clock_out) return;
        
        const clockInDate = format(parseISO(entry.clock_in), 'yyyy-MM-dd');
        const matchingSchedule = officerSchedules.find(s => s.shift_date === clockInDate);
        
        if (matchingSchedule) {
          const scheduledStart = matchingSchedule.start_time;
          const actualClockIn = format(parseISO(entry.clock_in), 'HH:mm');
          
          const scheduledMinutes = parseInt(scheduledStart.split(':')[0]) * 60 + parseInt(scheduledStart.split(':')[1]);
          const actualMinutes = parseInt(actualClockIn.split(':')[0]) * 60 + parseInt(actualClockIn.split(':')[1]);
          const minutesLate = actualMinutes - scheduledMinutes;
          
          if (minutesLate <= 5) {
            onTimeCount++;
          } else {
            lateCount++;
            lateInstances.push({
              date: clockInDate,
              minutesLate,
              scheduled: scheduledStart,
              actual: actualClockIn
            });
          }
        }
      });

      const punctualityRate = onTimeCount + lateCount > 0 ? (onTimeCount / (onTimeCount + lateCount)) * 100 : 100;

      // Calculate reliability (shifts completed vs scheduled)
      const shiftsCompleted = timeEntries.filter(e => e.clock_out).length;
      const shiftsScheduled = officerSchedules.length;
      const reliabilityRate = shiftsScheduled > 0 ? (shiftsCompleted / shiftsScheduled) * 100 : 100;

      // Calculate total hours worked
      const totalHours = timeEntries.reduce((sum, e) => {
        if (!e.clock_in || !e.clock_out) return sum;
        return sum + (differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) / 60);
      }, 0);

      // Build context for AI
      const context = {
        officer_info: {
          name: `${officer.first_name} ${officer.last_name}`,
          rank: officer.rank,
          hire_date: officer.hire_date,
          email: selectedOfficer
        },
        metrics: {
          punctuality_rate: punctualityRate.toFixed(1),
          on_time_count: onTimeCount,
          late_count: lateCount,
          recent_late_instances: lateInstances.slice(0, 5),
          reliability_rate: reliabilityRate.toFixed(1),
          shifts_completed: shiftsCompleted,
          shifts_scheduled: shiftsScheduled,
          total_hours_worked: totalHours.toFixed(1),
          commendations_count: commendations.length,
          complaints_count: complaints.length,
          writeups_count: writeUps.filter(w => w.status === 'approved').length
        },
        performance_reviews: performanceReviews.map(r => ({
          date: r.review_date,
          overall_rating: r.overall_rating,
          strengths: r.strengths,
          areas_for_improvement: r.areas_for_improvement
        }))
      };

      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this officer's performance and provide actionable insights.

OFFICER DATA:
${JSON.stringify(context, null, 2)}

Provide:
1. Overall performance score (0-100)
2. Key strengths (max 5 bullet points)
3. Areas needing improvement (max 5 bullet points)
4. Specific recommendations for supervisor action
5. Training needs identification
6. Trend analysis (improving, stable, declining)

Be specific and actionable. Reference actual data points.`,
        response_json_schema: {
          type: "object",
          properties: {
            performance_score: { type: "number" },
            trend: { 
              type: "string",
              enum: ["improving", "stable", "declining"]
            },
            summary: { type: "string" },
            strengths: {
              type: "array",
              items: { type: "string" }
            },
            improvement_areas: {
              type: "array",
              items: { type: "string" }
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  priority: { type: "string" },
                  rationale: { type: "string" }
                }
              }
            },
            training_needs: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      });

      setAnalysis({
        ...aiResponse,
        rawMetrics: context.metrics
      });
    } catch (error) {
      console.error('Performance analysis error:', error);
      alert('Failed to analyze officer performance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const activeOfficers = allUsers?.filter(u => !u.termination_date && u.role !== 'admin' && !u.additional_roles?.includes('support_staff')) || [];

  return (
    <Card className="border-2 border-blue-300 shadow-xl bg-gradient-to-br from-blue-50 to-cyan-50">
      <CardHeader className="border-b border-blue-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            AI Performance Analyzer
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Officer</Label>
            <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an officer to analyze..." />
              </SelectTrigger>
              <SelectContent>
                {activeOfficers.map(officer => (
                  <SelectItem key={officer.email} value={officer.email}>
                    {officer.first_name && officer.last_name 
                      ? `${officer.first_name} ${officer.last_name} - ${officer.rank || 'Officer'}` 
                      : officer.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!analysis && !loading && selectedOfficer && (
            <Button
              onClick={analyzeOfficer}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze Performance
            </Button>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
              <p className="text-slate-700">Analyzing officer performance...</p>
            </div>
          )}

          {analysis && !loading && (
            <div className="space-y-6">
              {/* Performance Score */}
              <div className="text-center p-6 bg-white rounded-lg border-2 border-blue-200">
                <p className="text-sm text-slate-600 mb-2">Performance Score</p>
                <div className={`text-6xl font-bold ${
                  analysis.performance_score >= 80 ? 'text-green-600' :
                  analysis.performance_score >= 60 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {analysis.performance_score}
                  <span className="text-2xl">/100</span>
                </div>
                <Badge className={`mt-3 ${
                  analysis.trend === 'improving' ? 'bg-green-600' :
                  analysis.trend === 'declining' ? 'bg-red-600' :
                  'bg-slate-600'
                }`}>
                  {analysis.trend === 'improving' ? <TrendingUp className="w-4 h-4 mr-1" /> :
                   analysis.trend === 'declining' ? <TrendingDown className="w-4 h-4 mr-1" /> :
                   <AlertCircle className="w-4 h-4 mr-1" />}
                  {analysis.trend.charAt(0).toUpperCase() + analysis.trend.slice(1)}
                </Badge>
                <p className="text-sm text-slate-700 mt-3">{analysis.summary}</p>
              </div>

              {/* Raw Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-lg border">
                  <Clock className="w-5 h-5 text-blue-600 mb-1" />
                  <p className="text-xs text-slate-600">Punctuality</p>
                  <p className="text-2xl font-bold text-blue-900">{analysis.rawMetrics.punctuality_rate}%</p>
                  <p className="text-xs text-slate-500">{analysis.rawMetrics.on_time_count} on-time, {analysis.rawMetrics.late_count} late</p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <Calendar className="w-5 h-5 text-green-600 mb-1" />
                  <p className="text-xs text-slate-600">Reliability</p>
                  <p className="text-2xl font-bold text-green-900">{analysis.rawMetrics.reliability_rate}%</p>
                  <p className="text-xs text-slate-500">{analysis.rawMetrics.shifts_completed}/{analysis.rawMetrics.shifts_scheduled} shifts</p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <Award className="w-5 h-5 text-amber-600 mb-1" />
                  <p className="text-xs text-slate-600">Commendations</p>
                  <p className="text-2xl font-bold text-amber-900">{analysis.rawMetrics.commendations_count}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <AlertCircle className="w-5 h-5 text-red-600 mb-1" />
                  <p className="text-xs text-slate-600">Issues</p>
                  <p className="text-2xl font-bold text-red-900">{analysis.rawMetrics.complaints_count + analysis.rawMetrics.writeups_count}</p>
                </div>
              </div>

              {/* Strengths */}
              {analysis.strengths && analysis.strengths.length > 0 && (
                <div>
                  <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Strengths
                  </h3>
                  <div className="space-y-2">
                    {analysis.strengths.map((strength, idx) => (
                      <div key={idx} className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-900">✓ {strength}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvement Areas */}
              {analysis.improvement_areas && analysis.improvement_areas.length > 0 && (
                <div>
                  <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Areas for Improvement
                  </h3>
                  <div className="space-y-2">
                    {analysis.improvement_areas.map((area, idx) => (
                      <div key={idx} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-sm text-amber-900">• {area}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div>
                  <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Supervisor Recommendations
                  </h3>
                  <ScrollArea className="h-64 bg-white rounded-lg border border-indigo-200">
                    <div className="p-4 space-y-3">
                      {analysis.recommendations.map((rec, idx) => (
                        <div key={idx} className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                          <div className="flex items-start gap-2 mb-2">
                            <Badge className={
                              rec.priority === 'high' ? 'bg-red-600' :
                              rec.priority === 'medium' ? 'bg-amber-600' :
                              'bg-blue-600'
                            }>
                              {rec.priority} priority
                            </Badge>
                            <div className="flex-1">
                              <p className="font-semibold text-indigo-900">{rec.action}</p>
                              <p className="text-xs text-slate-600 mt-2 italic">{rec.rationale}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Training Needs */}
              {analysis.training_needs && analysis.training_needs.length > 0 && (
                <div>
                  <h3 className="font-bold text-purple-900 mb-3 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Training Recommendations
                  </h3>
                  <div className="space-y-2">
                    {analysis.training_needs.map((need, idx) => (
                      <div key={idx} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <p className="text-sm text-purple-900">📚 {need}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-blue-200">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAnalysis(null);
                    setSelectedOfficer("");
                  }}
                >
                  Analyze Another Officer
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}