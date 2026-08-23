import { createClientFromRequest } from 'npm:@base44/sdk';

const LOGO_URL = 'https://bpspf.blackpointkjc.com/black-point-shield.webp';
const PORTAL_SCHEDULE_URL = 'https://bpspf.blackpointkjc.com/Schedule';

const safe = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function blackPointEmail(subject: string, content: string) {
  const year = new Date().getFullYear();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(subject)}</title></head><body style="margin:0;padding:0;background-color:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0b0b0b;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background-color:#151515;border:1px solid #caa72d;border-radius:14px;overflow:hidden;"><tr><td align="center" style="padding:30px 24px 20px;background-color:#050505;"><img src="${LOGO_URL}" alt="Black Point" width="210" style="display:block;width:210px;max-width:75%;height:auto;border:0;"></td></tr><tr><td style="height:5px;background-color:#d4af37;"></td></tr><tr><td style="padding:34px 38px 12px;"><h1 style="margin:0 0 16px;color:#ffffff;font-size:28px;line-height:1.25;text-align:center;">${safe(subject)}</h1><div style="color:#d7d7d7;font-size:16px;line-height:1.65;">${content}</div></td></tr><tr><td align="center" style="padding:10px 38px 8px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 22px;"><tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;"><a href="${PORTAL_SCHEDULE_URL}" target="_blank" style="display:inline-block;padding:15px 30px;color:#090909;font-size:16px;font-weight:bold;text-decoration:none;border-radius:6px;">Review My Schedule</a></td></tr></table></td></tr><tr><td style="padding:24px 38px 34px;"><p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:bold;">Black Point</p><p style="margin:0;color:#bdbdbd;font-size:14px;line-height:1.6;">701 E Franklin St, Suite 105 1052<br>Richmond, Virginia 23219<br><a href="mailto:info@blackpointkjc.com" style="color:#e5c75b;text-decoration:none;">info@blackpointkjc.com</a><br><a href="tel:+18558277911" style="color:#e5c75b;text-decoration:none;">(855) 8BPS911</a></p></td></tr><tr><td align="center" style="padding:22px 24px;background-color:#050505;border-top:1px solid #292929;"><p style="margin:0;color:#666666;font-size:11px;">© ${year} Black Point. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;
}

const sundayFor = (dateText: string) => {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
};

const shiftSummary = (shift: any) => {
  if (!shift) return '';
  return `${shift.shift_date || 'Date not set'} · ${[shift.start_time, shift.end_time].filter(Boolean).join(' - ') || 'Time not set'} · ${shift.location || 'Location not set'}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((actor.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (!(actor.role === 'admin' || roles.has('full_access') || roles.has('supervisor'))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const changeType = String(body.change_type || 'updated').toLowerCase();
    const before = body.before || null;
    const after = body.after || null;
    const officerEmail = String(body.officer_email || after?.officer_email || before?.officer_email || '').trim().toLowerCase();
    const shiftDate = String(after?.shift_date || before?.shift_date || '');
    if (!officerEmail || officerEmail === 'open' || !shiftDate) return Response.json({ success: true, skipped: true });

    const statuses = await base44.asServiceRole.entities.ScheduleWeekStatus.list(undefined, 1000);
    const publication = (statuses || []).find((status: any) => status.week_start_date === sundayFor(shiftDate));
    const withheld = new Set((publication?.unpublished_officer_emails || []).map((email: string) => String(email).toLowerCase()));
    if (!publication?.is_ready || withheld.has(officerEmail)) return Response.json({ success: true, skipped: true, reason: 'unpublished' });

    const users = await base44.asServiceRole.entities.User.list(undefined, 2000);
    const officer = (users || []).find((person: any) => String(person.email || '').toLowerCase() === officerEmail);
    if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const previous = shiftSummary(before);
    const current = shiftSummary(after);

    const subject = changeType === 'removed' ? 'Schedule Update - Shift Removed' : changeType === 'added' ? 'Schedule Update - Shift Added' : 'Schedule Update - Shift Changed';
    const plainDetail = changeType === 'removed'
      ? `A shift was removed from your published schedule.\n\nRemoved: ${previous}`
      : changeType === 'added'
        ? `A new shift was added to your published schedule.\n\nAdded: ${current}`
        : `Your published schedule was changed.\n\nPrevious: ${previous}\nUpdated: ${current}`;

    const htmlDetail = changeType === 'removed'
      ? `<p>A shift was removed from your published schedule.</p><p><strong>Removed:</strong><br>${safe(previous)}</p>`
      : changeType === 'added'
        ? `<p>A new shift was added to your published schedule.</p><p><strong>Added:</strong><br>${safe(current)}</p>`
        : `<p>Your published schedule was changed.</p><p><strong>Previous:</strong><br>${safe(previous)}</p><p><strong>Updated:</strong><br>${safe(current)}</p>`;

    // Credit-free: deliver the schedule change as an in-app notification only.
    // The branded SendEmail call was removed to stop integration-credit usage;
    // officers still receive a high-priority notification they must acknowledge.
    await base44.asServiceRole.entities.Notification.create({
      recipient_email: officer.email,
      type: 'schedule_changed',
      title: subject,
      message: `${plainDetail}\n\nPlease review My Schedule and acknowledge this update.`,
      priority: 'high',
      is_read: false,
      requires_acknowledgment: true,
      source_name: 'System Scheduling',
    });

    return Response.json({ success: true, notified: officer.email });
  } catch (error) {
    console.error('notifyScheduleChange failed', error);
    return Response.json({ error: error?.message || 'Unable to send schedule change notification' }, { status: 500 });
  }
});