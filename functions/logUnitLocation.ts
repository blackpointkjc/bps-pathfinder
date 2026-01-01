import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { latitude, longitude, heading, speed, status } = await req.json();

        if (!latitude || !longitude) {
            return Response.json({ error: 'Missing location data' }, { status: 400 });
        }

        // Log location to history
        await base44.entities.UnitLocationHistory.create({
            unit_id: user.id,
            unit_name: user.unit_number || user.full_name,
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            status: status || 'Unknown',
            timestamp: new Date().toISOString()
        });

        // Check geofences
        const geofences = await base44.entities.Geofence.filter({ active: true });
        
        for (const geofence of geofences) {
            const distance = calculateDistance(
                latitude,
                longitude,
                geofence.latitude,
                geofence.longitude
            );

            const isInside = distance <= geofence.radius_meters;

            // Check if unit was inside before (simple check using last 5 min of history)
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const recentHistory = await base44.entities.UnitLocationHistory.filter({
                unit_id: user.id,
                timestamp: { $gte: fiveMinAgo }
            });

            let wasInside = false;
            if (recentHistory.length > 1) {
                const lastLocation = recentHistory[recentHistory.length - 2];
                const lastDistance = calculateDistance(
                    lastLocation.latitude,
                    lastLocation.longitude,
                    geofence.latitude,
                    geofence.longitude
                );
                wasInside = lastDistance <= geofence.radius_meters;
            }

            // Detect entry
            if (isInside && !wasInside && geofence.alert_on_entry) {
                await base44.entities.GeofenceEvent.create({
                    geofence_id: geofence.id,
                    geofence_name: geofence.name,
                    unit_id: user.id,
                    unit_name: user.unit_number || user.full_name,
                    event_type: 'entry',
                    latitude,
                    longitude
                });
            }

            // Detect exit
            if (!isInside && wasInside && geofence.alert_on_exit) {
                await base44.entities.GeofenceEvent.create({
                    geofence_id: geofence.id,
                    geofence_name: geofence.name,
                    unit_id: user.id,
                    unit_name: user.unit_number || user.full_name,
                    event_type: 'exit',
                    latitude,
                    longitude
                });
            }
        }

        // Clean up old location history (older than 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const oldRecords = await base44.asServiceRole.entities.UnitLocationHistory.filter({
            timestamp: { $lt: oneDayAgo }
        });
        
        for (const record of oldRecords) {
            await base44.asServiceRole.entities.UnitLocationHistory.delete(record.id);
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error logging location:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}