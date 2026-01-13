import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const { userId, updates } = await req.json();
        
        if (!userId || !updates) {
            return Response.json({ error: 'userId and updates required' }, { status: 400 });
        }

        console.log('📝 Updating user:', userId);
        console.log('📝 Updates:', JSON.stringify(updates, null, 2));

        // Get the target user first
        const allUsersResponse = await base44.asServiceRole.functions.invoke('fetchAllUsers', {});
        const users = allUsersResponse.data?.users || [];
        const targetUser = users.find(u => u.id === userId);

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Update the user's profile using asServiceRole
        await base44.asServiceRole.entities.User.update(userId, {
            full_name: updates.full_name || targetUser.full_name,
            rank: updates.rank,
            last_name: updates.last_name,
            unit_number: updates.unit_number,
            dispatch_role: updates.dispatch_role === true,
            is_supervisor: updates.is_supervisor === true,
            show_on_map: updates.show_on_map !== false,
            role: updates.role || targetUser.role
        });

        console.log('✅ User updated successfully');
        
        return Response.json({
            success: true,
            message: 'User updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating user:', error);
        return Response.json({ 
            error: 'Failed to update user',
            details: error.message 
        }, { status: 500 });
    }
});