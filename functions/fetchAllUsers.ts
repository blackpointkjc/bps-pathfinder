import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use service role to fetch all users with proper pagination
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        return Response.json({
            success: true,
            users: allUsers || [],
            total: allUsers?.length || 0
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json({ 
            success: false,
            error: 'Failed to fetch users',
            details: error.message,
            users: []
        }, { status: 500 });
    }
});