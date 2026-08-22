import { createClientFromRequest } from 'npm:@base44/sdk';

const key = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const active = (user: any) => user && user.employment_status !== 'terminated' && user.employment_status !== 'on_leave' && !user.termination_date;
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const aliases = await identity(base44, me);
    const all = await base44.asServiceRole.entities.PerformanceReview.list('-review_date', 1000);
    const owns = (review: any) => String(review.officer_id || '') === String(me.id || '') || aliases.has(key(review.officer_email));
    const reviews = (all || []).filter(owns);

    if (String(body.action || 'list') === 'list') {
      return Response.json({ success: true, reviews });
    }
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
