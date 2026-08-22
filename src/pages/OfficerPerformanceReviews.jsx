import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, PenLine, Star } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';

export default function OfficerPerformanceReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(null);
  const [comments, setComments] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('manageOfficerPerformanceReviews', { action: 'list' });
      setReviews(response.data?.reviews || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Unable to load performance reviews.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveSignature = async (signatureUrl) => {
    try {
      await base44.functions.invoke('manageOfficerPerformanceReviews', {
        action: 'acknowledge', review_id: signing.id, signature_url: signatureUrl, officer_comments: comments,
      });
      toast.success('Performance review acknowledged and signed.');
      setSigning(null); setComments(''); await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Unable to save your signed acknowledgment.');
    }
  };

  return <div className="min-h-screen p-4 md:p-8 bg-[#08131f] text-slate-100">
    <div className="max-w-5xl mx-auto space-y-5">
      <div><h1 className="text-3xl font-bold flex items-center gap-3"><ClipboardCheck className="text-amber-400"/>My Reviews & Feedback</h1>
      <p className="text-slate-400 mt-1">Review your supervisor feedback, add comments, and sign electronically.</p></div>
      {loading ? <Card className="bg-slate-900 border-slate-700"><CardContent className="p-8 text-center text-slate-300">Loading reviews…</CardContent></Card> :
      reviews.length === 0 ? <Card className="bg-slate-900 border-slate-700"><CardContent className="p-10 text-center text-slate-400">No performance reviews are available yet.</CardContent></Card> :
      reviews.map(review => <Card key={review.id} className="bg-slate-900 border-slate-700 text-slate-100">
        <CardHeader><div className="flex flex-wrap justify-between gap-3"><CardTitle>{review.review_type === 'annual_automatic' ? 'Annual Performance Review' : 'Performance Review'}</CardTitle>
        <Badge className={review.officer_acknowledged ? 'bg-emerald-700' : 'bg-amber-600'}>{review.officer_acknowledged ? 'Signed' : 'Signature Required'}</Badge></div>
        <p className="text-sm text-slate-400">{review.review_period_start} through {review.review_period_end} · Reviewed by {review.reviewer_name || 'Black Point Security'}</p></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">Performance score</div><div className="text-2xl font-bold">{review.performance_score ?? '—'}</div></div>
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">Overall rating</div><div className="flex items-center gap-1 text-2xl font-bold">{review.overall_rating ?? '—'}<Star className="w-5 h-5 fill-amber-400 text-amber-400"/></div></div>
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">Hours</div><div className="text-2xl font-bold">{review.hours_worked ?? 0}</div></div>
            <div className="rounded-lg bg-slate-800 p-3"><div className="text-xs text-slate-400">On-time</div><div className="text-2xl font-bold">{review.on_time_percentage ?? '—'}%</div></div>
          </div>
          {review.strengths && <section><h3 className="font-semibold text-emerald-400">Strengths</h3><p className="text-slate-300 whitespace-pre-wrap">{review.strengths}</p></section>}
          {review.areas_for_improvement && <section><h3 className="font-semibold text-amber-400">Areas for improvement</h3><p className="text-slate-300 whitespace-pre-wrap">{review.areas_for_improvement}</p></section>}
          {review.goals && <section><h3 className="font-semibold text-sky-400">Goals</h3><p className="text-slate-300 whitespace-pre-wrap">{review.goals}</p></section>}
          {review.supervisor_notes && <section><h3 className="font-semibold">Supervisor feedback</h3><p className="text-slate-300 whitespace-pre-wrap">{review.supervisor_notes}</p></section>}
          {review.officer_acknowledged ? <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4">
            <p className="font-semibold text-emerald-300">Electronically signed {review.officer_signed_at ? new Date(review.officer_signed_at).toLocaleString() : ''}</p>
            {review.officer_signature_url && <img src={review.officer_signature_url} alt="Officer signature" className="mt-3 max-h-24 rounded bg-white p-2"/>}
            {review.officer_comments && <p className="mt-2 text-slate-300">Your comments: {review.officer_comments}</p>}
          </div> : <Button onClick={() => { setSigning(review); setComments(''); }} className="bg-amber-500 hover:bg-amber-400 text-slate-950"><PenLine className="w-4 h-4 mr-2"/>Review, Comment & Sign</Button>}
        </CardContent>
      </Card>)}
    </div>
    {signing && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4"><div className="max-w-2xl mx-auto my-8 rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-bold">Acknowledge Performance Review</h2>
      <p className="text-sm text-slate-400 mt-1 mb-4">Signing confirms you received and reviewed the evaluation. It does not prevent you from adding comments.</p>
      <Textarea value={comments} onChange={e=>setComments(e.target.value)} placeholder="Officer comments (optional)" className="mb-4 bg-slate-800 border-slate-600"/>
      <SignaturePad officerName={signing.officer_name} onSignatureComplete={saveSignature} onClose={()=>setSigning(null)}/>
    </div></div>}
  </div>;
}
