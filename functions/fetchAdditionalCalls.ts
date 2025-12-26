import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check if user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch HTML from active calls website
        const response = await fetch('https://gractivecalls.com/');
        const html = await response.text();
        
        const calls = [];
        
        // Parse the table more robustly
        const tableStart = html.indexOf('<table');
        const tableEnd = html.indexOf('</table>', tableStart);
        
        if (tableStart !== -1 && tableEnd !== -1) {
            const tableHtml = html.substring(tableStart, tableEnd + 8);
            
            // Split by rows
            const rows = tableHtml.split(/<tr[^>]*>/i).slice(1); // Skip first empty element
            
            for (let i = 1; i < rows.length; i++) { // Skip header row
                const row = rows[i];
                if (!row.includes('<td')) continue;
                
                // Extract cell contents
                const cells = [];
                const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                
                for (const match of cellMatches) {
                    const text = match[1]
                        .replace(/<[^>]+>/g, '') // Remove HTML tags
                        .replace(/&nbsp;/g, ' ') // Replace &nbsp;
                        .trim();
                    cells.push(text);
                }
                
                if (cells.length >= 5) {
                    const [timeReceived, incident, location, agency, status] = cells;
                    
                    // Filter for CCFD, CCPD, HPD only
                    if ((agency.includes('CCFD') || agency.includes('CCPD') || agency.includes('HPD')) && 
                        timeReceived && incident && location) {
                        calls.push({
                            timeReceived,
                            incident,
                            location,
                            agency: agency || 'Unknown',
                            status: status || 'Unknown'
                        });
                    }
                }
            }
        }
        
        console.log(`Scraped ${calls.length} CCFD/CCPD/HPD calls from website`);
        
        // Geocode each call location
        const geocodedCalls = [];
        for (const call of calls) {
            try {
                // Determine jurisdiction based on agency
                let jurisdiction = 'Virginia';
                if (call.agency.includes('CCFD') || call.agency.includes('CCPD')) {
                    jurisdiction = 'Chesterfield County, VA';
                } else if (call.agency.includes('HPD') || call.agency.includes('HCPD')) {
                    jurisdiction = 'Henrico County, VA';
                }
                
                const query = `${call.location}, ${jurisdiction}`;
                console.log('Geocoding:', query);
                
                const geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
                    {
                        headers: {
                            'User-Agent': 'Emergency-Dispatch-App/1.0'
                        }
                    }
                );
                let geoData = await geoResponse.json();
                
                // If no results, try with street number extraction and better formatting
                if (!geoData || geoData.length === 0) {
                    const locationParts = call.location.match(/^(\d+)\s+(.+)$/);
                    if (locationParts) {
                        const [_, number, street] = locationParts;
                        const betterQuery = `${number} ${street}, ${jurisdiction}, USA`;
                        console.log('Retry with formatted query:', betterQuery);
                        
                        const retryResponse = await fetch(
                            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(betterQuery)}&limit=1&countrycodes=us`,
                            {
                                headers: {
                                    'User-Agent': 'Emergency-Dispatch-App/1.0'
                                }
                            }
                        );
                        geoData = await retryResponse.json();
                    }
                }
                
                if (geoData && geoData.length > 0) {
                    geocodedCalls.push({
                        ...call,
                        latitude: parseFloat(geoData[0].lat),
                        longitude: parseFloat(geoData[0].lon)
                    });
                    console.log('Geocoded:', call.location, '→', geoData[0].lat, geoData[0].lon);
                } else {
                    console.log('No geocode results for:', query);
                }
                
                // Rate limit: 1 request per second
                await new Promise(resolve => setTimeout(resolve, 1100));
            } catch (error) {
                console.error(`Error geocoding ${call.location}:`, error);
            }
        }
        
        console.log(`Successfully geocoded ${geocodedCalls.length} out of ${calls.length} calls`);
        
        return Response.json({
            success: true,
            totalCalls: calls.length,
            geocodedCalls: geocodedCalls,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching additional calls:', error);
        return Response.json({ 
            error: 'Failed to fetch additional calls',
            details: error.message 
        }, { status: 500 });
    }
});