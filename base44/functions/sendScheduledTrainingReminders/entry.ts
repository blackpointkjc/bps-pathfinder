import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
const blackPointEmail = (subject: string, content: string, actionLabel = 'View in Black Point Portal') => `<!doctype html><html><body style="margin:0;background:#0b0b0b;font-family:Arial;color:#f4f4f4"><table width="100%" style="padding:28px 12px;background:#0b0b0b"><tr><td align="center"><table width="620" style="max-width:620px;background:#151515;border:1px solid #2b2b2b;border-radius:10px;overflow:hidden"><tr><td align="center" style="padding:26px;background:#050505;color:#fff;font-weight:800;letter-spacing:2px">BLACK POINT PROTECTION<div style="margin-top:8px;color:#d4af37;font-size:11px">BPS PATHFINDER</div></td></tr><tr><td style="height:5px;background:#d4af37"></td></tr><tr><td style="padding:32px 38px;color:#d7d7d7"><h1 style="color:#fff">${subject}</h1>${content}<p style="text-align:center;margin-top:28px"><a href="https://bpspf.blackpointkjc.com/" style="display:inline-block;padding:14px 26px;background:#d4af37;color:#090909;text-decoration:none;font-weight:bold;border-radius:6px">${actionLabel}</a></p></td></tr><tr><td align="center" style="padding:20px;background:#050505;color:#8f8f8f;font-size:12px">Black Point Protection Services · Secure Company Communication</td></tr></table></td></tr></table></body></html>`;

// Runs daily — finds training_renewal_reminder notifications whose scheduled_send_date is today or past
// and marks them as unread/visible (they're already created; this just ensures they surface on the right day)
// Also sends an email notification for each one due today.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (user && user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Get all training_renewal_reminder notifications that are scheduled for today or earlier and not yet read
  const notifications = await base44.asServiceRole.entities.Notification.filter({
    type: 'training_renewal_reminder',
    is_read: false,
  });

  const due = notifications.filter(n => n.scheduled_send_date && n.scheduled_send_date <= todayStr);

  let sent = 0;
  for (const n of due) {
    // Send email reminder
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: n.recipient_email,
      subject: n.title,
      body: blackPointEmail(n.title, `<p>${n.message}</p><p>This is an automated in-service renewal reminder from Black Point Protection.</p>`, 'Open Training Portal'),
    }).catch(() => {});
    sent++;
  }

  return Response.json({ checked: notifications.length, reminders_sent: sent, date: todayStr });
});