import { Polyline } from 'react-leaflet';

// Display only real provider-supplied traffic sections. No randomized or
// fabricated traffic data on a safety/dispatch map.
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