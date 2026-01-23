import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Calculate window using server time
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        
        console.log(`[ARCHIVE] Running at ${now.toISOString()}, window start: ${twoHoursAgo.toISOString()}`);
        
        // Get all external calls that are not yet archived
        const externalCalls = await base44.asServiceRole.entities.DispatchCall.filter({
            archived: false
        }, '-created_date', 1000);
        
        const isExternalSource = (source) => {
            return source && ['gractivecalls', 'scraped', 'external', 'richmond', 'henrico', 'chesterfield'].includes(source.toLowerCase());
        };
        
        let archivedCount = 0;
        const toArchive = [];
        
        for (const call of externalCalls) {
            if (!isExternalSource(call.source)) continue;
            
            // Use time_received if available, otherwise created_date
            const callTime = call.time_received ? new Date(call.time_received) : new Date(call.created_date);
            
            // Archive if older than 2-hour window
            if (callTime < twoHoursAgo) {
                toArchive.push(call);
                archivedCount++;
            }
        }
        
        // Batch update archived calls
        if (toArchive.length > 0) {
            for (const call of toArchive) {
                await base44.asServiceRole.entities.DispatchCall.update(call.id, {
                    archived: true,
                    archivedAt: now.toISOString(),
                    lastUpdated: now.toISOString()
                });
            }
            console.log(`[ARCHIVE] Archived ${archivedCount} external calls`);
        }
        
        return Response.json({
            success: true,
            archivedCount,
            windowStart: twoHoursAgo.toISOString(),
            runTime: now.toISOString()
        });
    } catch (error) {
        console.error('[ARCHIVE] Error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});