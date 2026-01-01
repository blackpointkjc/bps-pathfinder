import React, { useEffect, useState } from 'react';
import { Polyline, Popup } from 'react-leaflet';
import { calculatePredictiveETA } from './PredictiveTraffic';

// Major roads and arteries in Richmond/Henrico/Chesterfield area
const MAJOR_ROUTES = [
    { name: 'I-95 North', coords: [[37.5407, -77.4360], [37.5641, -77.4489], [37.5888, -77.4512]] },
    { name: 'I-95 South', coords: [[37.5407, -77.4360], [37.5121, -77.4122], [37.4823, -77.3891]] },
    { name: 'I-64 West', coords: [[37.5407, -77.4360], [37.5521, -77.4829], [37.5688, -77.5421]] },
    { name: 'I-64 East', coords: [[37.5407, -77.4360], [37.5325, -77.3912], [37.5216, -77.3234]] },
    { name: 'Hull Street Rd', coords: [[37.5107, -77.4560], [37.4982, -77.5121], [37.4856, -77.5689]] },
    { name: 'Broad Street', coords: [[37.5540, -77.4640], [37.5521, -77.5121], [37.5498, -77.5698]] },
    { name: 'Midlothian Turnpike', coords: [[37.5088, -77.5521], [37.4956, -77.6089], [37.4823, -77.6512]] },
];

export default function LiveTrafficFlow({ activeCalls = [], currentLocation }) {
    const [trafficData, setTrafficData] = useState([]);

    useEffect(() => {
        // Update traffic flow every 30 seconds
        updateTrafficFlow();
        const interval = setInterval(updateTrafficFlow, 30000);
        return () => clearInterval(interval);
    }, [activeCalls]);

    const updateTrafficFlow = () => {
        const now = new Date();
        const hour = now.getHours();
        
        const updatedRoutes = MAJOR_ROUTES.map(route => {
            // Calculate traffic level based on time of day
            let baseTraffic = 1.0;
            
            // Rush hour traffic (7-9 AM, 4-7 PM on weekdays)
            const dayOfWeek = now.getDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            
            if (isWeekday) {
                if (hour >= 7 && hour <= 9) baseTraffic = 1.6;
                else if (hour >= 16 && hour <= 19) baseTraffic = 1.7;
                else if (hour >= 12 && hour <= 14) baseTraffic = 1.2;
            }
            
            // Check for nearby incidents
            let incidentMultiplier = 1.0;
            activeCalls.forEach(call => {
                if (call.latitude && call.longitude) {
                    route.coords.forEach(coord => {
                        const dist = getDistance(coord, [call.latitude, call.longitude]);
                        if (dist < 2) { // Within 2 km
                            incidentMultiplier = Math.max(incidentMultiplier, 1.4);
                        }
                    });
                }
            });
            
            const totalMultiplier = baseTraffic * incidentMultiplier;
            
            // Determine traffic level and color
            let level, color, speedMph;
            if (totalMultiplier >= 1.5) {
                level = 'heavy';
                color = '#EF4444'; // Red
                speedMph = 15;
            } else if (totalMultiplier >= 1.2) {
                level = 'moderate';
                color = '#F59E0B'; // Orange
                speedMph = 35;
            } else {
                level = 'free';
                color = '#10B981'; // Green
                speedMph = 55;
            }
            
            return {
                ...route,
                level,
                color,
                speedMph,
                multiplier: totalMultiplier
            };
        });
        
        setTrafficData(updatedRoutes);
    };

    const getDistance = (coord1, coord2) => {
        const R = 6371; // Earth radius in km
        const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
        const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    return (
        <>
            {trafficData.map((route, idx) => (
                <Polyline
                    key={`traffic-${idx}`}
                    positions={route.coords}
                    pathOptions={{
                        color: route.color,
                        weight: 8,
                        opacity: 0.7,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                >
                    <Popup>
                        <div className="text-xs">
                            <p className="font-bold mb-1">{route.name}</p>
                            <p className="text-gray-600">
                                Traffic: <span className="font-semibold">{route.level}</span>
                            </p>
                            <p className="text-gray-600">
                                Speed: <span className="font-semibold">~{route.speedMph} mph</span>
                            </p>
                        </div>
                    </Popup>
                </Polyline>
            ))}
        </>
    );
}