import { createClientFromRequest } from 'npm:@base44/sdk';

const ARCHIVE_AFTER_MS = 60 * 60 * 1000;
const ARCHIVE_SCAN_LIMIT = 1000;
const ARCHIVE_BATCH_LIMIT = 100;

function callTimestamp(call: any) {
    const created = call?.created_date ? new Date(call.created_date).getTime() : 0;
    const received = call?.time_received ? new Date(call.time_received).getTime() : 0;
    if (Number.isFinite(received) && received > 0 && Number.isFinite(created) && created > 0 && Math.abs(received - created) < 24 * 60 * 60 * 1000) return received;
    if (Number.isFinite(created) && created > 0) return created;
    return Number.isFinite(received) && received > 0 ? received : 0;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        const scheduledRun = body?.scheduled === true;

        const user = await base44.auth.me().catch(() => null);
        if (!scheduledRun && !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        // Any authenticated operational user may trigger the archive pass. The
        // actual archive/delete writes use service role, so normal users never
        // receive direct write access to DispatchCall or CallHistory.
        const authorized = scheduledRun || user?.role === 'admin' || user?.role === 'dispatch' || user?.role === 'supervisor' || user?.role === 'officer' || roles.has('full_access') || roles.has('cad_access') || roles.has('dispatch') || roles.has('supervisor') || roles.has('officer');
        if (!authorized) return Response.json({ error: 'Forbidden' }, { status: 403 });

        // Scan a broad oldest-first window. The old newest-only scan could miss
        // stale calls whenever the active table had enough newer rows in front of them.
        const activeCalls = await base44.asServiceRole.entities.DispatchCall.list('created_date', ARCHIVE_SCAN_LIMIT);

        const now = new Date();
        let archivedCount = 0;

        const archiveCandidates = (activeCalls || [])
            .map(call => ({ call, stamp: callTimestamp(call) }))
            .filter(item => item.stamp > 0 && now.getTime() - item.stamp >= ARCHIVE_AFTER_MS)
            .sort((a, b) => a.stamp - b.stamp)
            .slice(0, ARCHIVE_BATCH_LIMIT);

        for (const { call, stamp } of archiveCandidates) {
            const ageMs = now.getTime() - stamp;

            if (ageMs >= ARCHIVE_AFTER_MS) {
                try {
                    const existing = await base44.asServiceRole.entities.CallHistory.filter({ original_call_id: call.id }, '-archived_date', 1);
                    if (!existing?.length) {
                        await base44.asServiceRole.entities.CallHistory.create({
                            original_call_id: call.id,
                            call_id: call.call_id,
                            bps_reference: call.bps_reference || (call.call_id && call.call_id.startsWith('BPS-') ? call.call_id : ''),
                            agency_cad_number: call.agency_cad_number || '',
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

                    // Once a call leaves the active CAD queue, any open property alert
                    // for that same call must close with it. Otherwise the shell can keep
                    // presenting a property alert for a call that is already in history.
                    const openPropertyAlerts = await base44.asServiceRole.entities.PropertyAlert.filter({ callId: call.id, acknowledged: false }, '-created_date', 50).catch(() => []);
                    for (const alert of openPropertyAlerts || []) {
                        await base44.asServiceRole.entities.PropertyAlert.update(alert.id, {
                            acknowledged: true,
                            acknowledgedAt: now.toISOString(),
                            closed_with_call: true,
                            callTime: alert.callTime || call.time_received || call.created_date,
                            time_received: alert.time_received || call.time_received || call.created_date,
                        }).catch(() => null);
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
            scanned: Array.isArray(activeCalls) ? activeCalls.length : 0,
            candidates: archiveCandidates.length,
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