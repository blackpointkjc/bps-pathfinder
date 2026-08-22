import { confirmInApp } from '@/lib/inAppDialog';
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCheck, Plus, Shield, Star, User, Award, AlertTriangle, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCurrentDirectoryUser, listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { calculatePunctuality } from '@/lib/performanceScoring';

export default function AdminPerformanceReviews() {
  const [showForm, setShowForm] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [formData, setFormData] = useState({
    review_period_start: "",
    review_period_end: "",
    punctuality_rating: 3,
    professionalism_rating: 3,
    report_quality_rating: 3,
    teamwork_rating: 3,
    initiative_rating: 3,
    overall_rating: 3,
    strengths: "",
    areas_for_improvement: "",
    goals_for_next_period: "",
    reviewer_comments: "",
    pay_effective_date: "",
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const hasHRAccess = user?.role === 'admin' || user?.additional_roles?.includes('hr') || user?.additional_roles?.includes('full_access') || String(user?.rank || '').toLowerCase() === 'human resources';

  const { data: directoryUsers = [], error: usersError } = useQuery({
    queryKey: ['directoryUsers', 'performanceReviews'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: hasHRAccess,
    retry: 2,
    staleTime: 0,
    initialData: [],
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const allUsers = directoryUsers.filter(isOperationalOfficer);

  const { data: allReviews } = useQuery({
    queryKey: ['allPerformanceReviews'],
    queryFn: () => base44.entities.PerformanceReview.list('-review_date'),
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['hrTimeEntries', 'performanceReviews', selectedOfficer],
    queryFn: async () => {
      const result = await base44.functions.invoke('manageHRTimeEntries', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return (payload.entries || []).filter(entry => !selectedOfficer || entry.officer_email === selectedOfficer);
    },
    enabled: hasHRAccess && !!selectedOfficer,
    initialData: [],
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const { data: schedules } = useQuery({
    queryKey: ['allSchedules'],
    queryFn: () => base44.entities.Schedule.list(),
    enabled: !!selectedOfficer,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const { data: incidentReports = [] } = useQuery({
    queryKey: ['allIncidentReports', 'performanceReviews'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date'),
    enabled: hasHRAccess && !!selectedOfficer,
    refetchOnWindowFocus: 'always',
  });

  const { data: commendations } = useQuery({
    queryKey: ['officerCommendations', selectedOfficer],
    queryFn: () => base44.entities.Commendation.filter({ officer_email: selectedOfficer }),
    enabled: !!selectedOfficer,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const { data: complaints } = useQuery({
    queryKey: ['officerComplaints', selectedOfficer],
    queryFn: async () => {
      const all = await base44.entities.Complaint.filter({ officer_email: selectedOfficer });
      return all.filter(c => !c.exclude_from_performance_review);
    },
    enabled: !!selectedOfficer,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const { data: inspectionReports } = useQuery({
    queryKey: ['officerInspections', selectedOfficer],
    queryFn: async () => {
      const all = await base44.entities.InspectionReport.list();
      return all.filter(i => i.officer_email === selectedOfficer && !i.exclude_from_performance_review);
    },
    enabled: !!selectedOfficer,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const { data: writeUpReports } = useQuery({
    queryKey: ['officerWriteUps', selectedOfficer],
    queryFn: async () => {
      const all = await base44.entities.WriteUpReport.list();
      return all.filter(w => w.officer_email === selectedOfficer && w.status === 'approved' && !w.exclude_from_performance_review);
    },
    enabled: !!selectedOfficer,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });

  const getPayRangeForRank = (rank) => {
    const payRanges = {
      'Unarmed Officer': { min: 18.00, max: 20.00 },
      'Officer': { min: 19.50, max: 21.50 },
      'Senior officer': { min: 20.50, max: 22.50 },
      'Corporal': { min: 21.00, max: 23.00 },
      'Sergeant': { min: 22.00, max: 24.00 },
      'First Sergeant': { min: 23.00, max: 25.00 },
      'Lieutenant': { min: 24.00, max: 26.00 },
      'Captain': { min: 25.00, max: 27.00 },
      'Lt Colonel (Director of Security Operations)': { min: 27.50, max: 27.50 },
      'Colonel (Director of Company Operations)': { min: 27.50, max: 27.50 },
      'Major (Director of Field Operations)': { min: 27.50, max: 27.50 },
    };
    return payRanges[rank] || { min: 18.00, max: 20.00 };
  };

  const calculateSuggestedPay = (overallRating, currentRate, rank) => {
    const payRange = getPayRangeForRank(rank);
    const midpoint = (payRange.min + payRange.max) / 2;
    
    if (overallRating >= 5) {
      // Excellent: Move toward max or give raise
      return Math.min(currentRate * 1.05, payRange.max);
    } else if (overallRating >= 4) {
      // Good: Move toward midpoint-high
      return Math.min(currentRate * 1.03, (midpoint + payRange.max) / 2);
    } else if (overallRating >= 3) {
      // Satisfactory: Small raise
      return Math.min(currentRate * 1.02, midpoint);
    } else {
      // Needs improvement: No change
      return currentRate;
    }
  };

  const createReviewMutation = useMutation({
    mutationFn: async (data) => {
      const officer = allUsers?.find(u => u.email === selectedOfficer);
      const officerName = officer ? `${officer.first_name} ${officer.last_name}` : selectedOfficer;

      // Calculate metrics for the review period
      const periodStart = parseISO(data.review_period_start + 'T00:00:00');
      const periodEnd = parseISO(data.review_period_end + 'T23:59:59');

      const periodCommendations = commendations?.filter(c => {
        const cDate = parseISO(c.commendation_date);
        return cDate >= periodStart && cDate <= periodEnd;
      }) || [];

      const periodComplaints = complaints?.filter(c => {
        const cDate = parseISO(c.complaint_date);
        return cDate >= periodStart && cDate <= periodEnd;
      }) || [];

      const periodEntries = timeEntries?.filter(e => {
        if (!e.clock_in) return false;
        const clockIn = parseISO(e.clock_in);
        return clockIn >= periodStart && clockIn <= periodEnd && e.clock_out;
      }) || [];

      const totalHours = periodEntries.reduce((sum, e) => {
        const clockIn = parseISO(e.clock_in);
        const clockOut = parseISO(e.clock_out);
        return sum + (differenceInMinutes(clockOut, clockIn) / 60);
      }, 0);

      const periodSchedules = (schedules || []).filter(s => s.officer_email === selectedOfficer && s.shift_date >= data.review_period_start && s.shift_date <= data.review_period_end);
      const punctuality = calculatePunctuality(periodEntries, periodSchedules, data.review_period_start, data.review_period_end, incidentReports, officer);
      const onTimePercentage = punctuality.rate;

      const periodInspections = inspectionReports?.filter(i => {
        const iDate = parseISO(i.inspection_date);
        return iDate >= periodStart && iDate <= periodEnd;
      }) || [];

      const periodWriteUps = writeUpReports?.filter(w => {
        const wDate = parseISO(w.created_date);
        return wDate >= periodStart && wDate <= periodEnd;
      }) || [];

      const currentRate = officer?.hourly_rate || 0;
      const suggestedRate = calculateSuggestedPay(data.overall_rating, currentRate, officer?.rank);
      const payRange = getPayRangeForRank(officer?.rank);

      const newReview = await base44.entities.PerformanceReview.create({
        ...data,
        officer_email: selectedOfficer,
        officer_name: officerName,
        review_date: new Date().toISOString(),
        reviewer_email: user.email,
        reviewer_name: `${user.first_name} ${user.last_name}`,
        commendations_count: periodCommendations.length,
        complaints_count: periodComplaints.length,
        inspections_count: periodInspections.length,
        writeups_count: periodWriteUps.length,
        hours_worked: Math.round(totalHours * 10) / 10,
        on_time_percentage: onTimePercentage,
        current_hourly_rate: currentRate,
        suggested_hourly_rate: Math.round(suggestedRate * 100) / 100,
        pay_range_min: payRange.min,
        pay_range_max: payRange.max,
        supervisor_review_pending: true,
      });

      // Notify all supervisors to review this with the officer
      const supervisors = allUsers?.filter(u => u.additional_roles?.includes('supervisor')) || [];
      for (const supervisor of supervisors) {
        await base44.entities.Notification.create({
          recipient_email: supervisor.email,
          type: 'training_reminder',
          title: '📋 Performance Review - Supervisor Action Required',
          message: `Review performance with ${officerName} and have them sign acknowledgment`,
          priority: 'high',
          action_link: '/SupervisorPerformanceReview',
        });
      }

      await base44.integrations.Core.SendEmail({
        to: selectedOfficer,
        subject: `Performance Review - ${format(periodStart, 'MMM yyyy')}`,
        body: `Your performance review for the period ${format(periodStart, 'MMMM d')} - ${format(periodEnd, 'MMMM d, yyyy')} is now available.

Overall Rating: ${data.overall_rating}/5 stars

Please log in to Black Point Portal to view the complete review and acknowledge receipt.

Reviewed by: ${user.first_name} ${user.last_name}
Review Date: ${format(new Date(), 'MMMM d, yyyy')}`
      });

      await base44.entities.Notification.create({
        recipient_email: selectedOfficer,
        type: 'training_reminder',
        title: '📋 Performance Review Available',
        message: `Your performance review for ${format(periodStart, 'MMM yyyy')} is ready for your review`,
        priority: 'high',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allPerformanceReviews'] });
      setShowForm(false);
      setSelectedOfficer("");
      setFormData({
        review_period_start: "",
        review_period_end: "",
        punctuality_rating: 3,
        professionalism_rating: 3,
        report_quality_rating: 3,
        teamwork_rating: 3,
        initiative_rating: 3,
        overall_rating: 3,
        strengths: "",
        areas_for_improvement: "",
        goals_for_next_period: "",
        reviewer_comments: "",
        pay_effective_date: "",
      });
      alert('Performance review created and sent to officer!');
    },
  });

  const activeOfficers = React.useMemo(() => {
    const filtered = allUsers?.filter(u => !u.termination_date && u.role !== 'admin') || [];
    console.log('All users in performance review:', allUsers);
    console.log('Active officers after filter:', filtered);
    return filtered;
  }, [allUsers]);

  if (!hasHRAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900">HR Access Required</h2>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-8 h-8 text-purple-600" />
              Performance Reviews
            </h1>
            <p className="text-slate-600">Conduct and manage officer performance reviews</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Review
          </Button>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>All Performance Reviews ({allReviews?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {allReviews && allReviews.length > 0 ? (
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {allReviews.map((review) => (
                    <div key={review.id} className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="w-4 h-4 text-slate-600" />
                            <p className="font-bold text-slate-900">{review.officer_name}</p>
                            <Badge variant="outline">
                              {format(parseISO(review.review_period_start), 'MMM d')} - {format(parseISO(review.review_period_end), 'MMM d, yyyy')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-4 h-4 ${star <= review.overall_rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                                />
                              ))}
                            </div>
                            <span className="text-sm text-slate-600">Overall: {review.overall_rating}/5</span>
                          </div>
                          <div className="flex gap-2 text-xs text-slate-600 mb-2">
                            <span>By: {review.reviewer_name}</span>
                            <span>•</span>
                            <span>{format(parseISO(review.review_date), 'MMM d, yyyy')}</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                            {review.commendations_count > 0 && (
                              <Badge className="bg-green-600 text-white">
                                <Award className="w-3 h-3 mr-1" />
                                {review.commendations_count} Commendations
                              </Badge>
                            )}
                            {review.complaints_count > 0 && (
                              <Badge className="bg-red-600 text-white">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {review.complaints_count} Complaints
                              </Badge>
                            )}
                            {review.hours_worked && (
                              <Badge variant="outline">
                                {review.hours_worked}h worked
                              </Badge>
                            )}
                            {review.on_time_percentage && (
                              <Badge variant="outline">
                                {review.on_time_percentage}% on-time
                              </Badge>
                            )}
                          </div>
                          {review.current_hourly_rate && (
                            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                              <p className="text-xs font-semibold text-blue-900 mb-2">💰 Pay Recommendation:</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-slate-600">Current Rate:</span>
                                  <span className="font-bold ml-2">${review.current_hourly_rate.toFixed(2)}/hr</span>
                                </div>
                                <div>
                                  <span className="text-slate-600">Suggested Rate:</span>
                                  <span className="font-bold ml-2 text-green-700">${review.suggested_hourly_rate.toFixed(2)}/hr</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-slate-600">Pay Range for Rank:</span>
                                  <span className="font-medium ml-2">${review.pay_range_min.toFixed(2)} - ${review.pay_range_max.toFixed(2)}/hr</span>
                                </div>
                              </div>
                              {!review.pay_adjustment_approved && review.suggested_hourly_rate > review.current_hourly_rate && (
                                <div className="mt-3 pt-3 border-t border-blue-300">
                                  {review.pay_effective_date && (
                                    <p className="text-xs text-blue-700 mb-2">
                                      Effective Date: {format(parseISO(review.pay_effective_date), 'MMM d, yyyy')}
                                    </p>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      const effectiveMsg = review.pay_effective_date 
                                        ? ` effective ${format(parseISO(review.pay_effective_date), 'MMM d, yyyy')}` 
                                        : ' effective immediately';
                                      if (await confirmInApp(`Approve pay adjustment from $${review.current_hourly_rate.toFixed(2)}/hr to $${review.suggested_hourly_rate.toFixed(2)}/hr for ${review.officer_name}${effectiveMsg}?`)) {
                                        await base44.entities.PerformanceReview.update(review.id, {
                                          pay_adjustment_approved: true,
                                          pay_adjustment_approved_by: user.email,
                                          pay_adjustment_date: new Date().toISOString(),
                                        });
                                        await base44.entities.User.update(
                                          allUsers.find(u => u.email === review.officer_email).id,
                                          { hourly_rate: review.suggested_hourly_rate }
                                        );
                                        queryClient.invalidateQueries({ queryKey: ['allPerformanceReviews'] });
                                        queryClient.invalidateQueries({ queryKey: ['allUsers'] });
                                        alert('✅ Pay adjustment approved and applied!');
                                      }
                                    }}
                                    className="bg-green-600 hover:bg-green-700 w-full"
                                  >
                                    Approve Pay Adjustment (+${(review.suggested_hourly_rate - review.current_hourly_rate).toFixed(2)}/hr)
                                    {review.pay_effective_date && ` - ${format(parseISO(review.pay_effective_date), 'MMM d')}`}
                                  </Button>
                                </div>
                              )}
                              {review.pay_adjustment_approved && (
                                <div className="mt-3 pt-3 border-t border-blue-300">
                                  <Badge className="bg-green-600 text-white w-full justify-center py-2">
                                    ✓ Pay Adjusted on {format(parseISO(review.pay_adjustment_date), 'MMM d, yyyy')}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          )}
                          {review.strengths && (
                            <div className="mb-2 p-2 bg-green-50 rounded border border-green-200">
                              <p className="text-xs font-semibold text-green-700">Strengths:</p>
                              <p className="text-sm text-slate-700">{review.strengths}</p>
                            </div>
                          )}
                          {review.areas_for_improvement && (
                            <div className="mb-2 p-2 bg-amber-50 rounded border border-amber-200">
                              <p className="text-xs font-semibold text-amber-700">Areas for Improvement:</p>
                              <p className="text-sm text-slate-700">{review.areas_for_improvement}</p>
                            </div>
                          )}
                          {!review.officer_acknowledged && (
                            <Badge className="bg-amber-600 text-white mt-2">Pending Officer Acknowledgment</Badge>
                          )}
                          {review.officer_acknowledged && (
                            <Badge className="bg-green-600 text-white mt-2">Acknowledged {format(parseISO(review.acknowledged_date), 'MMM d, yyyy')}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <ClipboardCheck className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p>No performance reviews yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Performance Review</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createReviewMutation.mutate(formData); }} className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Select Officer *</Label>
                <Select
                  value={selectedOfficer}
                  onValueChange={(value) => {
                    setSelectedOfficer(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select officer to review..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeOfficers.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">No active officers found</div>
                    ) : (
                      activeOfficers.map((officer) => {
                        const displayName = officer?.first_name && officer?.last_name 
                          ? `${officer.first_name} ${officer.last_name}` 
                          : officer?.full_name || officer?.email || 'Unknown';
                        const isPending = !officer?.first_name || !officer?.last_name;

                        return (
                          <SelectItem key={officer.email} value={officer.email}>
                            {displayName} - {officer?.rank || 'Officer'}
                            {isPending && <span className="ml-2 text-xs text-amber-600">(Pending Setup)</span>}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedOfficer && (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Review Period Start *</Label>
                      <Input
                        type="date"
                        value={formData.review_period_start}
                        onChange={(e) => setFormData({ ...formData, review_period_start: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Review Period End *</Label>
                      <Input
                        type="date"
                        value={formData.review_period_end}
                        onChange={(e) => setFormData({ ...formData, review_period_end: e.target.value })}
                      />
                    </div>
                  </div>

                  {formData.review_period_start && formData.review_period_end && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm font-semibold text-blue-900 mb-2">Review Period Metrics:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <Award className="w-5 h-5 text-green-600 mb-1" />
                          <p className="text-2xl font-bold text-green-600">{commendations?.filter(c => {
                            const cDate = parseISO(c.commendation_date);
                            return cDate >= parseISO(formData.review_period_start) && cDate <= parseISO(formData.review_period_end);
                          }).length || 0}</p>
                          <p className="text-xs text-slate-600">Commendations</p>
                        </div>
                        <div>
                          <AlertTriangle className="w-5 h-5 text-red-600 mb-1" />
                          <p className="text-2xl font-bold text-red-600">{complaints?.filter(c => {
                            const cDate = parseISO(c.complaint_date);
                            return cDate >= parseISO(formData.review_period_start) && cDate <= parseISO(formData.review_period_end);
                          }).length || 0}</p>
                          <p className="text-xs text-slate-600">Complaints</p>
                        </div>
                        <div>
                          <FileText className="w-5 h-5 text-purple-600 mb-1" />
                          <p className="text-2xl font-bold text-purple-600">{inspectionReports?.filter(i => {
                            const iDate = parseISO(i.inspection_date);
                            return iDate >= parseISO(formData.review_period_start) && iDate <= parseISO(formData.review_period_end);
                          }).length || 0}</p>
                          <p className="text-xs text-slate-600">Inspections</p>
                        </div>
                        <div>
                          <AlertTriangle className="w-5 h-5 text-orange-600 mb-1" />
                          <p className="text-2xl font-bold text-orange-600">{writeUpReports?.filter(w => {
                            const wDate = parseISO(w.created_date);
                            return wDate >= parseISO(formData.review_period_start) && wDate <= parseISO(formData.review_period_end);
                          }).length || 0}</p>
                          <p className="text-xs text-slate-600">Write-Ups</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Performance Ratings (1-5)</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        { key: 'punctuality_rating', label: 'Punctuality' },
                        { key: 'professionalism_rating', label: 'Professionalism' },
                        { key: 'report_quality_rating', label: 'Report Quality' },
                        { key: 'teamwork_rating', label: 'Teamwork' },
                        { key: 'initiative_rating', label: 'Initiative' },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-2">
                          <Label>{label}</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max="5"
                              value={formData[key]}
                              onChange={(e) => setFormData({ ...formData, [key]: parseInt(e.target.value) })}
                              className="w-20"
                            />
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-5 h-5 cursor-pointer ${star <= formData[key] ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                                  onClick={() => setFormData({ ...formData, [key]: star })}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Overall Rating *</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        value={formData.overall_rating}
                        onChange={(e) => setFormData({ ...formData, overall_rating: parseInt(e.target.value) })}
                        className="w-20"
                      />
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-6 h-6 cursor-pointer ${star <= formData.overall_rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                            onClick={() => setFormData({ ...formData, overall_rating: star })}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Strengths</Label>
                    <Textarea
                      value={formData.strengths}
                      onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                      placeholder="What are this officer's key strengths?"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Areas for Improvement</Label>
                    <Textarea
                      value={formData.areas_for_improvement}
                      onChange={(e) => setFormData({ ...formData, areas_for_improvement: e.target.value })}
                      placeholder="What areas need development?"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Goals for Next Period</Label>
                    <Textarea
                      value={formData.goals_for_next_period}
                      onChange={(e) => setFormData({ ...formData, goals_for_next_period: e.target.value })}
                      placeholder="Set goals and objectives for next review period..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Additional Comments</Label>
                    <Textarea
                      value={formData.reviewer_comments}
                      onChange={(e) => setFormData({ ...formData, reviewer_comments: e.target.value })}
                      placeholder="Any additional comments or observations..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Pay Adjustment Effective Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.pay_effective_date}
                      onChange={(e) => setFormData({ ...formData, pay_effective_date: e.target.value })}
                    />
                    <p className="text-xs text-slate-500">If pay adjustment is approved, it will take effect on this date</p>
                  </div>
                </>
              )}

              <div className="flex gap-3 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setSelectedOfficer(""); }}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createReviewMutation.isPending || !selectedOfficer || !formData.review_period_start || !formData.review_period_end}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {createReviewMutation.isPending ? 'Creating...' : 'Create Review'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}