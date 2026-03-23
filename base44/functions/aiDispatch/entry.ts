import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Calculate distance between two coordinates in miles
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate ETA based on distance and average speed
function calculateETA(distanceMiles, averageSpeed = 45) {
    const hours = distanceMiles / averageSpeed;
    const minutes = Math.round(hours * 60);
    return minutes;
}

// Prioritize calls based on type
function getCallPriority(incident) {
    const highPriority = ['SHOOTING', 'ARMED', 'ROBBERY', 'ASSAULT', 'OFFICER', 'HEMORRHAGE', 'UNCONSCIOUS', 'OVERDOSE'];
    const mediumPriority = ['THEFT', 'BURGLARY', 'ACCIDENT', 'MEDICAL', 'EMS', 'STROKE'];
    
    const incidentUpper = incident.toUpperCase();
    
    if (highPriority.some(keyword => incidentUpper.includes(keyword))) {
        return { level: 'HIGH', weight: 3 };
    } else if (mediumPriority.some(keyword => incidentUpper.includes(keyword))) {
        return { level: 'MEDIUM', weight: 2 };
    }
    return { level: 'LOW', weight: 1 };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { callLatitude, callLongitude, callIncident, callAgency } = await req.json();
        
        if (!callLatitude || !callLongitude) {
            return Response.json({ error: 'Call location required' }, { status: 400 });
        }

        // Get all units
        const allUnits = await base44.asServiceRole.entities.Unit.list();
        
        // Filter to available units or units already enroute
        const availableUnits = allUnits.filter(unit => 
            unit.status === 'Available' || unit.status === 'Enroute'
        );

        if (availableUnits.length === 0) {
            return Response.json({
                success: true,
                suggestions: [],
                message: 'No available units found'
            });
        }

        // Calculate distance and ETA for each unit
        const unitsWithDistance = availableUnits.map(unit => {
            const distance = calculateDistance(
                unit.latitude,
                unit.longitude,
                callLatitude,
                callLongitude
            );
            const eta = calculateETA(distance);
            
            return {
                ...unit,
                distanceToCall: distance,
                estimatedETA: eta,
                etaFormatted: eta < 60 ? `${eta} min` : `${Math.floor(eta / 60)}h ${eta % 60}m`
            };
        });

        // Sort by distance (closest first)
        unitsWithDistance.sort((a, b) => a.distanceToCall - b.distanceToCall);

        // Get call priority
        const priority = getCallPriority(callIncident || '');

        // Apply priority weighting and jurisdiction matching
        const rankedUnits = unitsWithDistance.map(unit => {
            let score = 100 - unit.distanceToCall; // Base score on distance
            
            // Bonus for matching jurisdiction (if agency info available)
            // This is a simple heuristic - could be enhanced
            
            // Penalty if unit is already enroute to another call
            if (unit.status === 'Enroute') {
                score -= 20;
            }
            
            // Apply priority multiplier
            score *= priority.weight;
            
            return {
                ...unit,
                dispatchScore: score,
                recommendationReason: unit.status === 'Available' 
                    ? `Closest available unit - ${unit.distanceToCall.toFixed(1)} mi away`
                    : `Currently enroute but nearby - ${unit.distanceToCall.toFixed(1)} mi away`
            };
        });

        // Sort by score
        rankedUnits.sort((a, b) => b.dispatchScore - a.dispatchScore);

        // Return top 5 suggestions
        const suggestions = rankedUnits.slice(0, 5).map((unit, index) => ({
            unit_id: unit.id,
            unit_name: unit.unit_name,
            status: unit.status,
            distance: unit.distanceToCall.toFixed(1),
            eta: unit.etaFormatted,
            estimatedMinutes: unit.estimatedETA,
            rank: index + 1,
            recommendation: unit.recommendationReason,
            latitude: unit.latitude,
            longitude: unit.longitude
        }));

        return Response.json({
            success: true,
            callPriority: priority.level,
            suggestions: suggestions,
            totalAvailableUnits: availableUnits.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error in AI dispatch:', error);
        return Response.json({ 
            error: 'Failed to generate dispatch suggestions',
            details: error.message 
        }, { status: 500 });
    }
});