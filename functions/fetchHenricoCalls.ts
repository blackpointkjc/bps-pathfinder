import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check if user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch JSON data from Henrico active calls website
        const response = await fetch('https://activecalls.henrico.gov/data');
        const data = await response.json();
        
        const calls = [];
        
        // Process each call from the response
        if (data && data.calls && Array.isArray(data.calls)) {
            for (const call of data.calls) {
                if (call.latitude && call.longitude && call.incident_type && call.location) {
                    calls.push({
                        timeReceived: call.dispatch_time || call.time_received || 'Unknown',
                        incident: call.incident_type,
                        location: call.location,
                        agency: 'HCPD',
                        status: call.status || 'Dispatched',
                        latitude: parseFloat(call.latitude),
                        longitude: parseFloat(call.longitude)
                    });
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