import { createClientFromRequest } from 'npm:@base44/sdk';
import { buildPerformanceMetrics, reviewPayloadFromMetrics } from './metrics.ts';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
const dateOnly = (value = new Date()) => value.toISOString().slice(0, 10);

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

async function createNotifications(base44: any, officer: any, users: any[], review: any) {
  const recipients = new Set<string>([officer.email].filter(Boolean));
  const supervisor = (users || []).find((user: any) => String(user.id || '') === String(officer.supervisor_id || ''));
  if (supervisor?.email) recipients.add(supervisor.email);
  for (const recipient of recipients) {
    const isOfficer = emailKey(recipient) === emailKey(officer.email);
    await base44.asServiceRole.entities.Notification.create({
      recipient_email: recipient,
      type: 'training_reminder',
      title: isOfficer ? 'Performance Review Available' : 'Performance Review Requires Supervisor Meeting',
      message: isOfficer
        ? `Your performance review for ${review.review_period_start} through ${review.review_period_end} is ready.`
        : `Review ${review.officer_name}'s performance report and complete the officer meeting and signature.`,
      priority: 'high',
      related_id: review.id,
      source_name: 'Performance Reviews',
    }).catch(() => null);
  }
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
    const start = String(body.review_period_start || '').slice(0, 10);
    const end = String(body.review_period_end || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      return Response.json({ error: 'Select a valid review start and end date.' }, { status: 400 });
    }

    const { officer, users } = await resolveOfficer(base44, body.officer_id, body.officer_email);
    if (!officer || officer.employment_status === 'terminated' || officer.termination_date) {
      return Response.json({ error: 'Active officer could not be found.' }, { status: 404 });
    }

    const metrics = await buildPerformanceMetrics(base44, officer, start, end);
    if (action === 'preview') return Response.json({ success: true, metrics });
    if (action !== 'create') return Response.json({ error: 'Unsupported action.' }, { status: 400 });

    const payload = {
      ...reviewPayloadFromMetrics(metrics, body.review || {}),
      review_type: 'manual',
      review_date: dateOnly(),
      reviewer_email: me.email,
      reviewer_name: `${me.first_name || ''} ${me.last_name || ''}`.trim() || me.full_name || me.email,
    };
    const review = await base44.asServiceRole.entities.PerformanceReview.create(payload);
    await createNotifications(base44, officer, users || [], review);

    try {
      await base44.integrations.Core.SendEmail({
        to: officer.email,
        subject: `Performance Review - ${start} through ${end}`,
        body: `Your Black Point Security performance review for ${start} through ${end} is available in Pathfinder. Overall rating: ${payload.overall_rating}/5. Please open Officer Performance and acknowledge the review.`,
      });
    } catch (error) {
      console.warn('Performance review email could not be sent; in-app notification was created.', error?.message || error);
    }

    return Response.json({ success: true, review, metrics });
  } catch (error) {
    console.error('managePerformanceReviews failed', error);
    return Response.json({ error: error?.message || 'Unable to manage performance reviews' }, { status: 500 });
  }
});
