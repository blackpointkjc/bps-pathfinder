import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized', users: [] }, { status: 401 });
        }
        
        // Only fetch the fields we actually need to minimize CPU/data
        const allUsers = await base44.asServiceRole.entities.User.list();

        // Filter to only active users server-side to reduce payload
        const VISIBLE_STATUSES = new Set(['Available', 'On Patrol', 'On Scene', 'Enroute']);
        const cutoff = Date.now() - 4 * 60 * 60 * 1000; // 4 hours

        const activeUsers = (allUsers || []).filter(u => {
            if (u.id === user.id) return false;
            if (!VISIBLE_STATUSES.has(u.status)) return false;
            const lat = parseFloat(u.latitude), lng = parseFloat(u.longitude);
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return false;
            const lastUpdated = u.last_updated ? new Date(u.last_updated).getTime() : 0;
            return lastUpdated > cutoff;
        });

        return Response.json({
            success: true,
            users: activeUsers,
            total: activeUsers.length
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json({ success: false, error: error.message, users: [] }, { status: 200 });
    }
});