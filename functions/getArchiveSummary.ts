import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Calculate time windows using server time
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Get archived external calls
        const archivedCalls = await base44.asServiceRole.entities.DispatchCall.filter({
            archived: true
        }, '-archivedAt', 10000);
        
        const isExternalSource = (source) => {
            return source && ['gractivecalls', 'scraped', 'external', 'richmond', 'henrico', 'chesterfield'].includes(source.toLowerCase());
        };
        
        let archivedLast24h = 0;
        let archivedLast7d = 0;
        let lastArchiveTime = null;
        
        for (const call of archivedCalls) {
            if (!isExternalSource(call.source)) continue;
            
            const archivedAt = call.archivedAt ? new Date(call.archivedAt) : null;
            
            if (archivedAt) {
                if (archivedAt >= oneDayAgo) {
                    archivedLast24h++;
                }
                if (archivedAt >= sevenDaysAgo) {
                    archivedLast7d++;
                }
                
                if (!lastArchiveTime || archivedAt > lastArchiveTime) {
                    lastArchiveTime = archivedAt;
                }
            }
        }
        
        return Response.json({
            success: true,
            archivedLast24h,
            archivedLast7d,
            lastArchiveTime: lastArchiveTime?.toISOString() || null,
            now: now.toISOString()
        });
    } catch (error) {
        console.error('[ARCHIVE-SUMMARY] Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message,
            archivedLast24h: 0,
            archivedLast7d: 0,
            lastArchiveTime: null
        }, { status: 500 });
    }
});