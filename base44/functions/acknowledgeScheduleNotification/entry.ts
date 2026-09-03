import { createClientFromRequest } from 'npm:@base44/sdk';

const normalized = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id || !user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = String(body.notification_id || '').trim();
    if (!notificationId) {
      return Response.json({ error: 'Notification ID is required.' }, { status: 400 });
    }

    const notification = await base44.asServiceRole.entities.Notification.get(notificationId);
    if (!notification?.id) {
      return Response.json({ success: true, notification_id: notificationId, already_removed: true });
    }

    const roles = new Set([
      normalized(user.role),
      ...(Array.isArray(user.additional_roles) ? user.additional_roles.map(normalized) : []),
    ]);
    const isAdmin = roles.has('admin') || roles.has('full_access');
    if (!isAdmin && normalized(notification.recipient_email) !== normalized(user.email)) {
      return Response.json({ error: 'You cannot acknowledge another user\'s notification.' }, { status: 403 });
    }

    const acknowledgedAt = new Date().toISOString();
    const unreadForRecipient = await base44.asServiceRole.entities.Notification.filter({
      recipient_email: notification.recipient_email,
      is_read: false,
    }, '-created_date', 500);
    const duplicateIds = (unreadForRecipient || []).filter((record: any) =>
      String(record.id) === notificationId
      || (
        notification.related_id
        && String(record.related_id || '') === String(notification.related_id)
        && String(record.type || '') === String(notification.type || '')
      )
    ).map((record: any) => String(record.id));

    await Promise.all([...new Set([notificationId, ...duplicateIds])].map(id =>
      base44.asServiceRole.entities.Notification.update(id, {
        is_read: true,
        acknowledged_at: acknowledgedAt,
        requires_acknowledgment: false,
      })
    ));

    return Response.json({
      success: true,
      notification_id: notificationId,
      acknowledged_at: acknowledgedAt,
      cleared_count: new Set([notificationId, ...duplicateIds]).size,
    });
  } catch (error) {
    console.error('acknowledgeScheduleNotification failed', error);
    return Response.json({
      error: error?.message || 'Unable to acknowledge the schedule notification.',
    }, { status: 500 });
  }
});
