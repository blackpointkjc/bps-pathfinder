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

        // Update user - need to fetch first, then update
        const targetUser = await base44.asServiceRole.entities.User.filter({ id: userId });
        
        if (!targetUser || targetUser.length === 0) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Use auth update for the target user
        const response = await fetch(`${Deno.env.get('BASE44_API_URL') || 'https://api.base44.com'}/v1/apps/${Deno.env.get('BASE44_APP_ID')}/users/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Update failed:', error);
            return Response.json({ error: 'Failed to update user', details: error }, { status: response.status });
        }
        
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