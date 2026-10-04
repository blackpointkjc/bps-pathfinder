import { createClientFromRequest } from 'npm:@base44/sdk';
import { canHideLiveLocation, isLiveLocationHidden, clearedLivePosition } from './privacy.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const eligible = canHideLiveLocation(user);
    if ((body.user_id && body.user_id !== user.id) || (body.officer_email && body.officer_email !== user.email)) {
      return Response.json({ error: 'You can only control your own live location' }, { status: 403 });
    }
    if ((body.action || 'get') === 'get') {
      return Response.json({ success: true, eligible, hidden: await isLiveLocationHidden(base44, user) });
    }
    if (body.action !== 'set' || typeof body.hidden !== 'boolean') {
      return Response.json({ error: 'A boolean hidden setting is required' }, { status: 400 });
    }
    if (!eligible) return Response.json({ error: 'Only Colonel Hiers may hide his own live location. All other personnel must share it.' }, { status: 403 });
    const settings = await base44.asServiceRole.entities.LiveLocationPrivacy.filter({ user_id: user.id }, '-updated_date', 100);
    const patch = { user_id: user.id, officer_email: String(user.email).trim().toLowerCase(), hidden: body.hidden };
    if (settings.length) await Promise.all(settings.map((row: any) => base44.asServiceRole.entities.LiveLocationPrivacy.update(row.id, patch)));
    else await base44.asServiceRole.entities.LiveLocationPrivacy.create(patch);
    // Clear all device sessions; re-enabling waits for a fresh accepted GPS fix.
    const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: patch.officer_email }, '-last_update', 100);
    await Promise.all(sessions.map((row: any) => base44.asServiceRole.entities.ActiveOfficer.update(row.id, {
      ...clearedLivePosition, live_location_hidden: body.hidden, live_location_privacy_user_id: body.hidden ? user.id : '',
      current_location: body.hidden ? 'Live location hidden' : 'Awaiting GPS',
      last_update: new Date().toISOString(),
    })));
    if (body.hidden) {
      await base44.asServiceRole.entities.User.update(user.id, {
        latitude: null, longitude: null, current_latitude: null, current_longitude: null,
        last_known_latitude: null, last_known_longitude: null, last_known_location: '',
      });
      const units = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 100);
      await Promise.all(units.map((row: any) => base44.asServiceRole.entities.Unit.update(row.id, { current_latitude: null, current_longitude: null })));
      const alerts = await base44.asServiceRole.entities.OfficerDistress.filter({ officer_id: user.id, status: 'active' }, '-activated_at', 100);
      await Promise.all(alerts.map((row: any) => base44.asServiceRole.entities.OfficerDistress.update(row.id, {
        latitude: null, longitude: null, current_latitude: null, current_longitude: null, location_description: 'Live location hidden',
      })));
    }
    return Response.json({ success: true, eligible, hidden: body.hidden });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Unable to change live location visibility' }, { status: 500 });
  }
});
