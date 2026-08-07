import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { blackPointEmail } from '../_shared/blackPointEmail.ts';

const PORTAL_SCHEDULE_URL = 'https://bpspf.blackpointkjc.com/Schedule';

const safe = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const sundayFor = (dateText: string) => {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
};

const shiftSummary = (shift: any) => {
  if (!shift) return '';
  const date = shift.shift_date || 'Date not set';
  const time = [shift.start_time, shift.end_time].filter(Boolean).join(' - ') || 'Time not set';
  const location = shift.location || 'Location not set';
  return `${date} · ${time} · ${location}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((actor.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = actor.role === 'admin' || roles.has('full_access') || roles.has('supervisor');
    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const changeType = String(body.change_type || 'updated').toLowerCase();
    if (!['added', 'updated', 'removed'].includes(changeType)) {
      return Response.json({ error: 'Invalid change_type' }, { status: 400 });
    }

    const before = body.before || null;
    const after = body.after || null;
    const officerEmail = String(body.officer_email || after?.officer_email || before?.officer_email || '').trim().toLowerCase();
    const shiftDate = String(after?.shift_date || before?.shift_date || '');
    if (!officerEmail || officerEmail === 'open' || !shiftDate) {
      return Response.json({ success: true, skipped: true, reason: 'No officer/date' });
    }

    const weekStart = sundayFor(shiftDate);
    const statuses = await base44.asServiceRole.entities.ScheduleWeekStatus.list(undefined, 1000);
    const publication = (statuses || []).find((status: any) => status.week_start_date === weekStart);
    const withheld = new Set((publication?.unpublished_officer_emails || []).map((email: string) => String(email).toLowerCase()));
    if (!publication?.is_ready || withheld.has(officerEmail)) {
      return Response.json({ success: true, skipped: true, reason: 'Schedule not published for officer' });
    }

    const users = await base44.asServiceRole.entities.User.list(undefined, 2000);
    const officer = (users || []).find((person: any) => String(person.email || '').toLowerCase() === officerEmail);
    if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const actorName = [actor.rank, actor.last_name].filter(Boolean).join(' ') || actor.full_name || actor.email || 'Scheduling';
    const recipientName = [officer.rank, officer.last_name].filter(Boolean).join(' ') || officer.full_name || officer.email;
    const previous = shiftSummary(before);
    const current = shiftSummary(after);

    const plainDetail = changeType === 'removed'
      ? `A shift was removed from your published schedule.\n\nRemoved: ${previous}`
      : changeType === 'added'
        ? `A new shift was added to your published schedule.\n\nAdded: ${current}`
        : `Your published schedule was changed.\n\nPrevious: ${previous}\nUpdated: ${current}`;

    const subject = changeType === 'removed' ? 'Schedule Update - Shift Removed'
      : changeType === 'added' ? 'Schedule Update - Shift Added'
      : 'Schedule Update - Shift Changed';

    const htmlDetail = changeType === 'removed'
      ? `<p>A shift was removed from your published schedule.</p><p><strong>Removed:</strong><br>${safe(previous)}</p>`
      : changeType === 'added'
        ? `<p>A new shift was added to your published schedule.</p><p><strong>Added:</strong><br>${safe(current)}</p>`
        : `<p>Your published schedule was changed.</p><p><strong>Previous:</strong><br>${safe(previous)}</p><p><strong>Updated:</strong><br>${safe(current)}</p>`;

    const messageText = `SCHEDULE UPDATE\n\n${plainDetail}\n\nPlease review My Schedule. This message requires acknowledgment.`;

    await Promise.all([
      base44.asServiceRole.entities.Message.create({
        sender_id: actor.id || 'scheduling',
        sender_name: actorName,
        recipient_id: officer.id,
        recipient_name: recipientName,
        message: messageText,
        read: false,
        message_type: 'schedule_update',
        thread_id: `schedule:${officer.id}`,
        participant_ids: [actor.id || 'scheduling', officer.id],
        participant_names: [actorName, recipientName],
      }),
      base44.asServiceRole.entities.Notification.create({
        recipient_email: officer.email,
        type: 'schedule_changed',
        title: subject,
        message: plainDetail,
        priority: 'high',
        is_read: false,
      }),
      base44.asServiceRole.integrations.Core.SendEmail({
        to: officer.email,
        subject,
        body: blackPointEmail(
          subject,
          `<p>Hello ${safe(officer.first_name || 'Officer')},</p>${htmlDetail}<p>Please review your current schedule in the Black Point Portal. If anything appears incorrect, contact your supervisor.</p>`,
          'Review My Schedule',
          PORTAL_SCHEDULE_URL,
        ),
      }),
    ]);

    return Response.json({ success: true, notified: officer.email, change_type: changeType });
  } catch (error) {
    console.error('notifyScheduleChange failed', error);
    return Response.json({ error: error?.message || 'Unable to send schedule-change notification' }, { status: 500 });
  }
});