import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        if (!user || (user.role !== 'admin' && !roles.has('full_access') && !roles.has('hr') && !roles.has('trainer'))) {
            return Response.json({ error: 'Unauthorized - account management access required' }, { status: 401 });
        }

        const { userId, updates } = await req.json();
        
        if (!userId || !updates) {
            return Response.json({ error: 'userId and updates required' }, { status: 400 });
        }

        console.log('📝 Updating user:', userId);
        console.log('📝 Updates:', JSON.stringify(updates, null, 2));

        // Update the user's profile using asServiceRole
        const targetUsers = await base44.asServiceRole.entities.User.list();
        const target = (targetUsers || []).find((entry: any) => entry.id === userId);
        if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
        const targetRoles = new Set((target.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        const isSystemManager = user.role === 'admin' || roles.has('full_access');
        if (!isSystemManager && roles.has('hr') && !targetRoles.has('officer')) return Response.json({ error: 'HR can manage officer/employee accounts only' }, { status: 403 });
        if (!isSystemManager && roles.has('trainer') && !targetRoles.has('student')) return Response.json({ error: 'Trainer can manage student accounts only' }, { status: 403 });
        if (!isSystemManager && (updates.role !== undefined || updates.additional_roles !== undefined)) return Response.json({ error: 'Only Admin or Full Access can change account roles' }, { status: 403 });

        const updatePayload: Record<string, unknown> = {};
        const fields = ['first_name','last_name','full_name','email','mobile_phone','rank','unit_number','badge_number','division','assigned_location','assigned_locations','assigned_sites','dispatch_role','is_supervisor','show_on_map','role','status','additional_roles','platoon','supervisor_id','supervisor_email','supervisor_name','next_level_supervisor_id','next_level_supervisor_email','next_level_supervisor_name'];
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