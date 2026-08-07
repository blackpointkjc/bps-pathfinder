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

        const activeOverrides = await base44.asServiceRole.entities.OfficerStatusOverride.filter({
            officer_id: user.id,
            active: true,
            forced_out_of_service: true,
        }, '-forced_at', 1);
        if (activeOverrides?.length && status !== 'Out of Service') {
            const override = activeOverrides[0];
            return Response.json({
                error: 'Your status has been forced Out of Service by an authorized supervisor and cannot be changed until the override is released.',
                forced_out_of_service: true,
                reason: override.reason || '',
            }, { status: 403 });
        }

        const now = new Date().toISOString();

        const updateData = {
            status,
            last_updated: now
        };

        if (estimated_return) {
            updateData.estimated_return = estimated_return;
        }

        if (status === 'Available' || status === 'Out of Service') {
            updateData.current_call_id = null;
            updateData.current_call_info = null;
        }

        // Update both session and User entity so all users see the change.
        await Promise.all([
            base44.auth.updateMe(updateData),
            base44.asServiceRole.entities.User.update(user.id, updateData)
        ]);

        // Keep any linked Unit record synchronized as well. Some CAD/map components
        // still read Unit, so this prevents a stale second status from contradicting User.
        const units = await base44.asServiceRole.entities.Unit.list(undefined, 500);
        const linkedUnits = (units || []).filter((unit: any) =>
            unit.user_id === user.id || String(unit.user_email || '').toLowerCase() === String(user.email || '').toLowerCase()
        );
        await Promise.all(linkedUnits.map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
            status,
            last_updated: now,
            last_update_at: now,
        })));

        return Response.json({ success: true, status });

    } catch (error) {
        console.error('Error updating officer status:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});