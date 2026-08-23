import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, LockKeyhole } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

export default function PerformanceReviewTaskGate({ user }) {
  const { data = { reviews: [] }, refetch } = useQuery({
    queryKey: ['requiredOfficerPerformanceReviewGate', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('manageOfficerPerformanceReviews', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener('pathfinder:performance-review-updated', handler);
    return () => window.removeEventListener('pathfinder:performance-review-updated', handler);
  }, [refetch]);

  const requiredReview = useMemo(() => (data.reviews || []).find(review =>
    String(review.workflow_stage || '') === 'officer_pending' && !review.officer_acknowledged
  ), [data.reviews]);

  const reviewUrl = createPageUrl('OfficerPerformanceReviews');
  const onReviewPage = String(window.location.pathname || '').toLowerCase().includes('officerperformancereviews');
  if (!requiredReview || onReviewPage) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#020711]/95 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-blue-500/35 bg-[#0b1522] shadow-[0_30px_100px_rgba(0,0,0,.65)]">
        <div className="border-b border-slate-800 bg-gradient-to-r from-blue-950/80 to-[#0b1522] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/10">
              <ClipboardCheck className="h-7 w-7 text-blue-300" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-blue-300">Required Task</div>
              <h2 className="mt-1 text-2xl font-black text-white">Performance Review Response Required</h2>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-slate-700 bg-[#101b29] p-4">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
              <div>
                <p className="font-bold text-white">Complete this task before continuing in Pathfinder.</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">Review the supervisor evaluation, complete every required self-rating, add your response, and sign electronically.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Review Period</div><div className="mt-1 font-bold text-slate-200">{requiredReview.review_period_start || '—'} – {requiredReview.review_period_end || '—'}</div></div>
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Supervisor</div><div className="mt-1 font-bold text-slate-200">{requiredReview.assigned_supervisor_name || requiredReview.reviewer_name || 'Assigned Supervisor'}</div></div>
          </div>
          <button type="button" onClick={() => { window.location.href = reviewUrl; }} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500">OPEN REQUIRED PERFORMANCE REVIEW</button>
        </div>
      </div>
    </div>
  );
}
