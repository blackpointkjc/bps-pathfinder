import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('supervisor') || roles.has('dispatch');
    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { officer_id, action = 'force_oos', reason = '' } = await req.json();
    if (!['force_oos', 'release', 'list'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });

    if (action === 'list') {
      const overrides = await base44.asServiceRole.entities.OfficerStatusOverride.filter({ active: true }, '-forced_at', 500);
      return Response.json({
        success: true,
        overrides: (overrides || []).map((entry: any) => ({
          officer_id: entry.officer_id,
          officer_email: entry.officer_email,
          reason: entry.reason || '',
          forced_by_name: entry.forced_by_name || entry.forced_by_email || '',
          forced_at: entry.forced_at,
        })),
      });
    }

    if (!officer_id) return Response.json({ error: 'officer_id required' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const officer = (users || []).find((entry: any) => entry.id === officer_id);
    if (!officer) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const now = new Date().toISOString();
    const actorName = [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
    const existing = await base44.asServiceRole.entities.OfficerStatusOverride.filter({ officer_id, active: true }, '-forced_at', 1);
    const override = existing?.[0];

    if (action === 'force_oos') {
      if (override) {
        await base44.asServiceRole.entities.OfficerStatusOverride.update(override.id, {
          forced_out_of_service: true,
          reason: String(reason || '').trim(),
          forced_by_email: user.email,
          forced_by_name: actorName,
          forced_at: now,
          active: true,
          released_by_email: '',
          released_at: null,
        });
      } else {
        await base44.asServiceRole.entities.OfficerStatusOverride.create({
          officer_id,
          officer_email: officer.email,
          forced_out_of_service: true,
          reason: String(reason || '').trim(),
          forced_by_email: user.email,
          forced_by_name: actorName,
          forced_at: now,
          active: true,
        });
      }

      await base44.asServiceRole.entities.User.update(officer_id, {
        status: 'Out of Service',
        last_updated: now,
        current_call_id: null,
        current_call_info: null,
      });

      // Keep the legacy/live Unit entity synchronized too so map/dispatch views
      // cannot continue showing the officer as Available from a second status source.
      const units = await base44.asServiceRole.entities.Unit.list(undefined, 500);
      const officerUnits = (units || []).filter((unit: any) =>
        unit.user_id === officer_id || String(unit.user_email || '').toLowerCase() === String(officer.email || '').toLowerCase()
      );
      await Promise.all(officerUnits.map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
        status: 'Out of Service',
        last_updated: now,
        last_update_at: now,
      })));

      await base44.asServiceRole.entities.Notification.create({
        recipient_email: officer.email,
        type: 'status_override',
        title: 'You Have Been Placed Out of Service',
        message: `Your duty status was placed Out of Service by ${actorName}.${reason ? ` Reason: ${String(reason).trim()}` : ''} You cannot change your status until an authorized user releases the override.`,
        priority: 'high',
        is_read: false,
      });

      return Response.json({ success: true, status: 'Out of Service', forced: true });
    }

    if (override) {
      await base44.asServiceRole.entities.OfficerStatusOverride.update(override.id, {
        active: false,
        forced_out_of_service: false,
        released_by_email: user.email,
        released_at: now,
      });
    }

    await base44.asServiceRole.entities.User.update(officer_id, {
      status: 'Available',
      last_updated: now,
      current_call_id: null,
      current_call_info: null,
    });

    const units = await base44.asServiceRole.entities.Unit.list(undefined, 500);
    const officerUnits = (units || []).filter((unit: any) =>
      unit.user_id === officer_id || String(unit.user_email || '').toLowerCase() === String(officer.email || '').toLowerCase()
    );
    await Promise.all(officerUnits.map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
      status: 'Available',
      last_updated: now,
      last_update_at: now,
    })));

    await base44.asServiceRole.entities.Notification.create({
      recipient_email: officer.email,
      type: 'status_override',
      title: 'Out of Service Override Released',
      message: `Your forced Out of Service status was released by ${actorName}. Your status is now Available.`,
      priority: 'normal',
      is_read: false,
    });

    return Response.json({ success: true, status: 'Available', forced: false });
  } catch (error) {
    console.error('forceOfficerStatus failed', error);
    return Response.json({ error: error?.message || 'Unable to update officer status' }, { status: 500 });
  }
});
