import { createClientFromRequest } from 'npm:@base44/sdk';

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: 'Valid latitude and longitude are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const officerEmail = String(user.email || body.officer_email || '').trim().toLowerCase();
    if (!officerEmail) return Response.json({ error: 'Officer email is required' }, { status: 400 });

    const liveData = {
      officer_email: officerEmail,
      officer_name: String(user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || body.officer_name || officerEmail),
      unit_number: String(body.unit_number || user.unit_number || ''),
      current_location: String(body.current_location || user.current_location || user.assigned_location || 'Signed In'),
      clock_in_time: String(body.clock_in_time || now),
      last_update: now,
      latitude,
      longitude,
      heading: finiteNumber(body.heading),
      speed: finiteNumber(body.speed),
      accuracy: finiteNumber(body.accuracy),
      status: String(body.status || user.status || 'Signed In'),
      user_role: String(body.user_role || user.role || 'user'),
      session_active: true,
      show_lights: body.show_lights === true,
      current_call_info: String(body.current_call_info || user.current_call_info || ''),
    };

    const records = await base44.asServiceRole.entities.ActiveOfficer.filter(
      { officer_email: officerEmail },
      '-last_update',
      100,
    );
    const primary = records?.[0] || null;
    const activeOfficer = primary
      ? await base44.asServiceRole.entities.ActiveOfficer.update(primary.id, liveData)
      : await base44.asServiceRole.entities.ActiveOfficer.create(liveData);

    const duplicateIds = (records || []).slice(1).map((record: any) => record.id).filter(Boolean);
    if (duplicateIds.length) {
      await Promise.all(duplicateIds.map((id: string) =>
        base44.asServiceRole.entities.ActiveOfficer.delete(id).catch(() => null)
      ));
    }

    console.log(`[logLocation] activeOfficer=${activeOfficer.id} user=${user.id} lat=${latitude} lng=${longitude}`);
    return Response.json({
      success: true,
      active_officer: activeOfficer,
      latitude,
      longitude,
      last_updated: now,
    });
  } catch (error) {
    console.error('Error logging location:', error);
    return Response.json({ error: error?.message || 'Unable to update live location' }, { status: 500 });
  }
});