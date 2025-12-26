import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Archiving old dispatch calls...');

        // Get all calls older than 2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const allCalls = await base44.entities.DispatchCall.list('-created_date', 1000);
        
        const oldCalls = allCalls.filter(call => {
            const callDate = new Date(call.time_received || call.created_date);
            return callDate < twoHoursAgo;
        });

        console.log(`Found ${oldCalls.length} calls to archive`);

        // Archive them to CallHistory
        let archived = 0;
        for (const call of oldCalls) {
            try {
                await base44.entities.CallHistory.create({
                    time_received: call.time_received,
                    incident: call.incident,
                    location: call.location,
                    agency: call.agency,
                    status: call.status,
                    latitude: call.latitude,
                    longitude: call.longitude,
                    ai_summary: call.ai_summary,
                    archived_date: new Date().toISOString()
                });

                // Delete from DispatchCall
                await base44.entities.DispatchCall.delete(call.id);
                archived++;
            } catch (error) {
                console.error(`Error archiving call ${call.id}:`, error);
            }
        }

        return Response.json({
            success: true,
            archivedCount: archived,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error archiving calls:', error);
        return Response.json({ 
            error: 'Failed to archive calls',
            details: error.message 
        }, { status: 500 });
    }
});