import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check if user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch HTML from Henrico active calls website
        const response = await fetch('https://activecalls.henrico.gov/');
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
                    
                    if (incident && incident.trim() && location && location.trim()) {
                        // Geocode location
                        try {
                            const query = `${location.trim()}, Henrico County, VA`;
                            const geoResponse = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
                                { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                            );
                            const geoData = await geoResponse.json();
                            
                            if (geoData && geoData.length > 0) {
                                calls.push({
                                    timeReceived: timeReceived || 'Unknown',
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency: (agency && agency.trim()) || 'HCPD',
                                    status: (status && status.trim()) || 'Dispatched',
                                    latitude: parseFloat(geoData[0].lat),
                                    longitude: parseFloat(geoData[0].lon)
                                });
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, 1100));
                        } catch (error) {
                            console.error(`Error geocoding ${location}:`, error);
                        }
                    }
                }
            }
        }
        
        console.log(`Scraped ${calls.length} Henrico calls`);
        
        // Generate AI summaries for calls
        const callsWithSummaries = await Promise.all(
            calls.map(async (call) => {
                try {
                    const summaryResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                        prompt: `Summarize this emergency call in 1-2 sentences: Incident: ${call.incident}, Location: ${call.location}, Agency: ${call.agency}, Status: ${call.status}`,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                summary: { type: "string" }
                            }
                        }
                    });
                    return {
                        ...call,
                        ai_summary: summaryResponse.summary || 'Emergency call'
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
        console.error('Error fetching Henrico calls:', error);
        return Response.json({ 
            error: 'Failed to fetch Henrico calls',
            details: error.message 
        }, { status: 500 });
    }
});