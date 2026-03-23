import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        const oldStatus = user.status || 'Unknown';
        const now = new Date().toISOString();

        // Update user status
        const updateData = {
            status,
            last_updated: now
        };

        if (estimated_return) {
            updateData.estimated_return = estimated_return;
        }

        // Clear call info when going Available or OOS
        if (status === 'Available' || status === 'Out of Service' || status === 'Off Duty') {
            updateData.current_call_id = null;
            updateData.current_call_info = null;
        }

        await base44.auth.updateMe(updateData);

        // Log status change
        await base44.entities.UnitStatusLog.create({
            unit_id: user.id,
            unit_name: user.unit_number || user.full_name,
            old_status: oldStatus,
            new_status: status,
            location_lat: user.latitude,
            location_lng: user.longitude,
            notes: `Status changed to ${status}`
        });

        // CRITICAL: Link officer status to call status (ONLY for primary officer)
        if (user.current_call_id) {
            try {
                // Get all assignments for this call
                const assignments = await base44.entities.CallAssignment.filter({
                    call_id: user.current_call_id
                });

                // Check if THIS user is the PRIMARY officer
                const isPrimaryOfficer = assignments.some(a => 
                    a.unit_id === user.id && a.role === 'primary'
                );

                if (isPrimaryOfficer) {
                    // Get the call
                    const calls = await base44.asServiceRole.entities.DispatchCall.filter({ 
                        id: user.current_call_id 
                    });

                    if (calls && calls.length > 0) {
                        const call = calls[0];
                        let newCallStatus = null;
                        let timeField = {};

                        // Map officer status to call status - ONLY for primary officer
                        if (status === 'Enroute' && call.status !== 'Enroute') {
                            newCallStatus = 'Enroute';
                            timeField.time_enroute = now;
                        } else if (status === 'On Scene' && call.status !== 'On Scene') {
                            newCallStatus = 'On Scene';
                            timeField.time_on_scene = now;
                        } else if ((status === 'Available' || status === 'Out of Service' || status === 'Off Duty') && 
                                   call.status !== 'Cleared' && call.status !== 'Closed') {
                            newCallStatus = 'Cleared';
                            timeField.time_cleared = now;
                        }

                        // Update call if status needs to change
                        if (newCallStatus) {
                            await base44.asServiceRole.entities.DispatchCall.update(call.id, {
                                status: newCallStatus,
                                ...timeField
                            });

                            // Log call status change
                            await base44.entities.CallStatusLog.create({
                                call_id: call.id,
                                incident_type: call.incident,
                                location: call.location,
                                old_status: call.status,
                                new_status: newCallStatus,
                                unit_id: user.id,
                                unit_name: user.unit_number || user.full_name,
                                latitude: call.latitude,
                                longitude: call.longitude,
                                notes: `Primary officer went ${status} - call ${newCallStatus}`
                            });

                            // Update assignment status
                            const primaryAssignment = assignments.find(a => 
                                a.unit_id === user.id && a.role === 'primary'
                            );
                            
                            if (primaryAssignment) {
                                let assignmentStatus = primaryAssignment.status;
                                if (newCallStatus === 'Enroute') assignmentStatus = 'enroute';
                                if (newCallStatus === 'On Scene') assignmentStatus = 'on_scene';
                                if (newCallStatus === 'Cleared') assignmentStatus = 'cleared';

                                await base44.entities.CallAssignment.update(primaryAssignment.id, {
                                    status: assignmentStatus,
                                    ...(assignmentStatus === 'cleared' ? { cleared_at: now } : {})
                                });
                            }
                        }
                    }
                } else {
                    console.log('User is NOT primary officer - call status NOT updated');
                }
            } catch (error) {
                console.error('Error updating call status:', error);
            }
        }

        return Response.json({ 
            success: true, 
            status,
            call_status_updated: !!user.current_call_id
        });

    } catch (error) {
        console.error('Error updating officer status:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});