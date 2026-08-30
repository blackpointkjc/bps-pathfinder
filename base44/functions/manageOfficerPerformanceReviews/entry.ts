import { createClientFromRequest } from 'npm:@base44/sdk';
import { buildPerformanceMetrics, reviewPayloadFromMetrics } from './metrics.ts';

const key = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const active = (user: any) => user && user.employment_status !== 'terminated' && user.employment_status !== 'on_leave' && !user.termination_date;
const displayName = (user: any) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.email || 'Supervisor';
const RANK_ORDER = ['colonel', 'lt colonel', 'major', 'captain', 'lieutenant', 'first sergeant', 'sergeant', 'corporal', 'senior officer', 'officer', 'unarmed officer'];
const normalizeRank = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\./g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return normalized === 'lieutenant colonel' ? 'lt colonel' : normalized;
};
const rankLevel = (user: any) => RANK_ORDER.indexOf(normalizeRank(user?.rank));
const reviewerOutranks = (reviewer: any, officer: any) => {
  const reviewerLevel = rankLevel(reviewer);
  const officerLevel = rankLevel(officer);
  return reviewerLevel >= 0 && officerLevel >= 0 && reviewerLevel < officerLevel;
};
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
  const higherRanked = (users || []).filter((user: any) =>
    active(user) &&
    String(user.id || '') !== String(officer.id || '') &&
    rolesOf(user).has('supervisor') &&
    reviewerOutranks(user, officer)
  );
  if (!higherRanked.length) return null;
  const directSupervisor = higherRanked.find((user: any) => String(user.id || '') === String(officer.supervisor_id || ''));
  if (directSupervisor) return directSupervisor;
  const closestLevel = Math.max(...higherRanked.map(rankLevel));
  const eligible = higherRanked.filter((user: any) => rankLevel(user) === closestLevel);

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const roles = rolesOf(me);
    let officer = me;
    if (action === 'list' && body.preview_user_id) {
      if (me.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Preview access denied' }, { status: 403 });
      officer = await base44.asServiceRole.entities.User.get(String(body.preview_user_id)).catch(() => null);
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
    }
    // Signing must be fast and deterministic. The immutable officer ID survives
    // email/Microsoft migrations, so fetch only the requested review on acknowledge.
    const aliases = action === 'list'
      ? await identity(base44, officer)
      : new Set([me.email, me.work_email, me.microsoft_email, me.outlook_email].map(key).filter(Boolean));
    let all = action === 'acknowledge' && body.review_id
      ? [await base44.asServiceRole.entities.PerformanceReview.get(String(body.review_id))]
      : await base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000);
    all = (all || []).filter(Boolean);
    const owns = (review: any) => String(review.officer_id || '') === String(officer.id || '') || aliases.has(key(review.officer_email));

    if (action === 'list') {
      return Response.json({ success: true, reviews: (all || []).filter(owns) });
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
    const updatedReview = await base44.asServiceRole.entities.PerformanceReview.update(review.id, {
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

    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const hrRecipients = new Set<string>();
    if (review.reviewer_email) hrRecipients.add(key(review.reviewer_email));
    for (const user of users || []) {
      const roles = rolesOf(user);
      if (active(user) && (user.role === 'admin' || roles.has('hr') || roles.has('full_access')) && user.email) {
        hrRecipients.add(key(user.email));
      }
    }
    const notificationWork = Promise.all([...hrRecipients].filter(Boolean).slice(0, 100).map((recipient) =>
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
    // The review is already safely saved. Do not hold the officer's response open
    // indefinitely while secondary HR notifications fan out.
    await Promise.race([
      notificationWork,
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);

    return Response.json({ success: true, workflow_stage: 'hr_approval_pending', review: updatedReview || { ...review, ...submittedRatings, officer_acknowledged: true, officer_comments: String(body.officer_comments || '').trim(), officer_signature_url: signatureUrl, officer_signed_at: now, officer_acknowledged_at: now, officer_acknowledged_by_id: me.id, officer_signature_obtained: true, workflow_stage: 'hr_approval_pending' } });
  } catch (error) {
    console.error('manageOfficerPerformanceReviews failed', error);
    return Response.json({ error: error?.message || 'Unable to manage officer performance reviews' }, { status: 500 });
  }
});