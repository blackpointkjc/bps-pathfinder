import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'activate';
    const officerId = body.officer_id || user.id;
    const isSelf = officerId === user.id;

    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const authorized =
      isSelf ||
      user.role === 'admin' ||
      user.role === 'dispatch' ||
      roles.has('full_access') ||
      roles.has('supervisor') ||
      roles.has('dispatch');
    if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (!['activate', 'clear'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const officer = (users || []).find((u: any) => u.id === officerId);
    if (!officer) return Response.json({ error: 'Officer not found' }, { status: 404 });

    const now = new Date().toISOString();

    const syncStatus = async (status: string) => {
      await base44.asServiceRole.entities.User.update(officer.id, {
        status,
        last_updated: now,
        status_since: now,
      });
      const units = await base44.asServiceRole.entities.Unit.list(undefined, 500);
      const linked = (units || []).filter((u: any) =>
        u.user_id === officer.id ||
        String(u.user_email || '').toLowerCase() === String(officer.email || '').toLowerCase()
      );
      await Promise.all(linked.map((u: any) =>
        base44.asServiceRole.entities.Unit.update(u.id, {
          status,
          last_update_at: now,
        })
      ));
    };

    if (action === 'activate') {
      const loc = body.location || null;
      const lat = loc?.lat ?? null;
      const lon = loc?.lon ?? null;
      const distressData = {
        officer_id: officer.id,
        officer_name: officer.full_name || 'Unknown Officer',
        unit_number: officer.unit_number || '???',
        rank: officer.rank || '',
        last_name: officer.last_name || String(officer.full_name || '').split(' ').pop() || '',
        latitude: lat,
        longitude: lon,
        current_latitude: lat,
        current_longitude: lon,
        location_description: (lat && lon) ? `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}` : (officer.last_known_location || 'Location unavailable'),
        status: 'active',
        activated_at: now,
        notes: isSelf ? '' : `Triggered by dispatch (${[user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email})`,
      };
      const created = await base44.asServiceRole.entities.OfficerDistress.create(distressData);
      await syncStatus('Distress');
      return Response.json({ success: true, status: 'Distress', distress_id: created?.id || null });
    }

    // clear
    const allAlerts = await base44.asServiceRole.entities.OfficerDistress.filter({ officer_id: officer.id }, '-activated_at', 20);
    const open = (allAlerts || []).filter((a: any) => a.status !== 'cleared');
    for (const a of open) {
      await base44.asServiceRole.entities.OfficerDistress.update(a.id, {
        status: 'cleared',
        cleared_at: now,
        cleared_by: user.id,
        cleared_by_name: user.full_name,
        notes: isSelf ? 'Officer cancelled' : 'Cleared by dispatch',
      });
    }
    await syncStatus('Available');
    return Response.json({ success: true, status: 'Available', cleared: open.length });
  } catch (error) {
    console.error('manageOfficerDistress failed', error);
    return Response.json({ error: error?.message || 'Unable to update distress' }, { status: 500 });
  }
});