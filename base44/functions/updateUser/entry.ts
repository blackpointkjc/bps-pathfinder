import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        // Update the user's profile using asServiceRole
        const updatePayload: Record<string, unknown> = {};
        const fields = ['full_name','rank','last_name','unit_number','dispatch_role','is_supervisor','show_on_map','role','status','additional_roles'];
        for (const f of fields) {
            if (updates[f] !== undefined) updatePayload[f] = updates[f];
        }

        if (updatePayload.role !== undefined && !['user', 'admin'].includes(String(updatePayload.role))) {
            return Response.json({ error: 'Role must be user or admin' }, { status: 400 });
        }
        if (updatePayload.additional_roles !== undefined && !Array.isArray(updatePayload.additional_roles)) {
            return Response.json({ error: 'additional_roles must be an array' }, { status: 400 });
        }

        await base44.asServiceRole.entities.User.update(userId, updatePayload);

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