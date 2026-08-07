import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('cad_access') || roles.has('dispatch');
    if (!authorized) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { call_id } = await req.json();
    if (!call_id) {
      return Response.json({ error: 'Missing call_id' }, { status: 400 });
    }

    // Fetch call and units with location data
    const [dispatchCall, units] = await Promise.all([
      base44.asServiceRole.entities.DispatchCall.get(call_id),
      base44.asServiceRole.entities.Unit.list()
    ]);

    if (!dispatchCall || !dispatchCall.latitude || !dispatchCall.longitude) {
      return Response.json({ error: 'Call has no location data' }, { status: 400 });
    }

    // Live geofence decisions use current unit coordinates. Historical LocationLog records are not required.
    await base44.asServiceRole.entities.MonitoredProperty.list();

    const callLat = dispatchCall.latitude;
    const callLng = dispatchCall.longitude;

    // Find units whose last known location is within 5km of call
    const unitsInGeofence = units.filter(u => {
      if (!u.current_latitude || !u.current_longitude) return false;
      const dist = haversine(u.current_latitude, u.current_longitude, callLat, callLng);
      return dist <= 5; // 5km radius
    });

    // Sort by distance
    const assignments = unitsInGeofence.map(u => ({
      unit_id: u.id,
      unit_label: u.label,
      distance_km: haversine(u.current_latitude, u.current_longitude, callLat, callLng).toFixed(2)
    })).sort((a, b) => parseFloat(a.distance_km) - parseFloat(b.distance_km));

    // Auto-assign closest available unit if high priority
    if (dispatchCall.priority === 'critical' && assignments.length > 0) {
      const closestUnit = assignments[0];
      await base44.asServiceRole.entities.CallAssignment.create({
        call_id: call_id,
        unit_id: closestUnit.unit_id,
        role: 'primary',
        assigned_at: new Date().toISOString(),
        status: 'pending'
      });
    }

    return Response.json({ 
      call_id, 
      location: { lat: callLat, lng: callLng },
      units_in_geofence: assignments,
      auto_assigned: dispatchCall.priority === 'critical' && assignments.length > 0
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}