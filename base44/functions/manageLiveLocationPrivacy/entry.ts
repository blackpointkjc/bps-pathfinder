import { createClientFromRequest } from 'npm:@base44/sdk';
import { canHideLiveLocation, isLiveLocationHidden, clearedLivePosition } from './privacy.ts';

Deno.serve(async (req) => {
  let stage = 'authentication';
  let savedVisibility: any = null;
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
      return Response.json({ success: true, eligible, hidden: await isLiveLocationHidden(base44, user), status: user.status, officer_id: user.id, email: user.email, last_updated: user.status_since || user.last_updated });
    }
    if (body.action !== 'set' || typeof body.hidden !== 'boolean') {
      return Response.json({ error: 'A boolean hidden setting is required' }, { status: 400 });
    }
    if (!eligible) return Response.json({ error: 'Only Colonel Hiers may hide his own live location. All other personnel must share it.' }, { status: 403 });
    stage = 'read visibility setting';
    const settings = await base44.asServiceRole.entities.LiveLocationPrivacy.filter({ user_id: user.id }, '-updated_date', 100);
    const patch = { user_id: user.id, officer_email: String(user.email).trim().toLowerCase(), hidden: body.hidden };
    stage = 'save visibility setting';
    for (const row of settings) {
      if (row.hidden !== body.hidden || row.officer_email !== patch.officer_email) {
        await base44.asServiceRole.entities.LiveLocationPrivacy.update(row.id, patch);
      }
    }
    if (!settings.length) await base44.asServiceRole.entities.LiveLocationPrivacy.create(patch);
    // Once committed, this is authoritative even if a secondary cleanup is
    // throttled. Return it in the error instead of forcing another queued read.
    savedVisibility = { eligible, hidden: body.hidden, status: user.status, officer_id: user.id, email: user.email, last_updated: user.status_since || user.last_updated };
    stage = 'sync live visibility';
    const sessions = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: patch.officer_email }, '-last_update', 100);
    for (const row of sessions) {
      if (body.hidden) {
        const needsScrub = row.live_location_hidden !== true || row.live_location_privacy_user_id !== user.id
          || Object.entries(row).some(([key, value]) => /latitude|longitude/.test(key) && value != null);
        if (needsScrub) await base44.asServiceRole.entities.ActiveOfficer.update(row.id, clearedLivePosition);
      } else if (row.live_location_hidden === true || row.live_location_privacy_user_id) {
        // Sharing controls never own duty status, heartbeat times or session activity.
        await base44.asServiceRole.entities.ActiveOfficer.update(row.id, {
          live_location_hidden: false, live_location_privacy_user_id: '',
          ...(row.current_location === 'Live location hidden' ? { current_location: 'Awaiting GPS' } : {}),
        });
      }
    }
    if (body.hidden) {
      // Only scrub fields actually containing a legacy location. Repeating null
      // writes to User and every Unit on each click needlessly exhausted the API.
      const legacyFields = ['latitude','longitude','current_latitude','current_longitude','last_known_latitude','last_known_longitude','last_known_location'];
      const legacyPatch = Object.fromEntries(legacyFields.filter(key => user[key] != null && user[key] !== '').map(key => [key, key === 'last_known_location' ? '' : null]));
      if (Object.keys(legacyPatch).length) {
        stage = 'clear legacy user location';
        await base44.asServiceRole.entities.User.update(user.id, legacyPatch);
      }
      stage = 'clear unit locations';
      const units = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 100);
      for (const row of units) if (row.current_latitude != null || row.current_longitude != null) {
        await base44.asServiceRole.entities.Unit.update(row.id, { current_latitude: null, current_longitude: null });
      }
      stage = 'clear active distress locations';
      const alerts = await base44.asServiceRole.entities.OfficerDistress.filter({ officer_id: user.id, status: 'active' }, '-activated_at', 100);
      for (const row of alerts) if ([row.latitude,row.longitude,row.current_latitude,row.current_longitude].some(value => value != null)) {
        await base44.asServiceRole.entities.OfficerDistress.update(row.id, {
          latitude: null, longitude: null, current_latitude: null, current_longitude: null, location_description: 'Live location hidden',
        });
      }
    }
    return Response.json({ success: true, eligible, hidden: body.hidden, status: user.status, officer_id: user.id, email: user.email, last_updated: user.status_since || user.last_updated });
  } catch (error: any) {
    const throttled = error?.status === 429 || error?.response?.status === 429 || /rate limit|too many requests|\b429\b/i.test(String(error?.message || error));
    console.error('[manageLiveLocationPrivacy]', stage, error);
    return Response.json({ error: error?.message || 'Unable to change live location visibility', stage, ...(savedVisibility ? { ...savedVisibility, visibility_saved: true, cleanup_pending: true } : {}), ...(throttled ? { retry_after_ms: 60000 } : {}) }, { status: throttled ? 429 : 500 });
  }
});
