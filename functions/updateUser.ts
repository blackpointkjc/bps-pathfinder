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

        // Update user metadata directly using Base44 SDK
        const updatePayload = {};
        
        // Handle user metadata fields
        if (updates.rank !== undefined) updatePayload.rank = updates.rank;
        if (updates.last_name !== undefined) updatePayload.last_name = updates.last_name;
        if (updates.unit_number !== undefined) updatePayload.unit_number = updates.unit_number;
        if (updates.dispatch_role !== undefined) updatePayload.dispatch_role = updates.dispatch_role;
        if (updates.is_supervisor !== undefined) updatePayload.is_supervisor = updates.is_supervisor;
        if (updates.show_on_map !== undefined) updatePayload.show_on_map = updates.show_on_map;
        if (updates.full_name !== undefined) updatePayload.full_name = updates.full_name;
        
        // Update the user using internal user update endpoint
        const appId = Deno.env.get('BASE44_APP_ID');
        const serviceToken = Deno.env.get('BASE44_SERVICE_ROLE_KEY');
        
        const response = await fetch(`https://api.base44.com/v1/apps/${appId}/users/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceToken}`
            },
            body: JSON.stringify(updatePayload)
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Update failed:', response.status, error);
            return Response.json({ 
                error: 'Failed to update user', 
                details: error 
            }, { status: response.status });
        }

        // Handle role update separately if needed
        if (updates.role && updates.role !== user.role) {
            const roleResponse = await fetch(`https://api.base44.com/v1/apps/${appId}/users/${userId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceToken}`
                },
                body: JSON.stringify({ role: updates.role })
            });

            if (!roleResponse.ok) {
                console.error('Role update failed:', await roleResponse.text());
            }
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