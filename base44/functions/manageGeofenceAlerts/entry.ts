import { createClientFromRequest } from 'npm:@base44/sdk';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
const rad = (value: number) => value * Math.PI / 180;
const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const insidePolygon = (lat: number, lng: number, points: any[]) => {
  if (!Array.isArray(points) || points.length < 3) return null;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const yi = Number(points[i]?.lat), xi = Number(points[i]?.lng);
    const yj = Number(points[j]?.lat), xj = Number(points[j]?.lng);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';
    const roles = rolesOf(user);
    const reviewer = user.role === 'admin' || roles.has('supervisor') || roles.has('full_access');

    const allAlerts = async () => await base44.asServiceRole.entities.GeofenceAlert.list('-created_date', 1000);

    if (action === 'outside') {
      const officerEmail = String(body.officer_email || user.email || '').toLowerCase();
      if (officerEmail !== String(user.email || '').toLowerCase() && !reviewer) return Response.json({ error: 'Cannot create alert for another user' }, { status: 403 });
      const location = String(body.location || '');
      if (!location) return Response.json({ error: 'Location is required' }, { status: 400 });
      const alerts = await allAlerts();
      const existing = (alerts || []).find((a: any) => !a.acknowledged && String(a.officer_email || '').toLowerCase() === officerEmail && a.location === location && a.alert_type === 'outside_zone');
      const patch = {
        officer_email: officerEmail,
        officer_name: body.officer_name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
        location,
        alert_type: 'outside_zone',
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        distance_from_site: Number(body.distance_from_site || 0),
      };
      if (existing) {
        await base44.asServiceRole.entities.GeofenceAlert.update(existing.id, patch);
        return Response.json({ success: true, alert: { ...existing, ...patch }, created: false });
      }
      const created = await base44.asServiceRole.entities.GeofenceAlert.create(patch);
      return Response.json({ success: true, alert: created, created: true });
    }

    if (action === 'resolve_mine') {
      const officerEmail = String(user.email || '').toLowerCase();
      const location = String(body.location || '');
      const alerts = await allAlerts();
      const open = (alerts || []).filter((a: any) => !a.acknowledged && String(a.officer_email || '').toLowerCase() === officerEmail && (!location || a.location === location));
      const now = new Date().toISOString();
      for (const alert of open) {
        await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, {
          acknowledged: true,
          acknowledged_by: 'SYSTEM',
          acknowledged_date: now,
          notes: body.reason || 'Automatically resolved when officer returned inside the approved geofence or ended the shift.',
        });
      }
      return Response.json({ success: true, resolved: open.length });
    }

    if (!reviewer) return Response.json({ error: 'Supervisor or admin access required' }, { status: 403 });

    if (action === 'acknowledge') {
      if (!body.id) return Response.json({ error: 'Alert ID is required' }, { status: 400 });
      await base44.asServiceRole.entities.GeofenceAlert.update(body.id, {
        acknowledged: true,
        acknowledged_by: user.email,
        acknowledged_date: new Date().toISOString(),
        notes: body.notes || null,
      });
      return Response.json({ success: true });
    }

    if (action === 'clear_all') {
      const alerts = await allAlerts();
      const open = (alerts || []).filter((a: any) => !a.acknowledged);
      const now = new Date().toISOString();
      for (const alert of open) await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, { acknowledged: true, acknowledged_by: user.email, acknowledged_date: now, notes: 'Bulk acknowledged' });
      return Response.json({ success: true, cleared: open.length });
    }

    // list + cleanup stale/current-state alerts
    const [alerts, locations, activeOfficers, timeEntries] = await Promise.all([
      allAlerts(),
      base44.asServiceRole.entities.Location.list('site_name', 500),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 500).catch(() => []),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 3000).catch(() => []),
    ]);
    const now = Date.now();
    const open = (alerts || []).filter((a: any) => !a.acknowledged);
    for (const alert of open) {
      const email = String(alert.officer_email || '').toLowerCase();
      const activeEntry = (timeEntries || []).find((e: any) => String(e.officer_email || '').toLowerCase() === email && e.clock_in && !e.clock_out);
      let shouldResolve = !activeEntry;
      if (activeEntry) {
        const activeSite = String(activeEntry.location || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
        if (activeSite && !String(alert.location || '').toLowerCase().includes(activeSite) && !activeSite.includes(String(alert.location || '').toLowerCase())) shouldResolve = true;
      }
      const live = (activeOfficers || []).find((a: any) => String(a.officer_email || '').toLowerCase() === email);
      const loc = (locations || []).find((l: any) => l.site_name === alert.location);
      const liveAt = live?.last_update ? new Date(live.last_update).getTime() : 0;
      if (!shouldResolve && live && loc && now - liveAt <= 5 * 60 * 1000 && Number.isFinite(Number(live.latitude)) && Number.isFinite(Number(live.longitude))) {
        const lat = Number(live.latitude), lng = Number(live.longitude);
        const polygon = insidePolygon(lat, lng, loc.geofence_polygon || []);
        const inside = polygon === null
          ? distanceMeters(lat, lng, Number(loc.latitude), Number(loc.longitude)) <= Number(loc.geofence_radius_meters || 100)
          : polygon;
        if (inside) shouldResolve = true;
      }
      if (shouldResolve) {
        await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, {
          acknowledged: true,
          acknowledged_by: 'SYSTEM',
          acknowledged_date: new Date().toISOString(),
          notes: 'Automatically resolved because the officer is no longer outside this active assignment geofence.',
        });
      }
    }
    const refreshed = await allAlerts();
    return Response.json({ success: true, alerts: refreshed || [] });
  } catch (error) {
    console.error('manageGeofenceAlerts failed', error);
    return Response.json({ error: error?.message || 'Unable to manage geofence alerts' }, { status: 500 });
  }
});