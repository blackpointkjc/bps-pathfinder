import { createClientFromRequest } from 'npm:@base44/sdk';
import { buildPerformanceMetrics, reviewPayloadFromMetrics } from './metrics.ts';

const TIME_ZONE = 'America/New_York';
const emailKey = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
const active = (user: any) => user && user.employment_status !== 'terminated' && user.employment_status !== 'on_leave' && !user.termination_date;
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
const displayName = (user: any) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.email || 'Supervisor';

function easternNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return {
    year, month, day, hour: read('hour') % 24,
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function validAnniversary(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function dayBefore(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 86400000).toISOString().slice(0, 10);
}

function isOperational(user: any) {
  const roles = new Set((user?.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
  return user?.employment_status !== 'terminated' && user?.employment_status !== 'on_leave' && !user?.termination_date &&
    Boolean(user?.rank) &&
    (roles.has('officer') || roles.has('supervisor') || user?.role === 'admin');
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
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return tied[values[0] % tied.length];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = easternNow();
    if (now.hour !== 8) {
      return Response.json({ success: true, skipped: true, reason: 'Outside the 8 AM Eastern annual-review window' });
    }

    const [users, existingReviews] = await Promise.all([
      base44.asServiceRole.entities.User.list(undefined, 5000),
      base44.asServiceRole.entities.PerformanceReview.list('-review_date', 5000),
    ]);
    const existingKeys = new Set((existingReviews || []).map((review: any) => String(review.annual_review_key || '')).filter(Boolean));
    let created = 0;
    let notDue = 0;
    let alreadyExists = 0;
    const errors: any[] = [];

    for (const officer of (users || []).filter(isOperational)) {
      const hireMatch = String(officer.hire_date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!hireMatch) { notDue += 1; continue; }
      const hireYear = Number(hireMatch[1]);
      const hireMonth = Number(hireMatch[2]);
      const hireDay = Number(hireMatch[3]);
      if (now.year <= hireYear) { notDue += 1; continue; }

      const dueDate = validAnniversary(now.year, hireMonth, hireDay);
      if (dueDate > now.date) { notDue += 1; continue; }

      const annualKey = `annual:${officer.id}:${now.year}`;
      if (existingKeys.has(annualKey)) { alreadyExists += 1; continue; }

      try {
        const periodStart = validAnniversary(now.year - 1, hireMonth, hireDay);
        const periodEnd = dayBefore(dueDate);
        const metrics = await buildPerformanceMetrics(base44, officer, periodStart, periodEnd);
        const supervisor = chooseRotatingSupervisor(officer, users || [], existingReviews || []);
        const assignmentIssue = supervisor ? '' : `No active supervisor currently outranks ${officer.rank || 'this officer'}.`;
        const reviewerName = supervisor ? displayName(supervisor) : 'Black Point Review Administration';
        const payload = {
          ...reviewPayloadFromMetrics(metrics),
          review_type: 'annual_automatic',
          annual_review_key: annualKey,
          generated_year: now.year,
          review_date: now.date,
          reviewer_email: supervisor?.email || 'performance-reviews@blackpointkjc.com',
          reviewer_name: reviewerName,
          ...(supervisor ? {
            assigned_supervisor_id: supervisor.id,
            assigned_supervisor_email: supervisor.email,
            assigned_supervisor_name: reviewerName,
            supervisor_task_created_at: new Date().toISOString(),
            assignment_round: (existingReviews || []).filter((item: any) => String(item.assigned_supervisor_id || '') === String(supervisor.id)).length + 1,
          } : {}),
          workflow_stage: supervisor ? 'supervisor_pending' : 'higher_reviewer_required',
          higher_reviewer_required: !supervisor,
          assignment_issue: assignmentIssue,
          supervisor_review_pending: Boolean(supervisor),
          supervisor_review_completed: false,
          officer_acknowledged: false,
          officer_signature_obtained: false,
          hr_approved: false,
          supervisor_notes: supervisor
            ? 'Automatically generated from Pathfinder performance statistics for the completed annual review period. Supervisor and HR may add qualitative comments during the review meeting.'
            : `Automatically generated from Pathfinder performance statistics. Assignment is paused because no active supervisor outranks ${officer.rank || 'the officer'}.`,
        };
        const review = await base44.asServiceRole.entities.PerformanceReview.create(payload);
        existingReviews.push(review);
        existingKeys.add(annualKey);

        const adminEmails = supervisor ? [] : (users || [])
          .filter((user: any) => active(user) && user.email && (user.role === 'admin' || rolesOf(user).has('hr') || rolesOf(user).has('full_access')))
          .map((user: any) => user.email);
        const recipients = new Set([officer.email, supervisor?.email, ...adminEmails].filter(Boolean).map(String));
        for (const recipient of recipients) {
          const isOfficer = emailKey(recipient) === emailKey(officer.email);
          await base44.asServiceRole.entities.Notification.create({
            recipient_email: recipient,
            type: 'training_reminder',
            title: !supervisor
              ? (isOfficer ? 'Annual Review Awaiting Higher-Ranking Reviewer' : 'Annual Review Needs Higher-Ranking Reviewer')
              : (isOfficer ? 'Annual Performance Review Available' : 'Annual Performance Review Requires Meeting'),
            message: !supervisor
              ? (isOfficer
                ? `Your annual review for ${periodStart} through ${periodEnd} was generated, but it cannot be assigned downward. It is waiting for a reviewer above ${officer.rank || 'your rank'}.`
                : `${metrics.officer_name}'s annual review cannot be assigned until an active reviewer above ${officer.rank || 'the officer rank'} is available.`)
              : (isOfficer
                ? `Your annual performance review for ${periodStart} through ${periodEnd} is available and was assigned up the chain of command.`
                : `${metrics.officer_name}'s annual performance review was assigned to you because your rank is above the officer's.`),
            priority: 'high',
            related_id: review.id,
            source_name: 'Annual Performance Reviews',
          }).catch(() => null);
        }
        created += 1;
      } catch (error) {
        errors.push({ officer_id: officer.id, officer_email: officer.email, error: error?.message || String(error) });
      }
    }

    return Response.json({ success: true, date: now.date, created, already_exists: alreadyExists, not_due: notDue, errors });
  } catch (error) {
    console.error('generateAnnualPerformanceReviews failed', error);
    return Response.json({ error: error?.message || 'Unable to generate annual performance reviews' }, { status: 500 });
  }
});
