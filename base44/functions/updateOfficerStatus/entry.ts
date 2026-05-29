import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { status, estimated_return } = await req.json();

        if (!status) {
            return Response.json({ error: 'Status is required' }, { status: 400 });
        }

        const now = new Date().toISOString();

        const updateData = {
            status,
            last_updated: now
        };

        if (estimated_return) {
            updateData.estimated_return = estimated_return;
        }

        if (status === 'Available' || status === 'Out of Service' || status === 'Off Duty') {
            updateData.current_call_id = null;
            updateData.current_call_info = null;
        }

        // Update both session and entity so all users see the change
        await Promise.all([
            base44.auth.updateMe(updateData),
            base44.asServiceRole.entities.User.update(user.id, updateData)
        ]);

        return Response.json({ success: true, status });

    } catch (error) {
        console.error('Error updating officer status:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});