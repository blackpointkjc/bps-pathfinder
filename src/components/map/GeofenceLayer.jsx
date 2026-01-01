import React, { useEffect, useState } from 'react';
import { Circle, Popup } from 'react-leaflet';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertCircle, Shield, AlertTriangle } from 'lucide-react';

export default function GeofenceLayer({ currentLocation, currentUserId, onGeofenceAlert }) {
    const [geofences, setGeofences] = useState([]);
    const [userGeofenceState, setUserGeofenceState] = useState({});

    useEffect(() => {
        fetchGeofences();
        const interval = setInterval(fetchGeofences, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (currentLocation && currentUserId) {
            checkGeofences();
        }
    }, [currentLocation, geofences]);

    const fetchGeofences = async () => {
        try {
            const data = await base44.entities.Geofence.filter({ active: true });
            setGeofences(data || []);
        } catch (error) {
            console.error('Error fetching geofences:', error);
        }
    };

    const checkGeofences = () => {
        if (!currentLocation || !currentUserId) return;

        geofences.forEach(geofence => {
            const distance = getDistance(
                currentLocation,
                [geofence.center_lat, geofence.center_lng]
            );
            
            const isInside = distance * 1000 <= geofence.radius_meters;
            const wasInside = userGeofenceState[geofence.id];

            if (isInside && !wasInside) {
                // Entered geofence
                if (geofence.alert_on_entry) {
                    const priority = geofence.priority || 'medium';
                    const message = `Entering ${geofence.name}`;
                    
                    if (priority === 'critical' || priority === 'high') {
                        toast.error(message, {
                            icon: '🚨',
                            duration: 8000,
                            description: geofence.description
                        });
                    } else {
                        toast.warning(message, {
                            duration: 5000,
                            description: geofence.description
                        });
                    }
                    
                    if (onGeofenceAlert) {
                        onGeofenceAlert({
                            type: 'entry',
                            geofence,
                            timestamp: new Date()
                        });
                    }
                }
            } else if (!isInside && wasInside) {
                // Exited geofence
                if (geofence.alert_on_exit) {
                    toast.info(`Exited ${geofence.name}`, {
                        duration: 3000
                    });
                    
                    if (onGeofenceAlert) {
                        onGeofenceAlert({
                            type: 'exit',
                            geofence,
                            timestamp: new Date()
                        });
                    }
                }
            }

            setUserGeofenceState(prev => ({
                ...prev,
                [geofence.id]: isInside
            }));
        });
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

    const getGeofenceColor = (type, priority) => {
        if (priority === 'critical') return '#DC2626';
        if (type === 'incident') return '#EF4444';
        if (type === 'high_crime') return '#F59E0B';
        if (type === 'restricted') return '#8B5CF6';
        return '#3B82F6';
    };

    return (
        <>
            {geofences.map(geofence => (
                <Circle
                    key={geofence.id}
                    center={[geofence.center_lat, geofence.center_lng]}
                    radius={geofence.radius_meters}
                    pathOptions={{
                        color: getGeofenceColor(geofence.type, geofence.priority),
                        fillColor: getGeofenceColor(geofence.type, geofence.priority),
                        fillOpacity: 0.15,
                        weight: 2,
                        dashArray: '10, 5'
                    }}
                >
                    <Popup>
                        <div className="text-xs">
                            <div className="flex items-center gap-2 mb-2">
                                {geofence.priority === 'critical' ? (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                ) : geofence.type === 'high_crime' ? (
                                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                                ) : (
                                    <Shield className="w-4 h-4 text-blue-600" />
                                )}
                                <p className="font-bold">{geofence.name}</p>
                            </div>
                            {geofence.description && (
                                <p className="text-gray-600 mb-1">{geofence.description}</p>
                            )}
                            <p className="text-gray-500">
                                Type: <span className="font-semibold capitalize">{geofence.type.replace('_', ' ')}</span>
                            </p>
                            <p className="text-gray-500">
                                Radius: <span className="font-semibold">{geofence.radius_meters}m</span>
                            </p>
                        </div>
                    </Popup>
                </Circle>
            ))}
        </>
    );
}