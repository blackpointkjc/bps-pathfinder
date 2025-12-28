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

        console.log('Updating user:', userId, 'with:', updates);
        
        // Get all users to find the target
        const allUsersResponse = await base44.asServiceRole.functions.invoke('fetchAllUsers', {});
        const allUsers = allUsersResponse.data?.users || [];
        const targetUser = allUsers.find(u => u.id === userId);
        
        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Merge updates with existing user data
        const updatedData = {
            ...targetUser,
            ...updates
        };

        // Update via direct database call (User is a special entity that stores in auth.users)
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey
            },
            body: JSON.stringify({
                user_metadata: {
                    rank: updates.rank,
                    last_name: updates.last_name,
                    unit_number: updates.unit_number,
                    dispatch_role: updates.dispatch_role,
                    is_supervisor: updates.is_supervisor,
                    show_on_map: updates.show_on_map
                },
                role: updates.role
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Update failed:', error);
            return Response.json({ error: 'Failed to update user', details: error }, { status: response.status });
        }
        
        console.log('User updated successfully');
        
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