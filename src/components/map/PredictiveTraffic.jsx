// Predictive Traffic Analysis System
// Uses historical patterns, time of day, events, and real-time data

// Historical traffic patterns by time of day and day of week
const HISTORICAL_PATTERNS = {
    // Rush hour patterns (multipliers for travel time)
    weekdayMorning: { start: 7, end: 9, multiplier: 1.5 },
    weekdayEvening: { start: 16, end: 19, multiplier: 1.6 },
    weekendMidday: { start: 11, end: 15, multiplier: 1.2 },
};

// Known event locations that cause traffic (Richmond/Henrico/Chesterfield area)
const TRAFFIC_EVENT_LOCATIONS = [
    { name: 'VCU Campus', coords: [37.5488, -77.4529], radius: 2, impact: 1.3 },
    { name: 'Short Pump Town Center', coords: [37.6521, -77.6094], radius: 1.5, impact: 1.4 },
    { name: 'Richmond Coliseum', coords: [37.5463, -77.4335], radius: 1, impact: 1.5 },
    { name: 'The Diamond', coords: [37.5641, -77.4636], radius: 1, impact: 1.3 },
    { name: 'Downtown Richmond', coords: [37.5407, -77.4360], radius: 2, impact: 1.3 },
    { name: 'I-64/I-95 Interchange', coords: [37.5325, -77.4122], radius: 1, impact: 1.4 },
    { name: 'I-295/I-64 Interchange', coords: [37.5016, -77.3513], radius: 1, impact: 1.3 },
];

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// Get historical traffic multiplier based on current time
export const getHistoricalTrafficMultiplier = () => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Weekend pattern
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        const { start, end, multiplier } = HISTORICAL_PATTERNS.weekendMidday;
        if (hour >= start && hour < end) {
            return multiplier;
        }
        return 1.0;
    }

    // Weekday patterns
    const { start: morningStart, end: morningEnd, multiplier: morningMultiplier } = HISTORICAL_PATTERNS.weekdayMorning;
    const { start: eveningStart, end: eveningEnd, multiplier: eveningMultiplier } = HISTORICAL_PATTERNS.weekdayEvening;

    if (hour >= morningStart && hour < morningEnd) {
        return morningMultiplier;
    }
    if (hour >= eveningStart && hour < eveningEnd) {
        return eveningMultiplier;
    }

    // Off-peak hours
    return 1.0;
};

// Check if route passes near known traffic event locations
export const getEventTrafficImpact = (routeCoordinates) => {
    if (!routeCoordinates || routeCoordinates.length === 0) return 1.0;

    let maxImpact = 1.0;
    let affectedLocation = null;

    TRAFFIC_EVENT_LOCATIONS.forEach(event => {
        routeCoordinates.forEach(coord => {
            const distance = calculateDistance(
                coord[0], coord[1],
                event.coords[0], event.coords[1]
            );
            
            if (distance <= event.radius) {
                if (event.impact > maxImpact) {
                    maxImpact = event.impact;
                    affectedLocation = event.name;
                }
            }
        });
    });

    return { multiplier: maxImpact, location: affectedLocation };
};

// Analyze real-time events from active calls (accidents, road closures, etc.)
export const analyzeRealTimeEvents = (activeCalls, routeCoordinates) => {
    if (!activeCalls || activeCalls.length === 0 || !routeCoordinates) {
        return { multiplier: 1.0, events: [] };
    }

    let multiplier = 1.0;
    const affectedEvents = [];

    const trafficIncidents = activeCalls.filter(call => {
        const incident = call.incident?.toLowerCase() || '';
        return incident.includes('accident') || 
               incident.includes('crash') || 
               incident.includes('collision') ||
               incident.includes('disabled vehicle') ||
               incident.includes('traffic') ||
               incident.includes('road closure');
    });

    trafficIncidents.forEach(incident => {
        if (!incident.latitude || !incident.longitude) return;

        routeCoordinates.forEach(coord => {
            const distance = calculateDistance(
                coord[0], coord[1],
                incident.latitude, incident.longitude
            );

            // If incident is within 0.5 km of route
            if (distance <= 0.5) {
                multiplier = Math.max(multiplier, 1.4);
                affectedEvents.push({
                    type: incident.incident,
                    location: incident.location,
                    distance: distance.toFixed(1)
                });
            }
        });
    });

    return { multiplier, events: affectedEvents };
};

// Calculate predictive ETA with all factors
export const calculatePredictiveETA = (baseDuration, routeCoordinates, activeCalls = []) => {
    // Base duration in seconds
    let adjustedDuration = baseDuration;

    // Apply historical traffic patterns
    const historicalMultiplier = getHistoricalTrafficMultiplier();
    adjustedDuration *= historicalMultiplier;

    // Check for known event locations
    const eventImpact = getEventTrafficImpact(routeCoordinates);
    adjustedDuration *= eventImpact.multiplier;

    // Check for real-time incidents
    const realtimeImpact = analyzeRealTimeEvents(activeCalls, routeCoordinates);
    adjustedDuration *= realtimeImpact.multiplier;

    // Calculate ETA
    const now = new Date();
    const etaTime = new Date(now.getTime() + adjustedDuration * 1000);
    const etaFormatted = etaTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const durationMins = Math.round(adjustedDuration / 60);
    const baseDurationMins = Math.round(baseDuration / 60);
    const delayMins = durationMins - baseDurationMins;

    return {
        duration: adjustedDuration,
        durationMins,
        etaFormatted,
        baseDuration,
        delay: delayMins,
        factors: {
            historical: historicalMultiplier > 1.0,
            historicalMultiplier,
            eventLocation: eventImpact.location,
            eventMultiplier: eventImpact.multiplier,
            realtimeEvents: realtimeImpact.events,
            realtimeMultiplier: realtimeImpact.multiplier
        }
    };
};

// Get traffic advisory message
export const getTrafficAdvisory = (predictiveData) => {
    const { delay, factors } = predictiveData;
    
    if (delay <= 2) return null;

    const reasons = [];
    if (factors.historical) {
        reasons.push('rush hour traffic');
    }
    if (factors.eventLocation) {
        reasons.push(`congestion near ${factors.eventLocation}`);
    }
    if (factors.realtimeEvents && factors.realtimeEvents.length > 0) {
        reasons.push(`${factors.realtimeEvents.length} incident(s) on route`);
    }

    const reasonText = reasons.length > 0 ? ` due to ${reasons.join(', ')}` : '';
    
    return {
        severity: delay >= 10 ? 'high' : delay >= 5 ? 'medium' : 'low',
        message: `Expect ${delay}+ min delay${reasonText}`,
        details: factors.realtimeEvents || []
    };
};

// Proactive route comparison with predictive traffic
export const compareRoutesWithPredictiveTraffic = (routes, activeCalls = []) => {
    if (!routes || routes.length === 0) return routes;

    return routes.map(route => {
        const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        const predictiveData = calculatePredictiveETA(route.duration, coordinates, activeCalls);
        
        return {
            ...route,
            predictive: predictiveData,
            adjustedDuration: predictiveData.duration,
            advisory: getTrafficAdvisory(predictiveData)
        };
    });
};