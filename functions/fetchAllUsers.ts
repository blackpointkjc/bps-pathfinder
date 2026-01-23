import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use service role to fetch all users
        const allUsers = await base44.asServiceRole.entities.User.list('created_date', 200);
        
        // Return all users for roster, but mark which have valid location data
        const users = allUsers.map(u => ({
            ...u,
            hasValidLocation: !!(u.latitude && u.longitude && 
                               !isNaN(u.latitude) && !isNaN(u.longitude) &&
                               u.latitude !== 0 && u.longitude !== 0)
        }));
        
        return Response.json({
            success: true,
            users: users,
            total: users.length
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json({ 
            error: 'Failed to fetch users',
            details: error.message 
        }, { status: 500 });
    }
});