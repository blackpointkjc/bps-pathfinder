import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { call } = await req.json();

        if (!call || !call.latitude || !call.longitude) {
            return Response.json({ error: 'Invalid call data' }, { status: 400 });
        }

        // Get all available units
        const response = await base44.functions.invoke('fetchAllUsers', {});
        const allUnits = response.data?.users || [];

        // Filter for available and nearby units
        const availableUnits = allUnits.filter(u => 
            u.status === 'Available' || u.status === 'On Patrol'
        );

        // Get unit skills
        const unitSkillsData = await base44.entities.UnitSkills.list();
        const skillsMap = {};
        unitSkillsData.forEach(s => {
            skillsMap[s.unit_id] = s;
        });

        // Calculate scores for each unit
        const scoredUnits = [];
        
        for (const unit of availableUnits) {
            if (!unit.latitude || !unit.longitude) continue;

            const distance = calculateDistance(
                call.latitude,
                call.longitude,
                unit.latitude,
                unit.longitude
            );

            const distanceKm = distance / 1000;
            const estimatedETA = Math.max(2, Math.ceil((distanceKm / 60) * 60)); // Rough ETA in minutes

            // Calculate score (lower is better)
            let score = distance / 1000; // Base on distance

            // Adjust for skills match
            const unitSkills = skillsMap[unit.id];
            const callType = call.incident?.toLowerCase() || '';
            
            let skillMatch = false;
            if (unitSkills && unitSkills.skills) {
                if (callType.includes('k9') && unitSkills.skills.includes('K9')) {
                    score *= 0.5; // Prioritize K9 unit
                    skillMatch = true;
                }
                if ((callType.includes('swat') || callType.includes('barricade')) && 
                    unitSkills.skills.includes('SWAT')) {
                    score *= 0.6;
                    skillMatch = true;
                }
                if (callType.includes('negotiat') && unitSkills.skills.includes('Negotiator')) {
                    score *= 0.7;
                    skillMatch = true;
                }
                if ((callType.includes('ems') || callType.includes('medical')) && 
                    unitSkills.skills.includes('EMS')) {
                    score *= 0.7;
                    skillMatch = true;
                }
            }

            scoredUnits.push({
                unit_id: unit.id,
                unit_name: unit.unit_number || unit.full_name,
                distance: distanceKm.toFixed(2),
                eta: estimatedETA,
                score: score,
                status: unit.status,
                skills: unitSkills?.skills || [],
                skillMatch,
                latitude: unit.latitude,
                longitude: unit.longitude
            });
        }

        // Sort by score
        scoredUnits.sort((a, b) => a.score - b.score);

        // Get top 5 recommendations
        const recommendations = scoredUnits.slice(0, 5);

        // Use AI to analyze and provide insights
        const aiAnalysis = await base44.integrations.Core.InvokeLLM({
            prompt: `Analyze this dispatch situation:

Call: ${call.incident} at ${call.location}
Priority: ${call.priority || 'medium'}

Top recommended units:
${recommendations.map((u, i) => 
    `${i+1}. ${u.unit_name} - ${u.distance} km away, ETA ${u.eta} min, Status: ${u.status}${u.skillMatch ? ' (SKILL MATCH)' : ''}`
).join('\n')}

Total available units: ${availableUnits.length}
Total units on patrol: ${allUnits.filter(u => u.status === 'On Patrol').length}
Units on active calls: ${allUnits.filter(u => u.status === 'Enroute' || u.status === 'On Scene').length}

Provide:
1. Recommended unit (from the list) and why
2. Estimated response time
3. Any potential conflicts or concerns (resource shortages, coverage gaps)
4. Alternative suggestions if primary unit is not ideal

Keep response concise and actionable.`,
            add_context_from_internet: false
        });

        return Response.json({
            success: true,
            recommendations,
            aiAnalysis,
            stats: {
                totalUnits: allUnits.length,
                availableUnits: availableUnits.length,
                onPatrol: allUnits.filter(u => u.status === 'On Patrol').length,
                onCalls: allUnits.filter(u => u.status === 'Enroute' || u.status === 'On Scene').length,
                outOfService: allUnits.filter(u => u.status === 'Out of Service').length
            }
        });
    } catch (error) {
        console.error('Error in AI dispatch assistant:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}