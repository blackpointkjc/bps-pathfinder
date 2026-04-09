import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Runs on a schedule: marks officers "Out of Service" if their last_updated is > 12 hours ago
// and their status is not already OOS or Off Duty
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Allow scheduled invocation (no user auth) — use service role
        const allUsers = await base44.asServiceRole.entities.User.list();

        const staleThresholdMs = 12 * 60 * 60 * 1000; // 12 hours
        const now = Date.now();
        // Auto-expire ALL active statuses after 12 hours of inactivity
        // This catches "On Patrol", "Available", "Enroute", "On Scene" etc.
        // Officers who are already "Out of Service" stay that way until they change it themselves
        const expiredStatuses = ['Available', 'On Patrol', 'Enroute', 'On Scene', 'Busy', 'Dispatched', 'Returning to Station'];

        let updatedCount = 0;
        const updated = [];

        for (const user of allUsers) {
            // Skip users already OOS / Off Duty / no status
            if (!user.status || !expiredStatuses.includes(user.status)) continue;

            const lastUpdate = user.last_updated ? new Date(user.last_updated).getTime() : 0;
            const staleDuration = now - lastUpdate;

            if (staleDuration > staleThresholdMs) {
                try {
                    await base44.asServiceRole.entities.User.update(user.id, {
                        status: 'Out of Service',
                        show_on_map: false,
                        current_call_id: null,
                        current_call_info: null
                    });

                    // Log the status change
                    await base44.asServiceRole.entities.UnitStatusLog.create({
                        unit_id: user.id,
                        unit_name: user.unit_number || user.full_name,
                        old_status: user.status,
                        new_status: 'Out of Service',
                        notes: `Auto-expired after ${Math.round(staleDuration / 3600000)}h of inactivity`
                    });

                    updatedCount++;
                    updated.push({ id: user.id, name: user.full_name, old_status: user.status });
                } catch (err) {
                    console.error(`Failed to expire user ${user.id}:`, err.message);
                }
            }
        }

        console.log(`Auto-expiry: ${updatedCount} officer(s) set to Out of Service`);
        return Response.json({ success: true, updated: updatedCount, users: updated });

    } catch (error) {
        console.error('autoStatusExpiry error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});