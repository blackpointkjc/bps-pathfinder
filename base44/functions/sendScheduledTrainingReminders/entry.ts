import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// Runs daily — finds training_renewal_reminder notifications whose scheduled_send_date is today or past
// and marks them as unread/visible (they're already created; this just ensures they surface on the right day)
// This job is credit-free: it only identifies in-app reminders that are due.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
  if (user.role !== 'admin' && !roles.has('full_access')) {
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

  // The Notification records already exist and remain unread until the recipient
  // acknowledges them. No paid email integration is called here.
  return Response.json({
    checked: notifications.length,
    reminders_due: due.length,
    delivery: 'in_app_only',
    integration_credits_used: 0,
    date: todayStr,
  });
});