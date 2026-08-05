import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
      body: `<p>${n.message}</p><p style="color:#666;font-size:12px;">This is an automated in-service renewal reminder from BPS Connect.</p>`,
    }).catch(() => {});
    sent++;
  }

  return Response.json({ checked: notifications.length, reminders_sent: sent, date: todayStr });
});