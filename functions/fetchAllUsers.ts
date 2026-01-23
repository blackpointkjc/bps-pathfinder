import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Use service role to fetch all users - no auth check needed for service role
        const allUsers = await base44.asServiceRole.entities.User.list('-last_updated', 500);
        
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
        }, { status: 200 }); // Return 200 with empty array so pages don't break
    }
});