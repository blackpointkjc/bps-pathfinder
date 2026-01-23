import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        
        const { includeArchived = false } = body;
        
        // Calculate 2-hour window using server time
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        
        let filters = {};
        if (includeArchived) {
            filters = { archived: true };
        } else {
            filters = { archived: false };
        }
        
        // Fetch all calls matching the filter
        const calls = await base44.asServiceRole.entities.DispatchCall.filter(
            filters,
            '-time_received,-created_date',
            10000
        );
        
        const isExternalSource = (source) => {
            return source && ['gractivecalls', 'scraped', 'external', 'richmond', 'henrico', 'chesterfield'].includes(source.toLowerCase());
        };
        
        const externalCalls = calls.filter(call => isExternalSource(call.source));
        
        let processedCalls = [];
        const unclassified = [];
        
        for (const call of externalCalls) {
            const callTime = call.time_received ? new Date(call.time_received) : null;
            
            if (!callTime) {
                unclassified.push({ ...call, classification: 'no_timestamp' });
                continue;
            }
            
            if (includeArchived) {
                processedCalls.push({
                    ...call,
                    classification: 'archived',
                    inWindow: false
                });
            } else {
                const inWindow = callTime >= twoHoursAgo && callTime <= now;
                processedCalls.push({
                    ...call,
                    inWindow,
                    windowStart: twoHoursAgo.toISOString(),
                    windowEnd: now.toISOString()
                });
            }
        }
        
        // Sort active calls by time_received DESC (newest first)
        processedCalls.sort((a, b) => {
            const timeA = new Date(a.time_received || a.created_date);
            const timeB = new Date(b.time_received || b.created_date);
            return timeB - timeA;
        });
        
        return Response.json({
            success: true,
            now: now.toISOString(),
            windowStart: twoHoursAgo.toISOString(),
            calls: processedCalls,
            unclassified,
            activeCount: processedCalls.filter(c => c.inWindow !== false).length,
            unclassifiedCount: unclassified.length
        });
    } catch (error) {
        console.error('[GET-EXTERNAL-CALLS] Error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});