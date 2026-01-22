import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all active dispatch calls
        const activeCalls = await base44.asServiceRole.entities.DispatchCall.list();
        
        const now = new Date();
        // Archive calls older than 6 hours to keep map showing only active/recent calls
        const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
        
        let archivedCount = 0;
        
        for (const call of activeCalls) {
            const callTime = new Date(call.time_received || call.created_date);
            
            // Archive if older than 6 hours
            if (callTime < sixHoursAgo) {
                try {
                    // Create in CallHistory
                    await base44.asServiceRole.entities.CallHistory.create({
                        time_received: call.time_received,
                        incident: call.incident,
                        location: call.location,
                        agency: call.agency,
                        status: call.status || 'Completed',
                        latitude: call.latitude,
                        longitude: call.longitude,
                        ai_summary: call.ai_summary,
                        archived_date: now.toISOString()
                    });
                    
                    // Delete from DispatchCall
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    archivedCount++;
                } catch (error) {
                    console.error(`Failed to archive call ${call.id}:`, error);
                }
            }
        }
        
        return Response.json({
            success: true,
            archivedCount,
            message: `Archived ${archivedCount} calls older than 6 hours`
        });
        
    } catch (error) {
        console.error('Error archiving old calls:', error);
        return Response.json({ 
            error: 'Failed to archive calls',
            details: error.message 
        }, { status: 500 });
    }
});