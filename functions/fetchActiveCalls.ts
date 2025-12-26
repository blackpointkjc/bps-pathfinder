import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check if user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch the active calls page
        const response = await fetch('https://gractivecalls.com/');
        const html = await response.text();
        
        // Parse the HTML to extract call data
        const calls = [];
        
        // Use regex to extract table rows
        const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>/g;
        
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
            const [_, timeReceived, incident, location, agency, status] = match;
            
            // Only include calls with active statuses
            const activeStatuses = ['Dispatched', 'Enroute', 'Arrived', 'ENROUTE', 'ARRIVED', 'ARV TRNSPT'];
            const cleanStatus = status.trim();
            
            if (activeStatuses.some(s => cleanStatus.includes(s))) {
                calls.push({
                    timeReceived: timeReceived.trim(),
                    incident: incident.trim(),
                    location: location.trim(),
                    agency: agency.trim(),
                    status: cleanStatus
                });
            }
        }
        
        // Geocode the locations (with rate limiting)
        const geocodedCalls = [];
        
        for (let i = 0; i < Math.min(calls.length, 50); i++) {
            const call = calls[i];
            try {
                // Add ", Richmond, VA" to improve geocoding accuracy
                const searchQuery = `${call.location}, Richmond, VA`;
                
                const geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
                    {
                        headers: {
                            'User-Agent': 'GRActiveCalls-Map-Integration/1.0'
                        }
                    }
                );
                
                const geoData = await geoResponse.json();
                
                if (geoData && geoData.length > 0) {
                    geocodedCalls.push({
                        ...call,
                        latitude: parseFloat(geoData[0].lat),
                        longitude: parseFloat(geoData[0].lon)
                    });
                }
                
                // Rate limiting - wait 1 second between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error geocoding ${call.location}:`, error);
            }
        }
        
        return Response.json({
            success: true,
            totalCalls: calls.length,
            geocodedCalls: geocodedCalls,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching active calls:', error);
        return Response.json({ 
            error: 'Failed to fetch active calls',
            details: error.message 
        }, { status: 500 });
    }
});