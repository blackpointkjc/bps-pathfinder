import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('📋 Fetching calls from database...');

        // Fetch all calls - no filtering by date
        const dbCalls = await base44.entities.DispatchCall.list('-time_received', 500);
        
        console.log(`📊 Found ${dbCalls.length} total calls in database`);

        const recentCalls = dbCalls
            .map(call => ({
                id: call.id,
                timeReceived: new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                }),
                incident: call.incident,
                location: call.location,
                agency: call.agency || 'Unknown',
                status: call.status || 'New',
                latitude: call.latitude,
                longitude: call.longitude,
                description: call.description,
                source: 'database'
            }));

        const callsWithCoords = recentCalls.filter(c => c.latitude && c.longitude && !isNaN(c.latitude) && !isNaN(c.longitude));

        console.log(`✅ Returning ${recentCalls.length} total calls (${callsWithCoords.length} with coords)`);

        return Response.json({
            success: true,
            totalCalls: recentCalls.length,
            allCalls: recentCalls,
            geocodedCalls: callsWithCoords,
            geocodedCount: callsWithCoords.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        return Response.json({ 
            error: 'Failed to fetch calls',
            details: error.message 
        }, { status: 500 });
    }
});