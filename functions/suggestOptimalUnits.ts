import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { call_id } = await req.json();

        // Get the call
        const call = await base44.entities.DispatchCall.get(call_id);
        if (!call) {
            return Response.json({ error: 'Call not found' }, { status: 404 });
        }

        // Get all available units
        const response = await base44.functions.invoke('fetchAllUsers', {});
        const allUnits = response.data?.users || [];

        // Filter to available units with location
        const availableUnits = allUnits.filter(unit => 
            (unit.status === 'Available' || unit.status === 'On Patrol') &&
            unit.latitude && unit.longitude
        );

        if (availableUnits.length === 0) {
            return Response.json({ 
                success: false, 
                message: 'No available units found',
                suggestions: []
            });
        }

        // Calculate distance and score for each unit
        const scoredUnits = availableUnits.map(unit => {
            const distance = calculateDistance(
                call.latitude,
                call.longitude,
                unit.latitude,
                unit.longitude
            );

            // Calculate ETA (rough estimate: 1 mile per minute average)
            const etaMinutes = Math.ceil(distance);

            // Calculate score (lower is better)
            let score = distance;

            // Bonus for supervisors
            if (unit.is_supervisor) {
                score *= 0.8; // 20% priority boost
            }

            // Bonus for units on patrol (they're actively moving)
            if (unit.status === 'On Patrol') {
                score *= 0.9; // 10% priority boost
            }

            // Incident type matching (future enhancement)
            // Could match specific unit capabilities here

            return {
                unit_id: unit.id,
                unit_number: unit.unit_number || unit.full_name,
                full_name: unit.full_name,
                rank: unit.rank,
                last_name: unit.last_name,
                distance_miles: distance.toFixed(2),
                eta_minutes: etaMinutes,
                status: unit.status,
                is_supervisor: unit.is_supervisor || false,
                score: score,
                current_location: {
                    lat: unit.latitude,
                    lng: unit.longitude
                }
            };
        });

        // Sort by score (best units first)
        scoredUnits.sort((a, b) => a.score - b.score);

        // Return top 5 suggestions
        const suggestions = scoredUnits.slice(0, 5).map((unit, index) => ({
            ...unit,
            rank_position: index + 1,
            recommendation: index === 0 ? 'Optimal' : index === 1 ? 'Good Alternative' : 'Available'
        }));

        return Response.json({
            success: true,
            call_id: call.id,
            call_info: {
                incident: call.incident,
                location: call.location,
                priority: call.priority
            },
            suggestions,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}