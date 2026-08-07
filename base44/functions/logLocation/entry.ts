import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { latitude, longitude, status, speed, heading, accuracy } = await req.json();

        if (!latitude || !longitude) {
            return Response.json({ error: 'Latitude and longitude required' }, { status: 400 });
        }

        const now = new Date().toISOString();
        console.log(`[logLocation] user=${user.id} lat=${latitude} lng=${longitude} status=${status}`);

        const locationFields = {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            accuracy: accuracy || 0,
            last_updated: now,
            ...(status ? { status } : {})
        };

        // CRITICAL: Write position immediately via service role so fetchAllUsers sees it right away
        // Run both writes in parallel — do NOT await geocoding first
        await Promise.all([
            base44.asServiceRole.entities.User.update(user.id, locationFields),
            base44.auth.updateMe(locationFields)
        ]);

        // Live CAD location is stored on the User record only. Historical LocationLog writes were intentionally removed
        // because they created an extremely large duplicate location-history table without being needed by live CAD.
        console.log(`[logLocation] live location updated for user=${user.id}`);
        return Response.json({ success: true, message: 'Location logged', latitude, longitude, last_updated: now });
    } catch (error) {
        console.error('Error logging location:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});