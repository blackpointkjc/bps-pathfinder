import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ONE_HOUR_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const activeCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 500);

        const now = new Date();
        let archivedCount = 0;

        for (const call of activeCalls) {
            const callTime = new Date(call.time_received || call.created_date);
            const ageMs = now - callTime;

            if (ageMs > ONE_HOUR_MS) {
                try {
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

                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    archivedCount++;
                    console.log(`Archived: ${call.incident} @ ${call.location} (age: ${Math.round(ageMs / 60000)}min)`);
                } catch (error) {
                    console.error(`Failed to archive call ${call.id}:`, error);
                }
            }
        }

        return Response.json({
            success: true,
            archivedCount,
            message: `Archived ${archivedCount} calls older than 1 hour`
        });

    } catch (error) {
        console.error('Error archiving old calls:', error);
        return Response.json({
            error: 'Failed to archive calls',
            details: error.message
        }, { status: 500 });
    }
});