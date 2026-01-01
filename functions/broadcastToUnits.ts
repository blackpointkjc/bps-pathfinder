import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { unit_ids, message, status_update, location_update } = await req.json();

        if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
            return Response.json({ error: 'Invalid unit_ids' }, { status: 400 });
        }

        const results = [];

        for (const unitId of unit_ids) {
            try {
                // Send message if provided
                if (message) {
                    await base44.entities.Message.create({
                        sender_id: user.id,
                        sender_name: user.full_name,
                        recipient_id: unitId,
                        recipient_name: 'Unit',
                        message,
                        read: false
                    });
                }

                // Update status if provided
                if (status_update) {
                    const unitUsers = await base44.asServiceRole.entities.User.filter({ id: unitId });
                    if (unitUsers && unitUsers.length > 0) {
                        await base44.asServiceRole.entities.User.update(unitId, {
                            status: status_update,
                            last_updated: new Date().toISOString()
                        });

                        // Log status change
                        await base44.entities.UnitStatusLog.create({
                            unit_id: unitId,
                            unit_name: unitUsers[0].unit_number || unitUsers[0].full_name,
                            old_status: unitUsers[0].status,
                            new_status: status_update,
                            notes: `Broadcast by ${user.full_name}`
                        });
                    }
                }

                results.push({ unitId, success: true });
            } catch (error) {
                results.push({ unitId, success: false, error: error.message });
            }
        }

        return Response.json({
            success: true,
            results,
            broadcastedTo: unit_ids.length
        });
    } catch (error) {
        console.error('Error broadcasting to units:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});