import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Get all cleared calls
        const clearedCalls = await base44.asServiceRole.entities.DispatchCall.filter({
            status: 'Cleared'
        });

        if (!clearedCalls || clearedCalls.length === 0) {
            return Response.json({ 
                success: true, 
                message: 'No cleared calls to process',
                closed_count: 0
            });
        }

        const now = new Date();
        let closedCount = 0;

        for (const call of clearedCalls) {
            if (!call.time_cleared) continue;

            const clearedTime = new Date(call.time_cleared);
            const minutesSinceCleared = (now - clearedTime) / 1000 / 60;

            // Auto-close calls cleared for more than 15 minutes
            if (minutesSinceCleared >= 15) {
                await base44.asServiceRole.entities.DispatchCall.update(call.id, {
                    status: 'Closed',
                    time_closed: new Date().toISOString()
                });

                // Log the auto-close
                await base44.asServiceRole.entities.CallStatusLog.create({
                    call_id: call.id,
                    incident_type: call.incident,
                    location: call.location,
                    old_status: 'Cleared',
                    new_status: 'Closed',
                    unit_id: 'system',
                    unit_name: 'Auto-Close System',
                    latitude: call.latitude,
                    longitude: call.longitude,
                    notes: `Auto-closed after ${Math.round(minutesSinceCleared)} minutes`
                });

                closedCount++;
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processed ${clearedCalls.length} cleared calls`,
            closed_count: closedCount,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});