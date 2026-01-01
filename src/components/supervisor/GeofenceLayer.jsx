import React, { useEffect, useState } from 'react';
import { Circle, Popup } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';

export default function GeofenceLayer({ onGeofenceClick }) {
    const [geofences, setGeofences] = useState([]);

    useEffect(() => {
        const loadGeofences = async () => {
            try {
                const data = await base44.entities.Geofence.filter({ active: true });
                setGeofences(data || []);
            } catch (error) {
                console.error('Error loading geofences:', error);
            }
        };

        loadGeofences();
        const interval = setInterval(loadGeofences, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            {geofences.map(fence => (
                <Circle
                    key={fence.id}
                    center={[fence.latitude, fence.longitude]}
                    radius={fence.radius_meters}
                    pathOptions={{
                        color: fence.color || '#3B82F6',
                        fillColor: fence.color || '#3B82F6',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '5, 10'
                    }}
                    eventHandlers={{
                        click: () => onGeofenceClick && onGeofenceClick(fence)
                    }}
                >
                    <Popup>
                        <div className="text-sm">
                            <div className="font-bold text-gray-900">{fence.name}</div>
                            <div className="text-gray-600 text-xs mt-1">
                                Radius: {fence.radius_meters}m
                            </div>
                            <div className="flex gap-1 mt-2">
                                {fence.alert_on_entry && (
                                    <Badge className="bg-green-100 text-green-700 text-xs">
                                        Entry
                                    </Badge>
                                )}
                                {fence.alert_on_exit && (
                                    <Badge className="bg-orange-100 text-orange-700 text-xs">
                                        Exit
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </Popup>
                </Circle>
            ))}
        </>
    );
}