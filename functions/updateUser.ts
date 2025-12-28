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

        console.log('📝 Updating user:', userId, 'with:', updates);

        // Separate role from other updates
        const { role, ...otherUpdates } = updates;

        // Update user metadata (everything except role)
        if (Object.keys(otherUpdates).length > 0) {
            await base44.asServiceRole.entities.User.update(userId, otherUpdates);
        }

        // Update role separately if needed
        if (role) {
            const appId = Deno.env.get('BASE44_APP_ID');
            const serviceToken = Deno.env.get('BASE44_SERVICE_ROLE_KEY');
            
            const roleResponse = await fetch(`https://api.base44.com/v1/apps/${appId}/users/${userId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceToken}`
                },
                body: JSON.stringify({ role })
            });

            if (!roleResponse.ok) {
                const error = await roleResponse.text();
                console.error('Role update failed:', error);
                return Response.json({ error: 'Failed to update role', details: error }, { status: roleResponse.status });
            }
        }
        
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