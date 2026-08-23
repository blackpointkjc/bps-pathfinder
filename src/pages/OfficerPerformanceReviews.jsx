import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, PenLine, Star } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';

const ratingFields = [
  { key: 'punctuality_rating', label: 'Punctuality' },
  { key: 'professionalism_rating', label: 'Professionalism' },
  { key: 'uniform_appearance_rating', label: 'Uniform & Appearance' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'initiative_rating', label: 'Initiative' },
  { key: 'overall_rating', label: 'Overall Rating' },
];

const emptyRatings = () => Object.fromEntries(ratingFields.map(({ key }) => [key, 0]));

function stageOf(review) {
  if (review.workflow_stage) return review.workflow_stage;
  if (review.hr_approved) return 'approved';
  if (review.officer_acknowledged) return 'hr_approval_pending';
  if (review.supervisor_review_completed) return 'officer_pending';
  return 'supervisor_pending';
}

function stagePresentation(stage) {
  if (stage === 'higher_reviewer_required') return { label: 'Higher-Ranking Reviewer Required', className: 'bg-red-800' };
  if (stage === 'officer_pending') return { label: 'Your Response Required', className: 'bg-amber-600' };
  if (stage === 'hr_approval_pending') return { label: 'Waiting for HR Approval', className: 'bg-sky-700' };
  if (stage === 'approved') return { label: 'HR Approved', className: 'bg-emerald-700' };
  return { label: 'With Assigned Supervisor', className: 'bg-violet-700' };
}

function Stars({ value = 0, onChange, label, large = false }) {
  return <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label={label}>
    {[1, 2, 3, 4, 5].map(star => onChange ? (
      <button
        key={star}
        type="button"
        role="radio"
        aria-checked={Number(value) === star}
        aria-label={`${label}: ${star} of 5`}
        onClick={() => onChange(star)}
        className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <Star className={`${large ? 'h-7 w-7' : 'h-5 w-5'} ${star <= Number(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
      </button>
    ) : (
      <Star key={star} className={`${large ? 'h-7 w-7' : 'h-5 w-5'} ${star <= Number(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
    ))}
  </div>;
}

export default function OfficerPerformanceReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(null);
  const [comments, setComments] = useState('');
  const [selfRatings, setSelfRatings] = useState(emptyRatings);

  const load = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('manageOfficerPerformanceReviews', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      setReviews(payload.reviews || []);
      if (payload.recovered_count > 0) {
        toast.success(`${payload.recovered_count} missing performance review${payload.recovered_count === 1 ? '' : 's'} restored.`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Unable to load performance reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openResponse = (review) => {
    setSigning(review);
    setComments(review.officer_comments || '');
    setSelfRatings(Object.fromEntries(ratingFields.map(({ key }) => [
      key,
      Number(review[`officer_${key}`]) || 0,
    ])));
  };

  const saveSignature = async (signatureUrl) => {
    try {
      const response = await base44.functions.invoke('manageOfficerPerformanceReviews', {
        action: 'acknowledge',
        review_id: signing.id,
        signature_url: signatureUrl,
        officer_comments: comments,
        ratings: selfRatings,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      toast.success('Your self-rating and signature were sent to HR for final approval.');
      setSigning(null);
      setComments('');
      setSelfRatings(emptyRatings());
      window.dispatchEvent(new CustomEvent('pathfinder:performance-review-updated'));
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Unable to submit your signed review.');
    }
  };

  return <div className="min-h-screen bg-[#08131f] p-4 text-slate-100 md:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold"><ClipboardCheck className="text-amber-400"/>My Reviews & Feedback</h1>
        <p className="mt-1 text-slate-400">Officer Center → Profile & Training → My Reviews & Feedback</p>
        <p className="mt-1 text-sm text-slate-500">See where each review is in the cycle and complete your self-rating and signature when it reaches you.</p>
      </div>

      {loading ? (
        <Card className="border-slate-700 bg-slate-900"><CardContent className="p-8 text-center text-slate-300">Loading reviews…</CardContent></Card>
      ) : reviews.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900"><CardContent className="p-10 text-center text-slate-400">No performance reviews are available yet.</CardContent></Card>
      ) : reviews.map(review => {
        const stage = stageOf(review);
        const status = stagePresentation(stage);
        return <Card key={review.id} className="border-slate-700 bg-slate-900 text-slate-100">
          <CardHeader>
            <div className="flex flex-wrap justify-between gap-3">
              <CardTitle>{review.review_type === 'annual_automatic' ? 'Annual Performance Review' : 'Performance Review'}</CardTitle>
              <Badge className={status.className}>{status.label}</Badge>
            </div>
            <p className="text-sm text-slate-400">
              {review.review_period_start} through {review.review_period_end} · Assigned supervisor: {review.assigned_supervisor_name || 'Pending assignment'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">Performance score</div><div className="text-2xl font-bold">{review.performance_score ?? '—'}</div></div>
              <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">{stage === 'approved' ? 'Final rating' : 'Supervisor rating'}</div><div className="flex items-center gap-1 text-2xl font-bold">{stage === 'approved' ? (review.final_rating ?? review.overall_rating ?? '—') : (review.overall_rating ?? '—')}<Star className="h-5 w-5 fill-amber-400 text-amber-400"/></div></div>
              <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">Hours</div><div className="text-2xl font-bold">{review.hours_worked ?? 0}</div></div>
              <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">On-time</div><div className="text-2xl font-bold">{review.on_time_percentage == null ? '—' : `${review.on_time_percentage}%`}</div></div>
            </div>

            {['officer_pending', 'hr_approval_pending', 'approved'].includes(stage) && <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <h3 className="mb-3 font-semibold text-sky-300">Supervisor Ratings</h3>
              <div className="space-y-2">
                {ratingFields.map(({ key, label }) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 py-2">
                  <span>{label}</span><Stars value={review[key]} label={label}/>
                </div>)}
              </div>
            </section>}

            {review.strengths && <section><h3 className="font-semibold text-emerald-400">Strengths</h3><p className="whitespace-pre-wrap text-slate-300">{review.strengths}</p></section>}
            {review.areas_for_improvement && <section><h3 className="font-semibold text-amber-400">Areas for improvement</h3><p className="whitespace-pre-wrap text-slate-300">{review.areas_for_improvement}</p></section>}
            {review.goals && <section><h3 className="font-semibold text-sky-400">Goals</h3><p className="whitespace-pre-wrap text-slate-300">{review.goals}</p></section>}
            {review.supervisor_notes && <section><h3 className="font-semibold">Supervisor feedback</h3><p className="whitespace-pre-wrap text-slate-300">{review.supervisor_notes}</p></section>}

            {review.officer_acknowledged && <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4">
              <p className="font-semibold text-emerald-300">Electronically signed {review.officer_signed_at ? new Date(review.officer_signed_at).toLocaleString() : ''}</p>
              <div className="mt-3 space-y-2">
                {ratingFields.map(({ key, label }) => <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-300">Your {label}</span><Stars value={review[`officer_${key}`]} label={`Your ${label}`}/>
                </div>)}
              </div>
              {review.officer_signature_url && <img src={review.officer_signature_url} alt="Officer signature" className="mt-3 max-h-24 rounded bg-white p-2"/>}
              {review.officer_comments && <p className="mt-2 text-slate-300">Your comments: {review.officer_comments}</p>}
              {stage === 'hr_approval_pending' && <p className="mt-3 text-sm font-semibold text-sky-300">This review is now with HR for final approval.</p>}
              {stage === 'approved' && <p className="mt-3 text-sm font-semibold text-emerald-300">HR approved this review{review.hr_approved_at ? ` on ${new Date(review.hr_approved_at).toLocaleDateString()}` : ''}.</p>}
            </div>}

            {stage === 'officer_pending' && <Button onClick={() => openResponse(review)} className="bg-amber-500 text-slate-950 hover:bg-amber-400"><PenLine className="mr-2 h-4 w-4"/>Add Self-Rating, Comment & Sign</Button>}
            {stage === 'higher_reviewer_required' && <p className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{review.assignment_issue || 'No active reviewer currently ranks above you.'} This review has not been sent downward. Administration must add or assign a higher-ranking reviewer before it can continue.</p>}
            {stage === 'supervisor_pending' && <p className="rounded-lg border border-violet-800 bg-violet-950/30 p-4 text-sm text-violet-200">The assigned higher-ranking supervisor is preparing this review. You will be notified when it is ready for your response.</p>}
          </CardContent>
        </Card>;
      })}
    </div>

    {signing && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
      <div className="mx-auto my-8 max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-xl font-bold">Officer Self-Rating & Signature</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">Complete every self-rating. Your electronic signature sends the review to HR for final approval.</p>
        <div className="mb-5 space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
          {ratingFields.map(({ key, label }) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 py-2">
            <span className={key === 'overall_rating' ? 'font-bold' : ''}>{label}</span>
            <Stars value={selfRatings[key]} label={label} onChange={value => setSelfRatings(current => ({ ...current, [key]: value }))} large={key === 'overall_rating'}/>
          </div>)}
        </div>
        <Textarea value={comments} onChange={event => setComments(event.target.value)} placeholder="Officer comments (optional)" className="mb-4 border-slate-600 bg-slate-800"/>
        {ratingFields.every(({ key }) => selfRatings[key] >= 1 && selfRatings[key] <= 5) ? (
          <SignaturePad officerName={signing.officer_name} onSignatureComplete={saveSignature} onClose={() => setSigning(null)}/>
        ) : (
          <div className="space-y-3 rounded-lg border border-amber-700 bg-amber-950/30 p-4">
            <p className="font-semibold text-amber-300">Select a rating for all six categories before signing.</p>
            <Button variant="outline" onClick={() => setSigning(null)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>}
  </div>;
}
