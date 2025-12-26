import { useEffect } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Simulate traffic conditions for route segments
export function generateTrafficData(routeCoords) {
    if (!routeCoords || routeCoords.length < 2) return [];
    
    const segments = [];
    
    for (let i = 0; i < routeCoords.length - 1; i += 5) {
        const end = Math.min(i + 5, routeCoords.length - 1);
        const segmentCoords = routeCoords.slice(i, end + 1);
        
        // Randomly assign traffic conditions (in real app, this comes from API)
        const rand = Math.random();
        let condition;
        if (rand < 0.6) condition = 'free'; // 60% free flow
        else if (rand < 0.85) condition = 'moderate'; // 25% moderate
        else condition = 'heavy'; // 15% heavy
        
        segments.push({
            coords: segmentCoords,
            condition: condition
        });
    }
    
    return segments;
}

export default function TrafficLayer({ trafficSegments }) {
    if (!trafficSegments || trafficSegments.length === 0) return null;
    
    const getTrafficColor = (condition) => {
        switch (condition) {
            case 'free': return '#34C759'; // Green
            case 'moderate': return '#FF9500'; // Orange
            case 'heavy': return '#FF3B30'; // Red
            default: return '#007AFF';
        }
    };
    
    return (
        <>
            {trafficSegments.map((segment, index) => (
                <Polyline
                    key={`traffic-${index}`}
                    positions={segment.coords}
                    pathOptions={{
                        color: getTrafficColor(segment.condition),
                        weight: 6,
                        opacity: 0.8,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                />
            ))}
        </>
    );
}