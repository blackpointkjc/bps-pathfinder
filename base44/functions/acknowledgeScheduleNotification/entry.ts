import { createClientFromRequest } from 'npm:@base44/sdk';
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const normalized = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess);
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
      || (notification.event_key && String(record.event_key || '') === String(notification.event_key))
      || (
        notification.related_id
        && String(record.related_id || '') === String(notification.related_id)
        && String(record.type || '') === String(notification.type || '')
      )
    ).map((record: any) => String(record.id));

    const clearedIds = [...new Set([notificationId, ...duplicateIds])];
    // Persist each acknowledgement and surface failures rather than claiming success.
    for (const id of clearedIds) {
      await base44.asServiceRole.entities.Notification.update(id, {
        is_read: true,
        acknowledged_at: acknowledgedAt,
        requires_acknowledgment: false,
      });
    }

    return Response.json({
      success: true,
      notification_id: notificationId,
      acknowledged_at: acknowledgedAt,
      cleared_count: clearedIds.length,
      cleared_ids: clearedIds,
    });
  } catch (error) {
    console.error('acknowledgeScheduleNotification failed', error);
    return Response.json({
      error: error?.message || 'Unable to acknowledge the schedule notification.',
    }, { status: 500 });
  }
});
