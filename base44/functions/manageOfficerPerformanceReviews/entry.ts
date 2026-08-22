import { createClientFromRequest } from 'npm:@base44/sdk';
import { buildPerformanceMetrics, reviewPayloadFromMetrics } from '../managePerformanceReviews/metrics.ts';

const key = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const active = (user: any) => user && user.employment_status !== 'terminated' && user.employment_status !== 'on_leave' && !user.termination_date;
const displayName = (user: any) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.email || 'Supervisor';
const ratingFields = [
  'punctuality_rating',
  'professionalism_rating',
  'uniform_appearance_rating',
  'communication_rating',
  'initiative_rating',
  'overall_rating',
];

async function identity(base44: any, me: any) {
  const [teams, outlook] = await Promise.all([
    base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 2000).catch(() => []),
    base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 2000).catch(() => []),
  ]);
  const aliases = new Set([me.email, me.work_email, me.microsoft_email, me.outlook_email].map(key).filter(Boolean));
  for (const row of [...(teams || []), ...(outlook || [])]) {
    if (String(row.user_id || '') === String(me.id || '') ||
        aliases.has(key(row.pathfinder_email)) || aliases.has(key(row.microsoft_email)) || aliases.has(key(row.outlook_email))) {
      [row.pathfinder_email, row.microsoft_email, row.outlook_email].map(key).filter(Boolean).forEach((email: string) => aliases.add(email));
    }
  }
  return aliases;
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
    const state = stats.get(String(review.assigned_supervisor_id || ''));
    if (!state) continue;
    state.count += 1;
    state.last = Math.max(state.last, new Date(review.supervisor_task_created_at || review.created_date || 0).getTime() || 0);
  }
  const minimum = Math.min(...eligible.map((user: any) => stats.get(String(user.id))?.count || 0));
  const leastUsed = eligible.filter((user: any) => (stats.get(String(user.id))?.count || 0) === minimum);
  const oldest = Math.min(...leastUsed.map((user: any) => stats.get(String(user.id))?.last || 0));
  const tied = leastUsed.filter((user: any) => (stats.get(String(user.id))?.last || 0) === oldest);
  return tied[randomIndex(tied.length)];
}

async function recoverOrphanedReviews(base44: any, me: any, aliases: Set<string>, allReviews: any[]) {
  const notifications = await base44.asServiceRole.entities.Notification.list('-created_date', 1000).catch(() => []);
  const orphaned = (notifications || []).filter((notice: any) =>
    aliases.has(key(notice.recipient_email)) &&
    notice.related_id &&
    /performance review/i.test(String(notice.title || notice.source_name || '')) &&
    !(allReviews || []).some((review: any) => String(review.id) === String(notice.related_id))
  );

  if (!orphaned.length) return [];
  const users = await base44.asServiceRole.entities.User.list(undefined, 5000);
  const recovered: any[] = [];

  for (const notice of orphaned) {
    const period = String(notice.message || '').match(/(\d{4}-\d{2}-\d{2})\s+through\s+(\d{4}-\d{2}-\d{2})/i);
    if (!period) continue;
    const [, start, end] = period;
    const alreadyRecovered = [...(allReviews || []), ...recovered].find((review: any) =>
      (String(review.officer_id || '') === String(me.id || '') || aliases.has(key(review.officer_email))) &&
      String(review.review_period_start || '') === start &&
      String(review.review_period_end || '') === end
    );
    if (alreadyRecovered) {
      await base44.asServiceRole.entities.Notification.update(notice.id, { related_id: alreadyRecovered.id }).catch(() => null);
      continue;
    }

    const supervisor = chooseRotatingSupervisor(me, users || [], [...(allReviews || []), ...recovered]);
    if (!supervisor) continue;
    const metrics = await buildPerformanceMetrics(base44, me, start, end);
    const review = await base44.asServiceRole.entities.PerformanceReview.create({
      ...reviewPayloadFromMetrics(metrics),
      review_type: 'manual',
      review_date: String(notice.created_date || new Date().toISOString()).slice(0, 10),
      reviewer_email: supervisor.email,
      reviewer_name: displayName(supervisor),
      assigned_supervisor_id: supervisor.id,
      assigned_supervisor_email: supervisor.email,
      assigned_supervisor_name: displayName(supervisor),
      supervisor_task_created_at: new Date().toISOString(),
      assignment_round: [...(allReviews || []), ...recovered].filter((item: any) => String(item.assigned_supervisor_id || '') === String(supervisor.id)).length + 1,
      workflow_stage: 'supervisor_pending',
      supervisor_review_pending: true,
      supervisor_review_completed: false,
      officer_acknowledged: false,
      officer_signature_obtained: false,
      hr_approved: false,
      supervisor_notes: 'Recovered from the original Pathfinder performance-review notification after the underlying review record became unavailable.',
    });
    recovered.push(review);

    await Promise.all([
      base44.asServiceRole.entities.Notification.update(notice.id, {
        related_id: review.id,
        title: 'Performance Review Restored',
        message: `Your performance review for ${start} through ${end} is restored and visible in Officer Center → Profile & Training → My Reviews & Feedback.`,
        is_read: false,
      }).catch(() => null),
      base44.asServiceRole.entities.Notification.create({
        recipient_email: supervisor.email,
        type: 'training_reminder',
        title: 'Recovered Performance Review Assigned',
        message: `${metrics.officer_name}'s review for ${start} through ${end} was restored and assigned to you. Submit ratings in Supervisor Center.`,
        priority: 'high',
        related_id: review.id,
        source_name: 'Performance Reviews',
      }).catch(() => null),
    ]);
  }
  return recovered;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const aliases = await identity(base44, me);
    let all = await base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000);
    const owns = (review: any) => String(review.officer_id || '') === String(me.id || '') || aliases.has(key(review.officer_email));

    if (String(body.action || 'list') === 'list') {
      const recovered = await recoverOrphanedReviews(base44, me, aliases, all || []);
      if (recovered.length) all = [...(all || []), ...recovered];
      return Response.json({ success: true, reviews: (all || []).filter(owns), recovered_count: recovered.length });
    }

    const reviews = (all || []).filter(owns);
    if (body.action !== 'acknowledge') return Response.json({ error: 'Unsupported action' }, { status: 400 });

    const review = reviews.find((item: any) => String(item.id) === String(body.review_id || ''));
    if (!review) return Response.json({ error: 'Performance review not found for this officer.' }, { status: 404 });
    const stage = review.workflow_stage || (review.supervisor_review_completed ? 'officer_pending' : 'supervisor_pending');
    if (stage !== 'officer_pending') {
      return Response.json({ error: 'This review is not currently waiting for your response.' }, { status: 409 });
    }

    const signatureUrl = String(body.signature_url || '').trim();
    if (!signatureUrl) return Response.json({ error: 'Your electronic signature is required.' }, { status: 400 });

    const submittedRatings: Record<string, number> = {};
    for (const field of ratingFields) {
      const value = Number(body.ratings?.[field]);
      if (!Number.isFinite(value) || value < 1 || value > 5) {
        return Response.json({ error: 'Complete every self-rating using a value from 1 to 5.' }, { status: 400 });
      }
      submittedRatings[`officer_${field}`] = Math.round(value);
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.PerformanceReview.update(review.id, {
      ...submittedRatings,
      officer_acknowledged: true,
      officer_comments: String(body.officer_comments || '').trim(),
      officer_signature_url: signatureUrl,
      officer_signed_at: now,
      officer_acknowledged_at: now,
      officer_acknowledged_by_id: me.id,
      officer_signature_obtained: true,
      workflow_stage: 'hr_approval_pending',
    });

    const users = await base44.asServiceRole.entities.User.list(undefined, 5000);
    const hrRecipients = new Set<string>();
    if (review.reviewer_email) hrRecipients.add(key(review.reviewer_email));
    for (const user of users || []) {
      const roles = rolesOf(user);
      if (active(user) && (user.role === 'admin' || roles.has('hr') || roles.has('full_access')) && user.email) {
        hrRecipients.add(key(user.email));
      }
    }
    await Promise.all([...hrRecipients].filter(Boolean).map((recipient) =>
      base44.asServiceRole.entities.Notification.create({
        recipient_email: recipient,
        type: 'training_reminder',
        title: 'Performance Review Awaiting HR Approval',
        message: `${review.officer_name || me.full_name || me.email} submitted self-ratings, comments, and an electronic signature. Open HR Performance Reviews to finalize the rating.`,
        priority: 'high',
        related_id: review.id,
        source_name: 'Performance Reviews',
      }).catch(() => null)
    ));

    return Response.json({ success: true, workflow_stage: 'hr_approval_pending' });
  } catch (error) {
    console.error('manageOfficerPerformanceReviews failed', error);
    return Response.json({ error: error?.message || 'Unable to manage officer performance reviews' }, { status: 500 });
  }
});
