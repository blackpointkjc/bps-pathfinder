import { createClientFromRequest } from 'npm:@base44/sdk';

const key = (value:any) => String(value || '').trim().toLowerCase();
const rolesOf = (u:any) => new Set((u?.additional_roles || []).map((r:any)=>String(r).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error:'Unauthorized' }, { status:401 });
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('supervisor') && !roles.has('full_access')) {
      return Response.json({ error:'Supervisor access required' }, { status:403 });
    }
    const { reviewId, supervisorNotes } = await req.json();
    if (!reviewId) return Response.json({ error:'reviewId required' }, { status:400 });
    const [users, review] = await Promise.all([
      base44.asServiceRole.entities.User.list(),
      base44.asServiceRole.entities.PerformanceReview.get(reviewId),
    ]);
    if (!review) return Response.json({ error:'Review not found' }, { status:404 });
    if (!review.officer_acknowledged || !review.officer_signature_url || !review.officer_signed_at) {
      return Response.json({ error:'The officer must review and electronically sign this evaluation before it can be completed.' }, { status:409 });
    }
    const officer = (users || []).find((u:any) =>
      String(u.id || '') === String(review.officer_id || '') || key(u.email) === key(review.officer_email)
    );
    const myPlatoon = key(me.platoon || me.subdivision);
    const samePlatoon = officer && myPlatoon && key(officer.platoon || officer.subdivision) === myPlatoon;
    const explicitlyAssigned = String(review.assigned_supervisor_id || '') === String(me.id || '');
    if (me.role !== 'admin' && !roles.has('full_access') && !explicitlyAssigned && !samePlatoon) {
      return Response.json({ error:'This review is not assigned to you or your platoon.' }, { status:403 });
    }
    await base44.asServiceRole.entities.PerformanceReview.update(reviewId, {
      supervisor_review_completed: true,
      supervisor_review_pending: false,
      supervisor_review_completed_by: me.email,
      supervisor_review_completed_date: new Date().toISOString(),
      officer_signature_obtained: true,
      supervisor_notes: String(supervisorNotes || review.supervisor_notes || '').trim(),
    });
    if (review.reviewer_email) {
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: review.reviewer_email,
        type: 'training_reminder',
        title: 'Performance Review Completed',
        message: `${me.rank || 'Supervisor'} ${me.last_name || me.first_name || me.email} completed the signed review with ${review.officer_name || review.officer_email}.`,
        priority: 'normal',
        related_id: review.id,
        source_name: 'Performance Reviews',
      }).catch(() => null);
    }
    return Response.json({ success:true });
  } catch (error) {
    console.error('completeSupervisorPerformanceReview failed', error);
    return Response.json({ error:error?.message || 'Unable to complete performance review' }, { status:500 });
  }
});
