import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { latitude, longitude, status, speed, heading } = await req.json();

        if (!latitude || !longitude) {
            return Response.json({ error: 'Latitude and longitude required' }, { status: 400 });
        }

        const locationFields = {
            latitude,
            longitude,
            heading: heading || 0,
            speed: speed || 0,
            last_updated: new Date().toISOString(),
            ...(status ? { status } : {})
        };

        // CRITICAL: Write position immediately via service role so fetchAllUsers sees it right away
        // Run both writes in parallel — do NOT await geocoding first
        await Promise.all([
            base44.asServiceRole.entities.User.update(user.id, locationFields),
            base44.auth.updateMe(locationFields)
        ]);

        // Fire-and-forget: create location log + geocode asynchronously (does NOT block the response)
        (async () => {
            let address = '';
            try {
                const geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
                    { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' }, signal: AbortSignal.timeout(3000) }
                );
                const geoData = await geoResponse.json();
                address = geoData.display_name || '';
            } catch (_) {}

            try {
                await base44.asServiceRole.entities.LocationLog.create({
                    user_id: user.id,
                    user_name: user.full_name,
                    unit_number: user.unit_number || '',
                    latitude,
                    longitude,
                    address,
                    shift_date: new Date().toISOString().split('T')[0],
                    status: status || 'Active',
                    speed: speed || 0
                });
            } catch (_) {}
        })();

        return Response.json({ success: true, message: 'Location logged' });
    } catch (error) {
        console.error('Error logging location:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});