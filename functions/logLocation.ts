import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { latitude, longitude, status, speed } = await req.json();

        if (!latitude || !longitude) {
            return Response.json({ error: 'Latitude and longitude required' }, { status: 400 });
        }

        // Get user details
        const userData = user;

        // Reverse geocode to get address
        let address = '';
        try {
            const geoResponse = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            const geoData = await geoResponse.json();
            address = geoData.display_name || '';
        } catch (error) {
            console.log('Geocoding failed:', error);
        }

        // Create location log
        const logData = {
            user_id: user.id,
            user_name: user.full_name,
            unit_number: userData.unit_number || '',
            latitude,
            longitude,
            address,
            shift_date: new Date().toISOString().split('T')[0],
            status: status || 'Active',
            speed: speed || 0
        };

        await base44.asServiceRole.entities.LocationLog.create(logData);

        return Response.json({ success: true, message: 'Location logged' });
    } catch (error) {
        console.error('Error logging location:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});