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
                
                if (cells.length >= 3) {
                    const [timeReceived, incident, location, agency, status] = cells;
                    
                    // Include ALL calls - minimal filtering
                    if (incident && location) {
                        calls.push({
                            timeReceived: timeReceived || 'Unknown',
                            incident,
                            location,
                            agency: agency || 'Unknown',
                            status: status || 'Dispatched'
                        });
                    }
                }
            }
        }
        
        console.log(`Scraped ${calls.length} calls from website`);
        
        // Geocode each call location
        const geocodedCalls = [];
        for (const call of calls) {
            try {
                // Determine jurisdiction based on agency
                let jurisdiction = 'Virginia';
                if (call.agency.includes('RPD')) {
                    jurisdiction = 'Richmond, VA';
                } else if (call.agency.includes('HCPD') || call.agency.includes('HPD')) {
                    jurisdiction = 'Henrico County, VA';
                } else if (call.agency.includes('CCPD')) {
                    jurisdiction = 'Chesterfield County, VA';
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
                    // Try extracting street number and name separately
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
        
        // Generate AI summaries for calls
        const callsWithSummaries = await Promise.all(
            geocodedCalls.map(async (call) => {
                try {
                    const summaryResponse = await fetch('https://api.base44.io/integrations/Core/InvokeLLM', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_ROLE_KEY')}`
                        },
                        body: JSON.stringify({
                            prompt: `Summarize this emergency call in 1-2 sentences, highlighting key details: Incident: ${call.incident}, Location: ${call.location}, Agency: ${call.agency}, Status: ${call.status}`,
                            response_json_schema: {
                                type: "object",
                                properties: {
                                    summary: { type: "string" }
                                }
                            }
                        })
                    });
                    const summaryData = await summaryResponse.json();
                    return {
                        ...call,
                        ai_summary: summaryData.summary || 'Emergency call'
                    };
                } catch (error) {
                    console.error('Error generating summary:', error);
                    return { ...call, ai_summary: `${call.incident} at ${call.location}` };
                }
            })
        );
        
        return Response.json({
            success: true,
            totalCalls: calls.length,
            geocodedCalls: callsWithSummaries,
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