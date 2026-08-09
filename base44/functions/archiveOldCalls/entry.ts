import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ARCHIVE_AFTER_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me().catch(() => null);
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        // Any authenticated operational user may trigger the archive pass. The
        // actual archive/delete writes use service role, so normal users never
        // receive direct write access to DispatchCall or CallHistory.
        const authorized = user.role === 'admin' || user.role === 'dispatch' || user.role === 'supervisor' || user.role === 'officer' || roles.has('full_access') || roles.has('cad_access') || roles.has('dispatch') || roles.has('supervisor') || roles.has('officer');
        if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const activeCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 500);

        const now = new Date();
        let archivedCount = 0;

        for (const call of activeCalls) {
            const callTime = new Date(call.time_received || call.created_date);
            const ageMs = now - callTime;

            if (ageMs >= ARCHIVE_AFTER_MS) {
                try {
                    const existing = await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: call.id }, '-archived_date', 1);
                    if (!existing?.length) {
                        await base44.asServiceRole.entities.CallHistory.create({
                            original_call_id: call.id,
                            call_id: call.call_id,
                            external_call_id: call.external_call_id,
                            time_received: call.time_received || call.created_date,
                            incident: call.incident,
                            location: call.location,
                            cross_street: call.cross_street,
                            agency: call.agency || 'BPS',
                            status: call.status || 'Completed',
                            priority: call.priority,
                            zone: call.zone,
                            latitude: call.latitude,
                            longitude: call.longitude,
                            description: call.description,
                            ai_summary: call.ai_summary,
                            assigned_units: call.assigned_units || [],
                            caller_name: call.caller_name,
                            caller_phone: call.caller_phone,
                            hazards: call.hazards,
                            time_dispatched: call.time_dispatched,
                            time_enroute: call.time_enroute,
                            time_on_scene: call.time_on_scene,
                            time_cleared: call.time_cleared,
                            time_closed: call.time_closed,
                            source: call.source,
                            archived_date: now.toISOString()
                        });
                    }

                    // The complete copy above remains available for incident-report linkage.
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    archivedCount++;
                    console.log(`Archived: ${call.incident} @ ${call.location} (age: ${Math.round(ageMs / 60000)}min)`);
                } catch (error) {
                    console.error(`Failed to archive call ${call.id}:`, error);
                }
            }
        }

        return Response.json({
            success: true,
            archivedCount,
            message: `Archived ${archivedCount} calls at 1 hour elapsed`
        });

    } catch (error) {
        console.error('Error archiving old calls:', error);
        return Response.json({
            error: 'Failed to archive calls',
            details: error.message
        }, { status: 500 });
    }
});