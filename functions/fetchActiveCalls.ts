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
        
        // Extract table rows - more flexible regex to catch all calls
        const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
        if (tableMatch) {
            const tableContent = tableMatch[1];
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            
            let rowMatch;
            let isFirstRow = true;
            while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                // Skip header row
                if (isFirstRow || rowMatch[1].includes('<th')) {
                    isFirstRow = false;
                    continue;
                }
                
                const cells = [];
                let cellMatch;
                const rowHtml = rowMatch[1];
                while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                    // Remove HTML tags and get text content
                    const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
                    cells.push(text);
                }
                
                if (cells.length >= 5) {
                    const [timeReceived, incident, location, agency, status] = cells;
                    
                    // Only include calls with active statuses
                    const activeStatuses = ['Dispatched', 'Enroute', 'Arrived', 'ENROUTE', 'ARRIVED', 'ARV TRNSPT', 'ARV'];
                    
                    if (activeStatuses.some(s => status.toUpperCase().includes(s.toUpperCase()))) {
                        calls.push({
                            timeReceived,
                            incident,
                            location,
                            agency,
                            status
                        });
                    }
                }
            }
        }
        
        // Geocode the locations (with rate limiting)
        const geocodedCalls = [];
        
        for (let i = 0; i < Math.min(calls.length, 50); i++) {
            const call = calls[i];
            try {
                // Determine county/city based on agency for better geocoding
                let region = 'Richmond, VA';
                if (call.agency?.includes('HPD')) {
                    region = 'Henrico County, VA';
                } else if (call.agency?.includes('CCPD')) {
                    region = 'Chesterfield County, VA';
                } else if (call.agency?.includes('RPD')) {
                    region = 'Richmond, VA';
                }
                
                // Try with specific region first
                let searchQuery = `${call.location}, ${region}`;
                let geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=us`,
                    {
                        headers: {
                            'User-Agent': 'GRActiveCalls-Map-Integration/1.0'
                        }
                    }
                );
                let geoData = await geoResponse.json();
                
                // If no results, try with just the location and state
                if (!geoData || geoData.length === 0) {
                    searchQuery = `${call.location}, Virginia, USA`;
                    geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&countrycodes=us`,
                        {
                            headers: {
                                'User-Agent': 'GRActiveCalls-Map-Integration/1.0'
                            }
                        }
                    );
                    geoData = await geoResponse.json();
                }
                
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