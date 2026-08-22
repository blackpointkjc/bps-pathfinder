import { confirmInApp } from '@/lib/inAppDialog';
import React, { useEffect, useMemo, useState } from "react";
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
import { format, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCurrentDirectoryUser, listOfficerDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { toast } from 'sonner';

const ratingFields = [
  { key: 'punctuality_rating', label: 'Punctuality' },
  { key: 'professionalism_rating', label: 'Professionalism' },
  { key: 'uniform_appearance_rating', label: 'Uniform & Appearance' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'initiative_rating', label: 'Initiative' },
  { key: 'overall_rating', label: 'Overall Rating' },
];

const workflowLabel = (review) => {
  const stage = review.workflow_stage || (review.hr_approved ? 'approved' : review.officer_acknowledged ? 'hr_approval_pending' : review.supervisor_review_completed ? 'officer_pending' : 'supervisor_pending');
  if (stage === 'higher_reviewer_required') return { stage, label: 'Higher-Ranking Reviewer Required', className: 'bg-red-800 text-white' };
  if (stage === 'officer_pending') return { stage, label: 'Officer Response', className: 'bg-amber-600 text-white' };
  if (stage === 'hr_approval_pending') return { stage, label: 'HR Approval Required', className: 'bg-red-700 text-white' };
  if (stage === 'approved') return { stage, label: 'Approved', className: 'bg-green-700 text-white' };
  return { stage, label: 'Supervisor Rating', className: 'bg-purple-700 text-white' };
};

export default function AdminPerformanceReviews() {
  const [showForm, setShowForm] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState("");
  const [finalizingReview, setFinalizingReview] = useState(null);
  const [finalRatings, setFinalRatings] = useState({
    punctuality_rating: 3,
    professionalism_rating: 3,
    uniform_appearance_rating: 3,
    communication_rating: 3,
    initiative_rating: 3,
    overall_rating: 3,
  });
  const [approvalNotes, setApprovalNotes] = useState("");
  const [formData, setFormData] = useState({
    review_period_start: "",
    review_period_end: "",
    punctuality_rating: 3,
    professionalism_rating: 3,
    uniform_appearance_rating: 3,
    communication_rating: 3,
    initiative_rating: 3,
    overall_rating: 3,
    strengths: "",
    areas_for_improvement: "",
    goals: "",
    supervisor_notes: "",
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

  const { data: allReviews = [] } = useQuery({
    queryKey: ['allPerformanceReviews'],
    queryFn: async () => {
      const result = await base44.functions.invoke('managePerformanceReviews', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.reviews || [];
    },
    enabled: hasHRAccess,
  });

  const selectedOfficerRecord = useMemo(
    () => allUsers.find(officer => String(officer.email || '').toLowerCase() === String(selectedOfficer || '').toLowerCase()) || null,
    [allUsers, selectedOfficer]
  );

  const { data: reviewPreview, isFetching: previewLoading, error: previewError } = useQuery({
    queryKey: ['performanceReviewPreview', selectedOfficerRecord?.id, formData.review_period_start, formData.review_period_end],
    queryFn: async () => {
      const result = await base44.functions.invoke('managePerformanceReviews', {
        action: 'preview',
        officer_id: selectedOfficerRecord.id,
        officer_email: selectedOfficerRecord.email,
        review_period_start: formData.review_period_start,
        review_period_end: formData.review_period_end,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.metrics;
    },
    enabled: hasHRAccess && !!selectedOfficerRecord?.id && !!formData.review_period_start && !!formData.review_period_end && formData.review_period_start <= formData.review_period_end,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (!reviewPreview?.suggested_ratings) return;
    setFormData(current => ({
      ...current,
      ...reviewPreview.suggested_ratings,
    }));
  }, [reviewPreview]);

  const createReviewMutation = useMutation({
    mutationFn: async (data) => {
      if (!selectedOfficerRecord?.id) throw new Error('Select an active officer.');
      const result = await base44.functions.invoke('managePerformanceReviews', {
        action: 'create',
        officer_id: selectedOfficerRecord.id,
        officer_email: selectedOfficerRecord.email,
        review_period_start: data.review_period_start,
        review_period_end: data.review_period_end,
        review: data,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
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
        uniform_appearance_rating: 3,
        communication_rating: 3,
        initiative_rating: 3,
        overall_rating: 3,
        strengths: "",
        areas_for_improvement: "",
        goals: "",
        supervisor_notes: "",
        pay_effective_date: "",
      });
      toast.success('Review started and assigned to the next supervisor in the rotation.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to create performance review.'),
  });

  const activeOfficers = useMemo(
    () => (allUsers || []).filter(officer => officer.employment_status !== 'terminated' && !officer.termination_date),
    [allUsers]
  );

  const approveReviewMutation = useMutation({
    mutationFn: async () => {
      if (!finalizingReview?.id) throw new Error('Select a review to approve.');
      const result = await base44.functions.invoke('managePerformanceReviews', {
        action: 'approve',
        review_id: finalizingReview.id,
        ratings: finalRatings,
        hr_approval_notes: approvalNotes,
      });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allPerformanceReviews'] });
      setFinalizingReview(null);
      setApprovalNotes('');
      toast.success('HR approved the review and published the final rating.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to approve this performance review.'),
  });

  const openFinalApproval = (review) => {
    setFinalizingReview(review);
    setFinalRatings(Object.fromEntries(ratingFields.map(({ key }) => [key, Number(review[key]) || 3])));
    setApprovalNotes(review.hr_approval_notes || '');
  };

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
            <p className="text-slate-600">Start manual reviews, track annual reviews, and publish final ratings after supervisor and officer responses</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Start Manual Review
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
                            <Badge className={workflowLabel(review).className}>{workflowLabel(review).label}</Badge>
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
                          <div className="flex flex-wrap gap-2 text-xs text-slate-600 mb-2">
                            <span>Started by: {review.reviewer_name || 'Automated annual review'}</span>
                            <span>•</span>
                            <span>Assigned supervisor: {review.assigned_supervisor_name || 'Pending'}</span>
                            <span>•</span>
                            <span>{format(parseISO(review.review_date), 'MMM d, yyyy')}</span>
                          </div>
                          {workflowLabel(review).stage === 'higher_reviewer_required' && (
                            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
                              {review.assignment_issue || 'This review cannot be assigned until an active reviewer with a higher operational rank is available.'}
                              <div className="mt-1 text-xs font-normal">It has not been sent to any equal- or lower-ranked supervisor.</div>
                            </div>
                          )}
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
                                        toast.success('Pay adjustment approved and applied.');
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
                          {workflowLabel(review).stage === 'hr_approval_pending' && (
                            <Button onClick={() => openFinalApproval(review)} className="mt-3 bg-red-700 hover:bg-red-800">
                              Review Officer Response & Final Approve
                            </Button>
                          )}
                          {workflowLabel(review).stage === 'approved' && (
                            <Badge className="mt-2 bg-green-700 text-white">Final rating: {review.final_rating ?? review.overall_rating}/5</Badge>
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

        <Dialog open={!!finalizingReview} onOpenChange={(open) => { if (!open) setFinalizingReview(null); }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>HR Final Approval — {finalizingReview?.officer_name}</DialogTitle>
            </DialogHeader>
            {finalizingReview && <div className="space-y-5 py-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-900">Completed cycle received by HR</p>
                <p className="mt-1 text-sm text-blue-800">The assigned supervisor submitted ratings, and the officer submitted self-ratings, comments, and an electronic signature. HR may update the final ratings below before approval.</p>
              </div>

              <div className="space-y-3">
                {ratingFields.map(({ key, label }) => (
                  <div key={key} className="grid items-center gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]">
                    <div>
                      <p className={key === 'overall_rating' ? 'font-bold' : 'font-medium'}>{label}</p>
                      <p className="text-xs text-slate-500">
                        Supervisor: {finalizingReview[key] ?? '—'}/5 · Officer self-rating: {finalizingReview[`officer_${key}`] ?? '—'}/5
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={finalRatings[key]}
                      onChange={(event) => setFinalRatings(current => ({ ...current, [key]: Number(event.target.value) }))}
                      className="w-20"
                      aria-label={`Final ${label}`}
                    />
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFinalRatings(current => ({ ...current, [key]: star }))}
                          className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          aria-label={`Set final ${label} to ${star}`}
                        >
                          <Star className={`h-5 w-5 ${star <= Number(finalRatings[key]) ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {finalizingReview.officer_comments && <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold">Officer comments</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{finalizingReview.officer_comments}</p>
              </div>}
              {finalizingReview.officer_signature_url && <div className="rounded-lg border p-4">
                <p className="mb-2 font-semibold">Officer electronic signature</p>
                <img src={finalizingReview.officer_signature_url} alt="Officer signature" className="max-h-24 rounded bg-white p-2" />
                <p className="mt-2 text-xs text-slate-500">{finalizingReview.officer_signed_at ? new Date(finalizingReview.officer_signed_at).toLocaleString() : ''}</p>
              </div>}

              <div className="space-y-2">
                <Label>HR Approval Notes</Label>
                <Textarea value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} placeholder="Final HR notes (optional)" rows={4}/>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setFinalizingReview(null)}>Cancel</Button>
                <Button
                  onClick={() => approveReviewMutation.mutate()}
                  disabled={approveReviewMutation.isPending || Object.values(finalRatings).some(value => Number(value) < 1 || Number(value) > 5)}
                  className="bg-green-700 hover:bg-green-800"
                >
                  {approveReviewMutation.isPending ? 'Approving…' : 'Approve & Publish Final Rating'}
                </Button>
              </div>
            </div>}
          </DialogContent>
        </Dialog>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Start Manual Performance Review</DialogTitle>
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
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-blue-900">Objective Statistics for Selected Dates</p>
                        {previewLoading && <Badge variant="outline">Calculating…</Badge>}
                        {reviewPreview?.performance_score != null && <Badge className="bg-blue-700 text-white">{reviewPreview.performance_score}% performance score</Badge>}
                      </div>
                      {previewError ? (
                        <p className="text-sm text-red-700">{previewError.message}</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div><Award className="mb-1 h-5 w-5 text-green-600"/><p className="text-2xl font-bold text-green-600">{reviewPreview?.commendations_count ?? '—'}</p><p className="text-xs text-slate-600">Commendations</p></div>
                          <div><AlertTriangle className="mb-1 h-5 w-5 text-red-600"/><p className="text-2xl font-bold text-red-600">{reviewPreview?.complaints_count ?? '—'}</p><p className="text-xs text-slate-600">Complaints</p></div>
                          <div><FileText className="mb-1 h-5 w-5 text-purple-600"/><p className="text-2xl font-bold text-purple-600">{reviewPreview?.inspections_count ?? '—'}</p><p className="text-xs text-slate-600">Inspections</p></div>
                          <div><AlertTriangle className="mb-1 h-5 w-5 text-orange-600"/><p className="text-2xl font-bold text-orange-600">{reviewPreview?.writeups_count ?? '—'}</p><p className="text-xs text-slate-600">Approved Write-Ups</p></div>
                          <div><p className="text-2xl font-bold text-cyan-700">{reviewPreview?.hours_worked ?? '—'}</p><p className="text-xs text-slate-600">Hours Worked</p></div>
                          <div><p className="text-2xl font-bold text-cyan-700">{reviewPreview?.on_time_percentage == null ? '—' : `${reviewPreview.on_time_percentage}%`}</p><p className="text-xs text-slate-600">On-Time Shifts</p></div>
                          <div><p className="text-2xl font-bold text-emerald-700">{reviewPreview?.punctuality?.on_time ?? '—'}</p><p className="text-xs text-slate-600">Compliant Shifts</p></div>
                          <div><p className="text-2xl font-bold text-rose-700">{reviewPreview?.punctuality?.violations ?? '—'}</p><p className="text-xs text-slate-600">Time Violations</p></div>
                        </div>
                      )}
                      <p className="mt-3 text-xs text-blue-800">These are objective starting values. The assigned supervisor submits the official supervisor ratings, the officer submits a self-rating, and HR publishes the final rating.</p>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">Objective Starting Ratings (1-5)</h3>
                    <p className="mb-3 text-sm text-slate-500">These values help the assigned supervisor begin the evaluation; they are not final.</p>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        { key: 'punctuality_rating', label: 'Punctuality' },
                        { key: 'professionalism_rating', label: 'Professionalism' },
                        { key: 'uniform_appearance_rating', label: 'Uniform & Appearance' },
                        { key: 'communication_rating', label: 'Communication' },
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
                      value={formData.goals}
                      onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                      placeholder="Set goals and objectives for next review period..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Additional Comments</Label>
                    <Textarea
                      value={formData.supervisor_notes}
                      onChange={(e) => setFormData({ ...formData, supervisor_notes: e.target.value })}
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
                  {createReviewMutation.isPending ? 'Starting...' : 'Start & Assign Supervisor'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}