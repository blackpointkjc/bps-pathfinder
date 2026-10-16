import { createClientFromRequest } from 'npm:@base44/sdk';
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

  // Create missing reminders directly from saved officer credential profiles.
  // This does not require a CertificationTodo row or duplicate the credential.
  const officers = await base44.asServiceRole.entities.User.list('-updated_date', 1500);
  const previous = await base44.asServiceRole.entities.Notification.filter({ type:'training_renewal_reminder' }, '-created_date', 3000);
  const knownKeys = new Set((previous || []).map((row:any) => String(row.event_key || row.related_id || '')));
  let created = 0;
  const cutoff = new Date(today.getTime() + 90*86400000).toISOString().slice(0,10);
  for (const officer of officers || []) {
    if (!officer?.email || officer.termination_date) continue;
    const credentials = Array.isArray(officer.officer_certifications) ? officer.officer_certifications : [];
    for (const credential of credentials) {
      const expiration = String(credential.expiration_date || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration) || expiration > cutoff) continue;
      const label = String(credential.training_name || credential.name || credential.course_id || 'Certification');
      const normalized = String(credential.course_id || label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const key = `renewal:${officer.id}:${normalized}:${expiration}`;
      if (knownKeys.has(key)) continue;
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: officer.email, type:'training_renewal_reminder',
        title: expiration < todayStr ? 'Certification expired — action required' : 'Certification renewal approaching',
        message:`${label} expires on ${expiration}. Contact Training/HR to arrange renewal.`,
        is_read:false, priority:expiration < todayStr ? 'critical':'high',
        related_id:key, event_key:key, source_name:'Training Compliance',
        requires_acknowledgment:true,
      });
      knownKeys.add(key);
      created++;
    }
  }

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
    reminders_created: created,
    reminders_due: due.length,
    delivery: 'in_app_only',
    integration_credits_used: 0,
    date: todayStr,
  });
});