import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Printer, Star, CheckCircle, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function SupervisorPerformanceReview() {
  const [selectedReview, setSelectedReview] = useState(null);
  const [supervisorNotes, setSupervisorNotes] = useState("");
  const [supervisorRatings, setSupervisorRatings] = useState({
    punctuality_rating: 3,
    professionalism_rating: 3,
    uniform_appearance_rating: 3,
    communication_rating: 3,
    initiative_rating: 3,
    overall_rating: 3,
  });
  
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentDirectoryUser(),
  });

  const { data: scopedTasks = {} } = useQuery({
    queryKey: ['supervisorScopedTasks', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSupervisorScopedTasks', {});
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user && (user?.role === 'admin' || user?.additional_roles?.includes('supervisor') || user?.additional_roles?.includes('full_access')),
    refetchInterval: 60000,
  });

  const assignedPeople = scopedTasks.assignedPeople || [];
  const pendingReviews = scopedTasks.reviews || [];
  const awaitingOfficerReviews = scopedTasks.reviewFollowUps || [];

  useEffect(() => {
    if (!selectedReview?.id) return;
    const latest = pendingReviews.find(review => review.id === selectedReview.id);
    if (latest) setSelectedReview(latest);
  }, [pendingReviews, selectedReview?.id]);

  const completeReviewMutation = useMutation({
    mutationFn: async (reviewId) => {
      const response = await base44.functions.invoke('completeSupervisorPerformanceReview', {
        reviewId,
        ratings: supervisorRatings,
        supervisorNotes,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisorScopedTasks'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPerformanceReviews'] });
      setSelectedReview(null);
      setSupervisorNotes("");
      toast.success('Supervisor ratings submitted to the officer.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to complete this performance review.'),
  });

  const printReview = (review) => {
    const printWindow = window.open('', '', 'width=850,height=1100');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Performance Review - ${review.officer_name}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.5in; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #1a1a1a; }

          .header { text-align: center; padding-bottom: 15px; margin-bottom: 20px; border-bottom: 3px solid #1e40af; }
          .logo { width: 160px; height: auto; margin: 0 auto 10px; }
          .title { font-size: 18pt; font-weight: bold; color: #1e40af; margin-bottom: 5px; }
          .subtitle { font-size: 11pt; color: #475569; }

          .officer-info { background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .info-row { display: grid; grid-template-columns: 150px 1fr; padding: 8px 0; border-bottom: 1px solid #cbd5e1; }
          .info-row:last-child { border-bottom: none; }
          .info-label { font-weight: 600; color: #475569; }
          .info-value { color: #1e293b; }

          .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .metric-box { background: #dbeafe; padding: 15px; border-radius: 8px; text-align: center; border: 2px solid #93c5fd; }
          .metric-value { font-size: 22pt; font-weight: bold; color: #1e40af; }
          .metric-label { font-size: 8pt; color: #1e3a8a; margin-top: 5px; }

          .ratings-section { margin: 20px 0; }
          .rating-row { display: grid; grid-template-columns: 200px 1fr; padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .rating-label { font-weight: 600; }
          .stars { color: #f59e0b; }

          .text-section { margin: 20px 0; padding: 15px; background: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px; }
          .section-title { font-weight: bold; color: #1e40af; margin-bottom: 8px; font-size: 11pt; }
          .section-content { color: #334155; line-height: 1.6; }

          .signature-section { margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; }
          .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px; }
          .sig-box { }
          .sig-label { font-size: 9pt; font-weight: 600; color: #475569; margin-bottom: 5px; }
          .sig-line { border-bottom: 2px solid #1e40af; min-height: 50px; margin: 10px 0; }
          .sig-date { font-size: 8pt; color: #64748b; }

          .footer { background: #1e293b; color: white; padding: 12px; text-align: center; font-size: 8pt; margin-top: 30px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">PERFORMANCE REVIEW</div>
          <div class="subtitle">Review Period: ${format(parseISO(review.review_period_start), 'MMM d, yyyy')} - ${format(parseISO(review.review_period_end), 'MMM d, yyyy')}</div>
        </div>

        <div class="officer-info">
          <div class="info-row">
            <span class="info-label">Officer Name:</span>
            <span class="info-value">${review.officer_name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Email:</span>
            <span class="info-value">${review.officer_email}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Review Date:</span>
            <span class="info-value">${format(parseISO(review.review_date), 'MMMM d, yyyy')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Reviewed By:</span>
            <span class="info-value">${review.reviewer_name}</span>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-value">${review.hours_worked || 0}h</div>
            <div class="metric-label">HOURS WORKED</div>
          </div>
          <div class="metric-box">
            <div class="metric-value">${review.on_time_percentage != null ? `${review.on_time_percentage}%` : '—'}</div>
            <div class="metric-label">ON-TIME RATE</div>
          </div>
          <div class="metric-box" style="background: #dcfce7; border-color: #86efac;">
            <div class="metric-value" style="color: #16a34a;">${review.commendations_count || 0}</div>
            <div class="metric-label" style="color: #15803d;">COMMENDATIONS</div>
          </div>
          <div class="metric-box" style="background: #fee2e2; border-color: #fca5a5;">
            <div class="metric-value" style="color: #dc2626;">${review.complaints_count || 0}</div>
            <div class="metric-label" style="color: #991b1b;">COMPLAINTS</div>
          </div>
        </div>

        <div class="ratings-section">
          <h3 style="font-size: 12pt; font-weight: bold; color: #1e40af; margin-bottom: 15px;">PERFORMANCE RATINGS</h3>
          ${[
            { label: 'Punctuality', value: review.punctuality_rating },
            { label: 'Professionalism', value: review.professionalism_rating },
            { label: 'Uniform & Appearance', value: review.uniform_appearance_rating },
            { label: 'Communication', value: review.communication_rating },
            { label: 'Initiative', value: review.initiative_rating },
          ].map(r => `
            <div class="rating-row">
              <span class="rating-label">${r.label}:</span>
              <span class="stars">${'★'.repeat(r.value || 0)}${'☆'.repeat(5 - (r.value || 0))} (${r.value}/5)</span>
            </div>
          `).join('')}
          <div class="rating-row" style="background: #dbeafe; font-weight: bold; font-size: 11pt;">
            <span class="rating-label">OVERALL RATING:</span>
            <span class="stars">${'★'.repeat(review.overall_rating || 0)}${'☆'.repeat(5 - (review.overall_rating || 0))} (${review.overall_rating}/5)</span>
          </div>
        </div>

        ${review.strengths ? `
        <div class="text-section" style="background: #dcfce7; border-color: #22c55e;">
          <div class="section-title" style="color: #16a34a;">STRENGTHS</div>
          <div class="section-content">${review.strengths}</div>
        </div>
        ` : ''}

        ${review.areas_for_improvement ? `
        <div class="text-section" style="background: #fef3c7; border-color: #f59e0b;">
          <div class="section-title" style="color: #d97706;">AREAS FOR IMPROVEMENT</div>
          <div class="section-content">${review.areas_for_improvement}</div>
        </div>
        ` : ''}

        ${review.goals ? `
        <div class="text-section">
          <div class="section-title">GOALS FOR NEXT PERIOD</div>
          <div class="section-content">${review.goals}</div>
        </div>
        ` : ''}

        ${review.current_hourly_rate ? `
        <div class="text-section" style="background: #dbeafe; border-color: #3b82f6;">
          <div class="section-title">PAY INFORMATION</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <strong>Current Rate:</strong> $${review.current_hourly_rate.toFixed(2)}/hr
            </div>
            <div>
              <strong>Suggested Rate:</strong> $${review.suggested_hourly_rate.toFixed(2)}/hr
            </div>
            <div>
              <strong>Pay Range:</strong> $${review.pay_range_min.toFixed(2)} - $${review.pay_range_max.toFixed(2)}/hr
            </div>
            ${review.pay_effective_date ? `
            <div>
              <strong>Effective Date:</strong> ${format(parseISO(review.pay_effective_date), 'MMM d, yyyy')}
            </div>
            ` : ''}
          </div>
          ${review.pay_adjustment_approved ? `
            <div style="margin-top: 10px; padding: 10px; background: #dcfce7; border-radius: 4px; color: #16a34a; font-weight: bold;">
              ✓ Pay Adjustment Approved on ${format(parseISO(review.pay_adjustment_date), 'MMM d, yyyy')}
            </div>
          ` : ''}
        </div>
        ` : ''}

        <div class="signature-section">
          <h3 style="font-size: 12pt; font-weight: bold; color: #1e40af; margin-bottom: 15px;">ACKNOWLEDGMENTS</h3>
          <p style="font-size: 9pt; color: #475569; margin-bottom: 20px;">
            By signing below, I acknowledge that I have received and reviewed this performance evaluation with my supervisor.
          </p>
          <div class="sig-grid">
            <div class="sig-box">
              <div class="sig-label">Officer Signature</div>
              <div class="sig-line"></div>
              <div class="sig-date">Date: ____________________</div>
            </div>
            <div class="sig-box">
              <div class="sig-label">Supervisor Signature</div>
              <div class="sig-line"></div>
              <div class="sig-date">Date: ____________________</div>
            </div>
          </div>
        </div>

        <div class="footer">
        </div>

        <script>window.onload = function() { setTimeout(() => window.print(), 500); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (user?.role !== 'admin' && !user?.additional_roles?.includes('supervisor') && !user?.additional_roles?.includes('full_access')) {
    return (
      <div className="p-8 text-center">
        <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Supervisor Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-8 h-8 text-purple-600" />
            Performance Review Tasks
          </h1>
          <p className="text-slate-600">Review performance for personnel in your assigned command ({assignedPeople.length} personnel)</p>
        </div>

        {selectedReview ? (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
              <CardTitle className="flex items-center justify-between">
                <span>Review with {selectedReview.officer_name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedReview(null);
                    setSupervisorNotes("");
                  }}
                >
                  Back to List
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">Review Period</p>
                <p className="text-lg font-bold text-blue-700">
                  {format(parseISO(selectedReview.review_period_start), 'MMM d, yyyy')} - {format(parseISO(selectedReview.review_period_end), 'MMM d, yyyy')}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border text-center">
                  <p className="text-2xl font-bold text-slate-900">{selectedReview.hours_worked || 0}h</p>
                  <p className="text-xs text-slate-600">Hours Worked</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border text-center">
                  <p className="text-2xl font-bold text-slate-900">{selectedReview.on_time_percentage != null ? `${selectedReview.on_time_percentage}%` : '—'}</p>
                  <p className="text-xs text-slate-600">On-Time</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                  <p className="text-2xl font-bold text-green-600">{selectedReview.commendations_count || 0}</p>
                  <p className="text-xs text-slate-600">Commendations</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
                  <p className="text-2xl font-bold text-red-600">{selectedReview.complaints_count || 0}</p>
                  <p className="text-xs text-slate-600">Complaints</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-1">Supervisor Ratings</h3>
                <p className="text-sm text-slate-500 mb-3">Select one through five stars for every category. These ratings will be sent to the officer for a self-rating and signature.</p>
                {[
                  { key: 'punctuality_rating', label: 'Punctuality' },
                  { key: 'professionalism_rating', label: 'Professionalism' },
                  { key: 'uniform_appearance_rating', label: 'Uniform & Appearance' },
                  { key: 'communication_rating', label: 'Communication' },
                  { key: 'initiative_rating', label: 'Initiative' },
                  { key: 'overall_rating', label: 'Overall Rating' },
                ].map(({ key, label }) => (
                  <div key={key} className={`flex justify-between items-center py-3 border-b ${key === 'overall_rating' ? 'bg-purple-50 px-3 rounded-lg mt-2' : ''}`}>
                    <span className={key === 'overall_rating' ? 'font-bold text-slate-900' : 'text-slate-700'}>{label}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={label}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          role="radio"
                          aria-checked={supervisorRatings[key] === star}
                          aria-label={`${label}: ${star} of 5`}
                          onClick={() => setSupervisorRatings(current => ({ ...current, [key]: star }))}
                          className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <Star className={`${key === 'overall_rating' ? 'w-6 h-6' : 'w-5 h-5'} ${star <= supervisorRatings[key] ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {selectedReview.strengths && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">Strengths</h4>
                  <p className="text-slate-700">{selectedReview.strengths}</p>
                </div>
              )}

              {selectedReview.areas_for_improvement && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="font-semibold text-amber-900 mb-2">Areas for Improvement</h4>
                  <p className="text-slate-700">{selectedReview.areas_for_improvement}</p>
                </div>
              )}

              {selectedReview.goals && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Goals for Next Period</h4>
                  <p className="text-slate-700">{selectedReview.goals}</p>
                </div>
              )}

              {selectedReview.current_hourly_rate && (
                <div className="p-4 bg-slate-50 rounded-lg border">
                  <h4 className="font-semibold text-slate-900 mb-3">Pay Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-600">Current Rate:</span>
                      <span className="font-bold ml-2">${selectedReview.current_hourly_rate.toFixed(2)}/hr</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Suggested Rate:</span>
                      <span className="font-bold ml-2 text-green-700">${selectedReview.suggested_hourly_rate.toFixed(2)}/hr</span>
                    </div>
                    {selectedReview.pay_effective_date && (
                      <div className="col-span-2">
                        <span className="text-slate-600">Effective Date:</span>
                        <span className="font-bold ml-2 text-blue-700">{format(parseISO(selectedReview.pay_effective_date), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                  {selectedReview.pay_adjustment_approved && (
                    <div className="mt-3 p-3 bg-green-50 rounded border border-green-200">
                      <p className="text-green-700 font-semibold">✓ Pay Adjustment Approved</p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3 border-t pt-6">
                <div className="space-y-2">
                  <Label>Supervisor Notes (Optional)</Label>
                  <Textarea
                    value={supervisorNotes}
                    onChange={(e) => setSupervisorNotes(e.target.value)}
                    placeholder="Add any notes from your meeting with the officer..."
                    rows={3}
                  />
                </div>

                <div className="p-4 rounded-lg border bg-blue-950/30 border-blue-700">
                  <p className="font-semibold text-blue-300">Next step: officer response</p>
                  <p className="text-sm text-slate-300 mt-1">Submitting your ratings routes this review to the officer. The officer will provide a self-rating, comments, and an electronic signature before HR receives it for final approval.</p>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => printReview(selectedReview)}
                  className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print Review Document
                </Button>
                <Button
                  onClick={() => completeReviewMutation.mutate(selectedReview.id)}
                  disabled={Object.values(supervisorRatings).some(value => value < 1 || value > 5) || completeReviewMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {completeReviewMutation.isPending ? 'Submitting...' : 'Submit Ratings to Officer'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Pending Reviews ({pendingReviews?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingReviews && pendingReviews.length > 0 ? (
                <div className="space-y-3">
                  {pendingReviews.map((review) => (
                    <div key={review.id} className="p-5 bg-purple-50 rounded-lg border border-purple-200 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="w-5 h-5 text-purple-600" />
                            <p className="font-bold text-slate-900 text-lg">{review.officer_name}</p>
                          </div>
                          <p className="text-sm text-slate-600 mb-1">
                            Period: {format(parseISO(review.review_period_start), 'MMM d')} - {format(parseISO(review.review_period_end), 'MMM d, yyyy')}
                          </p>
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
                          <p className="text-xs text-slate-500">
                            Reviewed by: {review.reviewer_name} on {format(parseISO(review.review_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedReview(review);
                            setSupervisorNotes(review.supervisor_notes || "");
                            setSupervisorRatings({
                              punctuality_rating: Number(review.punctuality_rating) || 3,
                              professionalism_rating: Number(review.professionalism_rating) || 3,
                              uniform_appearance_rating: Number(review.uniform_appearance_rating) || 3,
                              communication_rating: Number(review.communication_rating) || 3,
                              initiative_rating: Number(review.initiative_rating) || 3,
                              overall_rating: Number(review.overall_rating) || 3,
                            });
                          }}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          Rate Officer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <ClipboardCheck className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p>No pending reviews</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!selectedReview && awaitingOfficerReviews.length > 0 && (
          <Card className="border border-amber-300 bg-amber-50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-amber-950">Awaiting Officer Response ({awaitingOfficerReviews.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {awaitingOfficerReviews.map(review => (
                <div key={review.id} className="rounded-lg border border-amber-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">{review.officer_name}</p>
                      <p className="text-sm text-slate-600">{format(parseISO(review.review_period_start), 'MMM d')} - {format(parseISO(review.review_period_end), 'MMM d, yyyy')}</p>
                    </div>
                    <div className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">Awaiting self-rating & signature</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}