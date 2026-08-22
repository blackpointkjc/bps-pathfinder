import { createClientFromRequest } from 'npm:@base44/sdk';
import { buildPerformanceMetrics, reviewPayloadFromMetrics } from './metrics.ts';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
const dateOnly = (value = new Date()) => value.toISOString().slice(0, 10);
const displayName = (user: any) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.email || 'Supervisor';
const active = (user: any) => user && user.employment_status !== 'terminated' && !user.termination_date;
const rating = (value: unknown, fallback = 3) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(1, Math.round(number))) : fallback;
};

async function resolveOfficer(base44: any, officerId: unknown, officerEmail: unknown) {
  const [users, teams, outlook] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 2000).catch(() => []),
    base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 2000).catch(() => []),
  ]);
  const id = String(officerId || '');
  const email = emailKey(officerEmail);
  if (id) {
    const match = (users || []).find((user: any) => String(user.id || '') === id);
    if (match) return { officer: match, users };
  }
  const linkedId = [
    ...(teams || []).filter((row: any) => [row.pathfinder_email, row.microsoft_email].some(value => emailKey(value) === email)),
    ...(outlook || []).filter((row: any) => [row.pathfinder_email, row.outlook_email].some(value => emailKey(value) === email)),
  ].map((row: any) => String(row.user_id || '')).find(Boolean);
  const officer = (users || []).find((user: any) =>
    (linkedId && String(user.id || '') === linkedId) ||
    [user.email, user.work_email, user.microsoft_email, user.outlook_email].some(value => emailKey(value) === email)
  );
  return { officer, users };
}

function randomIndex(length: number) {
  if (length <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function chooseRotatingSupervisor(officer: any, users: any[], reviews: any[]) {
  const eligible = (users || []).filter((user: any) =>
    active(user) &&
    String(user.id || '') !== String(officer.id || '') &&
    rolesOf(user).has('supervisor')
  );
  if (!eligible.length) return null;

  const stats = new Map(eligible.map((user: any) => [String(user.id), { count: 0, last: 0 }]));
  for (const review of reviews || []) {
    const id = String(review.assigned_supervisor_id || '');
    const current = stats.get(id);
    if (!current) continue;
    current.count += 1;
    current.last = Math.max(current.last, new Date(review.supervisor_task_created_at || review.created_date || 0).getTime() || 0);
  }
  const minimumCount = Math.min(...eligible.map((user: any) => stats.get(String(user.id))?.count || 0));
  const leastUsed = eligible.filter((user: any) => (stats.get(String(user.id))?.count || 0) === minimumCount);
  const oldest = Math.min(...leastUsed.map((user: any) => stats.get(String(user.id))?.last || 0));
  const next = leastUsed.filter((user: any) => (stats.get(String(user.id))?.last || 0) === oldest);
  return next[randomIndex(next.length)];
}

async function notify(base44: any, recipient: string, title: string, message: string, reviewId: string) {
  if (!recipient) return;
  await base44.asServiceRole.entities.Notification.create({
    recipient_email: recipient,
    type: 'training_reminder',
    title,
    message,
    priority: 'high',
    related_id: reviewId,
    source_name: 'Performance Reviews',
  }).catch(() => null);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = rolesOf(me);
    if (me.role !== 'admin' && !roles.has('hr') && !roles.has('full_access')) {
      return Response.json({ error: 'HR access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'preview');

    if (action === 'approve') {
      const review = await base44.asServiceRole.entities.PerformanceReview.get(String(body.review_id || ''));
      if (!review) return Response.json({ error: 'Performance review not found.' }, { status: 404 });
      if (review.workflow_stage !== 'hr_approval_pending') {
        return Response.json({ error: 'This review is not waiting for HR approval.' }, { status: 409 });
      }
      const finalRatings = {
        punctuality_rating: rating(body.ratings?.punctuality_rating, review.punctuality_rating),
        professionalism_rating: rating(body.ratings?.professionalism_rating, review.professionalism_rating),
        uniform_appearance_rating: rating(body.ratings?.uniform_appearance_rating, review.uniform_appearance_rating),
        communication_rating: rating(body.ratings?.communication_rating, review.communication_rating),
        initiative_rating: rating(body.ratings?.initiative_rating, review.initiative_rating),
        overall_rating: rating(body.ratings?.overall_rating, review.overall_rating),
      };
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.PerformanceReview.update(review.id, {
        ...finalRatings,
        final_rating: finalRatings.overall_rating,
        workflow_stage: 'approved',
        hr_approved: true,
        hr_approved_by: me.email,
        hr_approved_at: now,
        hr_approval_notes: String(body.hr_approval_notes || '').trim(),
      });
      await Promise.all([
        notify(base44, review.officer_email, 'Performance Review Approved', 'HR approved your completed performance review. The final rating is now available in My Reviews & Feedback.', review.id),
        notify(base44, review.assigned_supervisor_email, 'Performance Review Approved by HR', `HR approved ${review.officer_name}'s completed performance review.`, review.id),
      ]);
      return Response.json({ success: true, workflow_stage: 'approved', final_ratings: finalRatings });
    }

    const start = String(body.review_period_start || '').slice(0, 10);
    const end = String(body.review_period_end || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return Response.json({ error: 'Select a valid review start and end date.' }, { status: 400 });
    }
    const { officer, users } = await resolveOfficer(base44, body.officer_id, body.officer_email);
    if (!officer || !active(officer)) return Response.json({ error: 'Active officer could not be found.' }, { status: 404 });

    const metrics = await buildPerformanceMetrics(base44, officer, start, end);
    if (action === 'preview') return Response.json({ success: true, metrics });
    if (action !== 'create') return Response.json({ error: 'Unsupported action.' }, { status: 400 });

    const existingReviews = await base44.asServiceRole.entities.PerformanceReview.list('-supervisor_task_created_at', 5000);
    const assignedSupervisor = chooseRotatingSupervisor(officer, users || [], existingReviews || []);
    if (!assignedSupervisor) {
      return Response.json({ error: 'No other active user with the supervisor role is available for assignment.' }, { status: 409 });
    }
    const payload = {
      ...reviewPayloadFromMetrics(metrics, body.review || {}),
      review_type: 'manual',
      review_date: dateOnly(),
      reviewer_email: me.email,
      reviewer_name: displayName(me),
      assigned_supervisor_id: assignedSupervisor.id,
      assigned_supervisor_email: assignedSupervisor.email,
      assigned_supervisor_name: displayName(assignedSupervisor),
      supervisor_task_created_at: new Date().toISOString(),
      assignment_round: (existingReviews || []).filter((item: any) => String(item.assigned_supervisor_id || '') === String(assignedSupervisor.id)).length + 1,
      workflow_stage: 'supervisor_pending',
      supervisor_review_pending: true,
      supervisor_review_completed: false,
      officer_acknowledged: false,
      officer_signature_obtained: false,
      hr_approved: false,
    };
    const review = await base44.asServiceRole.entities.PerformanceReview.create(payload);
    await Promise.all([
      notify(base44, assignedSupervisor.email, 'Performance Review Assigned', `HR assigned you ${review.officer_name}'s performance review. Submit your ratings and feedback in Supervisor Center.`, review.id),
      notify(base44, officer.email, 'Performance Review Started', `HR started your performance review for ${start} through ${end}. It is currently with the assigned supervisor.`, review.id),
    ]);
    return Response.json({ success: true, review, metrics, assigned_supervisor: { id: assignedSupervisor.id, name: displayName(assignedSupervisor) } });
  } catch (error) {
    console.error('managePerformanceReviews failed', error);
    return Response.json({ error: error?.message || 'Unable to manage performance reviews' }, { status: 500 });
  }
});
