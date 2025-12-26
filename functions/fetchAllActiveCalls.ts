import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Fetching ALL calls from gractivecalls.com...');
        
        const response = await fetch('https://gractivecalls.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const html = await response.text();
        
        const calls = [];
        
        // Parse the table
        const tableStart = html.indexOf('<table');
        const tableEnd = html.indexOf('</table>', tableStart);
        
        if (tableStart !== -1 && tableEnd !== -1) {
            const tableHtml = html.substring(tableStart, tableEnd + 8);
            const rows = tableHtml.split(/<tr[^>]*>/i).slice(1);
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row.includes('<td')) continue;
                
                const cells = [];
                const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                
                for (const match of cellMatches) {
                    const text = match[1]
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .trim();
                    cells.push(text);
                }
                
                if (cells.length >= 3) {
                    const [timeReceived, incident, location, agency, status] = cells;
                    
                    // Include EVERY SINGLE CALL - no filtering
                    if (incident && incident.trim() && location && location.trim()) {
                        calls.push({
                            timeReceived: timeReceived || 'Unknown',
                            incident: incident.trim(),
                            location: location.trim(),
                            agency: (agency && agency.trim()) || 'Unknown',
                            status: (status && status.trim()) || 'Dispatched'
                        });
                    }
                }
            }
        }
        
        console.log(`✅ Scraped ${calls.length} total calls from gractivecalls.com`);
        
        // Geocode all calls
        const geocodedCalls = [];
        for (const call of calls) {
            try {
                let jurisdiction = 'Virginia, USA';
                
                if (call.agency.includes('RPD') || call.agency.includes('RFD')) {
                    jurisdiction = 'Richmond, VA, USA';
                } else if (call.agency.includes('HCPD') || call.agency.includes('HPD') || call.agency.includes('Henrico')) {
                    jurisdiction = 'Henrico County, VA, USA';
                } else if (call.agency.includes('CCPD') || call.agency.includes('CCFD') || call.agency.includes('Chesterfield')) {
                    jurisdiction = 'Chesterfield County, VA, USA';
                } else if (call.agency.includes('BPS')) {
                    jurisdiction = 'Richmond, VA, USA';
                }
                
                const query = `${call.location}, ${jurisdiction}`;
                
                const geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
                    {
                        headers: {
                            'User-Agent': 'Emergency-Dispatch-App/1.0'
                        }
                    }
                );
                let geoData = await geoResponse.json();
                
                // Retry with better formatting if failed
                if (!geoData || geoData.length === 0) {
                    const locationParts = call.location.match(/^(\d+)\s+(.+)$/);
                    if (locationParts) {
                        const [_, number, street] = locationParts;
                        const betterQuery = `${number} ${street}, ${jurisdiction}`;
                        
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
                } else {
                    // Include call even without coordinates
                    geocodedCalls.push({
                        ...call,
                        latitude: null,
                        longitude: null
                    });
                }
                
                // Rate limit
                await new Promise(resolve => setTimeout(resolve, 1100));
            } catch (error) {
                console.error(`Error geocoding ${call.location}:`, error);
                geocodedCalls.push({
                    ...call,
                    latitude: null,
                    longitude: null
                });
            }
        }
        
        console.log(`✅ Geocoded ${geocodedCalls.filter(c => c.latitude).length}/${geocodedCalls.length} calls`);
        
        // Generate AI summaries
        const callsWithSummaries = await Promise.all(
            geocodedCalls.map(async (call) => {
                try {
                    const summaryResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                        prompt: `Summarize this emergency call in 1-2 sentences: ${call.incident} at ${call.location}, ${call.agency}, Status: ${call.status}`,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                summary: { type: "string" }
                            }
                        }
                    });
                    return {
                        ...call,
                        ai_summary: summaryResponse.summary || `${call.incident} at ${call.location}`
                    };
                } catch (error) {
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
        console.error('Error fetching all active calls:', error);
        return Response.json({ 
            error: 'Failed to fetch calls',
            details: error.message 
        }, { status: 500 });
    }
});