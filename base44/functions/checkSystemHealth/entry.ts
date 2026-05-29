import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = Date.now();
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const THIRTY_MIN = 30 * 60 * 1000;

        // Fetch data in parallel
        const [allCalls, locationLogs, users, outages] = await Promise.all([
            base44.asServiceRole.entities.DispatchCall.list('-created_date', 500),
            base44.asServiceRole.entities.LocationLog.list('-created_date', 100),
            base44.asServiceRole.entities.User.list(),
            base44.asServiceRole.entities.SystemOutage.list('-created_date', 50)
        ]);

        const recentCalls = (allCalls || []).filter(c => now - new Date(c.created_date) < TWO_HOURS);
        const activeCalls = (allCalls || []).filter(c => !['Closed', 'Cleared', 'Cancelled'].includes(c.status));
        const recentLogs = (locationLogs || []).filter(l => now - new Date(l.created_date) < THIRTY_MIN);
        const activeUsers = (users || []).filter(u => u.last_updated && now - new Date(u.last_updated) < 12 * 60 * 60 * 1000);
        const activeOutages = (outages || []).filter(o => !o.resolved_at);

        // Per-source feed freshness
        const sources = ['richmond', 'henrico', 'chesterfield'];
        const feedStatus = {};
        for (const src of sources) {
            const srcCalls = recentCalls.filter(c => c.source === src);
            feedStatus[src] = {
                ok: srcCalls.length > 0,
                count: srcCalls.length,
                lastCall: srcCalls[0]?.created_date || null
            };
        }

        // Compute avg response time (time_dispatched - time_received) for last 20 dispatched calls
        const dispatchedCalls = (allCalls || []).filter(c => c.time_dispatched && c.time_received).slice(0, 20);
        let avgResponseMin = null;
        if (dispatchedCalls.length > 0) {
            const total = dispatchedCalls.reduce((sum, c) => {
                return sum + (new Date(c.time_dispatched) - new Date(c.time_received));
            }, 0);
            avgResponseMin = Math.round(total / dispatchedCalls.length / 60000 * 10) / 10;
        }

        const health = {
            checked_at: new Date().toISOString(),
            active_calls: activeCalls.length,
            active_units: activeUsers.length,
            gps_tracking: {
                ok: recentLogs.length > 0,
                recent_pings: recentLogs.length
            },
            dispatch_feeds: feedStatus,
            avg_response_min: avgResponseMin,
            active_outages: activeOutages,
            total_calls_on_record: (allCalls || []).length
        };

        return Response.json(health);
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});