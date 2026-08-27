import { createClientFromRequest } from 'npm:@base44/sdk';

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
        if (user.status === status) return Response.json({ success: true, status, duplicate_transition: true });

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
            last_updated: now,
            status_since: now
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

        // Keep all CAD status sources synchronized. ActiveOfficer is the live source
        // used by the canonical unit board, so leaving it stale would immediately
        // overwrite an officer's self-selected status with an older value.
        const [units, activeOfficers] = await Promise.all([
            base44.asServiceRole.entities.Unit.list(undefined, 500).catch(() => []),
            base44.asServiceRole.entities.ActiveOfficer.list(undefined, 1000).catch(() => []),
        ]);
        const linkedUnits = (units || []).filter((unit: any) =>
            unit.user_id === user.id || String(unit.user_email || '').toLowerCase() === String(user.email || '').toLowerCase()
        );
        const linkedActive = (activeOfficers || []).filter((active: any) =>
            String(active.officer_email || '').toLowerCase() === String(user.email || '').toLowerCase()
        );
        await Promise.all([
            ...linkedUnits.map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
                status,
                last_updated: now,
                last_update_at: now,
            }).catch(() => null)),
            ...linkedActive.map((active: any) => base44.asServiceRole.entities.ActiveOfficer.update(active.id, {
                status,
                last_update: now,
                session_active: status !== 'Out of Service',
                ...(status === 'Available' || status === 'Out of Service' ? { current_call_info: '' } : {}),
            }).catch(() => null)),
        ]);

        // If the officer is signed in but their ActiveOfficer row was lost/expired,
        // changing CAD status must recreate the live session instead of letting the
        // Unit Status Board immediately resolve them back to OOS.
        let createdActive = null;
        if (!linkedActive.length && status !== 'Out of Service') {
            createdActive = await base44.asServiceRole.entities.ActiveOfficer.create({
                officer_email: user.email,
                officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
                unit_number: user.unit_number || '',
                current_location: user.current_location || user.assigned_location || 'Signed In',
                clock_in_time: now,
                last_update: now,
                status,
                user_role: user.role || 'user',
                session_active: true,
                current_call_info: user.current_call_info || '',
            });
        }

        if (status === 'Available') {
            const callId = user.current_call_id || 'unit-status';
            const officer = user.unit_number ? `Unit ${user.unit_number}` : ([user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || 'Officer');
            await base44.asServiceRole.entities.CallStatusLog.create({
                call_id: callId,
                old_status: user.status || '',
                new_status: status,
                unit_id: user.id,
                unit_name: officer,
                notes: 'Officer returned to available status',
                event_key: `unit:${user.id}:available:${now}`,
                event_type: 'unit_available',
                announcement_text: `${officer} returned to available status.`,
                announcement_priority: 'normal',
                cad_number: '',
                triggering_action: 'updateOfficerStatus',
                audio_enabled: true,
                sensitive: false,
            });
        }

        return Response.json({ success: true, status, active_records_updated: linkedActive.length + (createdActive ? 1 : 0), active_record_created: Boolean(createdActive), unit_records_updated: linkedUnits.length });

    } catch (error) {
        console.error('Error updating officer status:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});