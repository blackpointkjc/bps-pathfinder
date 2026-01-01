import React, { useEffect, useState } from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { formatDistanceToNow } from 'date-fns';

export default function BreadcrumbTrail({ unitId, hoursBack = 24, color = '#3B82F6' }) {
    const [trail, setTrail] = useState([]);

    useEffect(() => {
        const loadTrail = async () => {
            try {
                const timeAgo = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
                const locations = await base44.entities.UnitLocationHistory.filter({
                    unit_id: unitId,
                    timestamp: { $gte: timeAgo }
                });

                if (locations && locations.length > 0) {
                    // Sort by timestamp
                    const sorted = locations.sort((a, b) => 
                        new Date(a.timestamp) - new Date(b.timestamp)
                    );
                    setTrail(sorted);
                }
            } catch (error) {
                console.error('Error loading breadcrumb trail:', error);
            }
        };

        if (unitId) {
            loadTrail();
            const interval = setInterval(loadTrail, 30000); // Refresh every 30s
            return () => clearInterval(interval);
        }
    }, [unitId, hoursBack]);

    if (trail.length === 0) return null;

    const pathCoords = trail.map(t => [t.latitude, t.longitude]);

    return (
        <>
            {/* Trail line */}
            <Polyline
                positions={pathCoords}
                color={color}
                weight={3}
                opacity={0.6}
                dashArray="5, 10"
            />

            {/* Breadcrumb points - show every 10th point to avoid clutter */}
            {trail.filter((_, idx) => idx % 10 === 0 || idx === trail.length - 1).map((point, idx) => (
                <CircleMarker
                    key={`${point.unit_id}-${point.timestamp}`}
                    center={[point.latitude, point.longitude]}
                    radius={4}
                    fillColor={color}
                    fillOpacity={0.7}
                    color="white"
                    weight={1}
                >
                    <Popup>
                        <div className="text-xs">
                            <div className="font-semibold">{point.unit_name}</div>
                            <div className="text-gray-600">{point.status}</div>
                            <div className="text-gray-500">
                                {formatDistanceToNow(new Date(point.timestamp), { addSuffix: true })}
                            </div>
                            {point.speed > 0 && (
                                <div className="text-gray-500">{Math.round(point.speed)} mph</div>
                            )}
                        </div>
                    </Popup>
                </CircleMarker>
            ))}
        </>
    );
}