import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((caller.additional_roles || []).map((role: unknown) => lower(role)));
    if (caller.role !== 'admin' && !roles.has('full_access')) {
      return Response.json({ error: 'Administrator access is required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const userId = String(body.user_id || '').trim();
    const reason = String(body.reason || '').trim();
    if (!userId) return Response.json({ error: 'Target user is required' }, { status: 400 });
    if (!reason) return Response.json({ error: 'A force sign-out reason is required' }, { status: 400 });
    if (userId === caller.id) return Response.json({ error: 'You cannot force sign out your own administrative session' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list(undefined, 2000);
    const target = (users || []).find((entry: any) => entry.id === userId);
    if (!target?.email) return Response.json({ error: 'Target user was not found' }, { status: 404 });

    const now = new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const actorName = [caller.rank, caller.last_name].filter(Boolean).join(' ') || caller.full_name || caller.email;

    const earlier = await base44.asServiceRole.entities.UserSessionControl.filter({
      user_id: userId,
      action: 'force_sign_out',
      active: true,
    }, '-issued_at', 100).catch(() => []);
    for (const record of earlier || []) {
      await base44.asServiceRole.entities.UserSessionControl.update(record.id, { active: false }).catch(() => null);
    }

    const sessionControl = await base44.asServiceRole.entities.UserSessionControl.create({
      user_id: userId,
      user_email: lower(target.email),
      action: 'force_sign_out',
      reason,
      issued_by_id: caller.id,
      issued_by_email: lower(caller.email),
      issued_by_name: actorName,
      issued_at: issuedAt,
      expires_at: expiresAt,
      active: true,
    });

    await base44.asServiceRole.entities.User.update(userId, {
      status: 'Out of Service',
      status_since: issuedAt,
      last_updated: issuedAt,
      current_call_id: null,
      current_call_info: null,
    });

    const activeOfficers = await base44.asServiceRole.entities.ActiveOfficer.list(undefined, 1000).catch(() => []);
    const targetSessions = (activeOfficers || []).filter((entry: any) => lower(entry.officer_email) === lower(target.email));
    for (const session of targetSessions) {
      await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
        session_active: false,
        status: 'Out of Service',
        last_update: issuedAt,
        gps_updated_at: null,
        latitude: null,
        longitude: null,
        heading: null,
        speed: 0,
        accuracy: null,
        current_call_info: '',
      }).catch(() => null);
    }

    const units = await base44.asServiceRole.entities.Unit.list(undefined, 1000).catch(() => []);
    const targetUnits = (units || []).filter((unit: any) =>
      unit.user_id === userId || lower(unit.user_email) === lower(target.email)
    );
    for (const unit of targetUnits) {
      await base44.asServiceRole.entities.Unit.update(unit.id, {
        status: 'Out of Service',
        assigned_call_ids: [],
        last_updated: issuedAt,
        last_update_at: issuedAt,
      }).catch(() => null);
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'User',
      entity_id: userId,
      action: 'status_change',
      actor_id: caller.id,
      actor_name: actorName,
      before_value: JSON.stringify({ status: target.status || '', session_active: true }),
      after_value: JSON.stringify({ status: 'Out of Service', session_active: false, action: 'force_sign_out' }),
      field_changed: 'authenticated_session',
      timestamp: issuedAt,
      description: `Forced sign-out issued for ${target.email}. Reason: ${reason}`,
    }).catch(() => null);

    return Response.json({
      success: true,
      session_control_id: sessionControl.id,
      user_id: userId,
      user_email: target.email,
      expires_at: expiresAt,
      retired_live_sessions: targetSessions.length,
    });
  } catch (error) {
    console.error('forceUserSignOut failed', error);
    return Response.json({ error: error?.message || 'Unable to force sign out the selected user' }, { status: 500 });
  }
});
