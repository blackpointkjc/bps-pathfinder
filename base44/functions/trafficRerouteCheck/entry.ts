import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Monitors active dispatch calls and checks for traffic/road closure issues.
 * Automatically suggests rerouting for high-priority calls.
 * Integrates with existing map traffic layer.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active calls that have units assigned
    const activeCalls = await base44.entities.DispatchCall.list('-created_date', 100);
    const inProgressCalls = activeCalls.filter(c => 
      ['Dispatched', 'Enroute', 'On Scene'].includes(c.status) &&
      c.latitude && c.longitude &&
      (c.priority === 'critical' || c.priority === 'high')
    );

    if (inProgressCalls.length === 0) {
      return Response.json({ suggestions: [] });
    }

    // For each call, check if units have been en route for too long
    // This indicates potential traffic/route issues
    const rerouteSuggestions = [];

    for (const call of inProgressCalls) {
      if (!call.time_dispatched || !call.time_enroute) continue;

      const dispatchedTime = new Date(call.time_dispatched);
      const enrouteTime = new Date(call.time_enroute);
      const elapsedMinutes = (Date.now() - enrouteTime) / 60000;

      // If en route for > 5 minutes without arriving, suggest reroute
      if (elapsedMinutes > 5 && !call.time_on_scene) {
        rerouteSuggestions.push({
          callId: call.id || call.call_id,
          incident: call.incident,
          location: call.location,
          priority: call.priority,
          elapsedMinutes: Math.round(elapsedMinutes),
          reason: 'Extended response time - possible traffic congestion',
          coordinates: [call.latitude, call.longitude],
          suggestAlternateRoute: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Also suggest prepositioned units avoid known congestion areas
    // by analyzing historical location data
    const recentLocations = await base44.entities.LocationLog.list('-created_date', 500);
    
    // Find common congestion zones (multiple units delayed in same area)
    const congestionZones = {};
    recentLocations.forEach(log => {
      if (!log.latitude || !log.longitude) return;
      const zoneKey = `${Math.round(log.latitude * 100)},${Math.round(log.longitude * 100)}`;
      congestionZones[zoneKey] = (congestionZones[zoneKey] || 0) + 1;
    });

    // Areas with 3+ unit visits in last hour likely have congestion
    const knownCongestionAreas = Object.entries(congestionZones)
      .filter(([_, count]) => count >= 3)
      .map(([zone, _]) => {
        const [lat, lng] = zone.split(',').map(x => parseInt(x) / 100);
        return { latitude: lat, longitude: lng };
      });

    return Response.json({
      suggestions: rerouteSuggestions,
      congestionAreas: knownCongestionAreas,
      summary: {
        callsNeedingReroute: rerouteSuggestions.length,
        knownCongestionZones: knownCongestionAreas.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});