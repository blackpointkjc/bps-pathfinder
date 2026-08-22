import { createClientFromRequest } from 'npm:@base44/sdk';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const score = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? Math.round(number) : null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) {
      return Response.json({ error: 'Supervisor access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const reviewId = String(body.reviewId || body.review_id || '');
    if (!reviewId) return Response.json({ error: 'reviewId required' }, { status: 400 });
    const review = await base44.asServiceRole.entities.PerformanceReview.get(reviewId);
    if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });

    const stage = String(review.workflow_stage || (review.supervisor_review_pending ? 'supervisor_pending' : ''));
    if (stage !== 'supervisor_pending') {
      return Response.json({ error: 'This review is no longer waiting for supervisor ratings.' }, { status: 409 });
    }
    if (me.role !== 'admin' && !roles.has('full_access') &&
        String(review.assigned_supervisor_id || '') !== String(me.id || '')) {
      return Response.json({ error: 'This review is assigned to another supervisor.' }, { status: 403 });
    }

    const ratings = {
      punctuality_rating: score(body.ratings?.punctuality_rating),
      professionalism_rating: score(body.ratings?.professionalism_rating),
      uniform_appearance_rating: score(body.ratings?.uniform_appearance_rating),
      communication_rating: score(body.ratings?.communication_rating),
      initiative_rating: score(body.ratings?.initiative_rating),
      overall_rating: score(body.ratings?.overall_rating),
    };
    if (Object.values(ratings).some(value => value == null)) {
      return Response.json({ error: 'Complete every supervisor rating from 1 through 5.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.PerformanceReview.update(reviewId, {
      ...ratings,
      strengths: String(body.strengths ?? review.strengths ?? '').trim(),
      areas_for_improvement: String(body.areas_for_improvement ?? review.areas_for_improvement ?? '').trim(),
      goals: String(body.goals ?? review.goals ?? '').trim(),
      supervisor_notes: String(body.supervisorNotes ?? body.supervisor_notes ?? review.supervisor_notes ?? '').trim(),
      supervisor_rating_comments: String(body.supervisor_rating_comments ?? body.supervisorNotes ?? '').trim(),
      supervisor_submitted_at: now,
      supervisor_review_completed: true,
      supervisor_review_pending: false,
      supervisor_review_completed_by: me.email,
      supervisor_review_completed_date: now,
      workflow_stage: 'officer_pending',
      officer_acknowledged: false,
      officer_signature_obtained: false,
    });

    await base44.asServiceRole.entities.Notification.create({
      recipient_email: review.officer_email,
      type: 'training_reminder',
      title: 'Performance Review Ready for Your Response',
      message: `${review.assigned_supervisor_name || 'Your supervisor'} submitted your performance ratings. Open My Reviews & Feedback to add your self-rating, comments, and electronic signature.`,
      priority: 'high',
      related_id: review.id,
      source_name: 'Performance Reviews',
    }).catch(() => null);

    return Response.json({ success: true, workflow_stage: 'officer_pending' });
  } catch (error) {
    console.error('completeSupervisorPerformanceReview failed', error);
    return Response.json({ error: error?.message || 'Unable to submit supervisor performance ratings' }, { status: 500 });
  }
});
