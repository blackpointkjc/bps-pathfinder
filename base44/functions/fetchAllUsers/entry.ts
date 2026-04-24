import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized', users: [] }, { status: 401 });
        }
        
        // Only fetch the fields we actually need to minimize CPU/data
        const allUsers = await base44.asServiceRole.entities.User.list();

        const isPrivileged = user.role === 'admin' || user.dispatch_role === true;

        // Regular users see active field units only
        // Admin/Dispatch also see Supervisor status units and Out of Service
        const REGULAR_STATUSES = new Set(['Available', 'On Patrol', 'On Scene', 'Enroute', 'Busy']);
        const PRIVILEGED_STATUSES = new Set(['Available', 'On Patrol', 'On Scene', 'Enroute', 'Supervisor', 'Out of Service', 'Busy']);
        const allowedStatuses = isPrivileged ? PRIVILEGED_STATUSES : REGULAR_STATUSES;

        const cutoff = Date.now() - 12 * 60 * 60 * 1000; // 12 hours - full shift window

        const activeUsers = (allUsers || []).filter(u => {
            if (u.id === user.id) return false;
            if (!allowedStatuses.has(u.status)) return false;
            // Supervisor status: hide from regular users (extra guard)
            if (!isPrivileged && u.status === 'Supervisor') return false;
            // Must have valid GPS coordinates
            const lat = parseFloat(u.latitude), lng = parseFloat(u.longitude);
            if (isNaN(lat) || isNaN(lng)) return false;
            // Must have been updated within the shift window
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