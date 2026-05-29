import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Haversine distance in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ray-casting point-in-polygon
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isInsideProperty(lat, lng, property) {
  if (!lat || !lng) return false;
  if (property.boundary_type === 'polygon' && property.polygon?.length >= 3) {
    return pointInPolygon(lat, lng, property.polygon);
  }
  // Default: circle
  if (property.latitude && property.longitude && property.radiusMeters) {
    return haversine(lat, lng, property.latitude, property.longitude) <= property.radiusMeters;
  }
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated users and scheduled automation (service role)
    const properties = await base44.asServiceRole.entities.MonitoredProperty.filter({ enabled: true });
    if (!properties?.length) return Response.json({ checked: 0, alerts: 0 });

    // Get active calls (non-closed)
    const activeCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 200);
    const openCalls = activeCalls.filter(c =>
      !['Closed', 'Cancelled', 'Cleared'].includes(c.status) && c.latitude && c.longitude
    );

    // Get recent officer location logs (last 20 min)
    const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const locationLogs = await base44.asServiceRole.entities.LocationLog.filter({
      created_date: { $gte: cutoff }
    });

    // Deduplicate: keep most recent log per officer
    const officerLocations = {};
    for (const log of (locationLogs || [])) {
      if (!officerLocations[log.user_id] || log.created_date > officerLocations[log.user_id].created_date) {
        officerLocations[log.user_id] = log;
      }
    }
    const officers = Object.values(officerLocations);

    // Get existing unacknowledged alerts to avoid duplicates (last 30 min)
    const recentAlerts = await base44.asServiceRole.entities.PropertyAlert.filter({ acknowledged: false });
    const existingKeys = new Set((recentAlerts || []).map(a => `${a.callId}-${a.propertyId}`));

    let alertsCreated = 0;

    for (const property of properties) {
      // Find calls inside this property boundary
      const callsInZone = openCalls.filter(c => isInsideProperty(c.latitude, c.longitude, property));

      // Find officers inside this property boundary
      const officersInZone = officers.filter(o => isInsideProperty(o.latitude, o.longitude, property));

      for (const call of callsInZone) {
        const key = `${call.id}-${property.id}`;
        if (!existingKeys.has(key)) {
          // Create a property alert visible to dispatch
          const dist = property.latitude
            ? Math.round(haversine(call.latitude, call.longitude, property.latitude, property.longitude))
            : 0;

          await base44.asServiceRole.entities.PropertyAlert.create({
            callId: call.id,
            propertyId: property.id,
            propertyName: property.name,
            callIncident: call.incident,
            callLocation: call.location,
            distanceMeters: dist,
            acknowledged: false,
            description: `Call inside monitored property "${property.name}"`
          });
          existingKeys.add(key);
          alertsCreated++;
        }

        // Alert officers who are physically inside the same zone
        for (const officer of officersInZone) {
          const alertKey = `officer-${officer.user_id}-${call.id}-${property.id}`;
          if (!existingKeys.has(alertKey)) {
            await base44.asServiceRole.entities.CallAlert.create({
              user_id: officer.user_id,
              call_id: call.id,
              status: 'pending',
              description: `You are on-site at "${property.name}" — active call: ${call.incident} at ${call.location}`
            });
            existingKeys.add(alertKey);
            alertsCreated++;
          }
        }

        // Alert officers assigned to this call that they are entering/in the monitored zone
        const assignments = await base44.asServiceRole.entities.CallAssignment.filter({ call_id: call.id });
        for (const assignment of (assignments || [])) {
          if (['pending', 'accepted', 'enroute', 'on_scene'].includes(assignment.status)) {
            const assignedOfficer = officers.find(o => o.user_id === assignment.unit_id);
            if (assignedOfficer && isInsideProperty(assignedOfficer.latitude, assignedOfficer.longitude, property)) {
              const assignKey = `assigned-${assignment.unit_id}-${call.id}-${property.id}`;
              if (!existingKeys.has(assignKey)) {
                await base44.asServiceRole.entities.CallAlert.create({
                  user_id: assignment.unit_id,
                  call_id: call.id,
                  status: 'pending',
                  description: `You have entered monitored property "${property.name}" — assigned call: ${call.incident}`
                });
                existingKeys.add(assignKey);
                alertsCreated++;
              }
            }
          }
        }
      }
    }

    return Response.json({ checked: properties.length, alerts: alertsCreated, officers: officers.length, calls: openCalls.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});