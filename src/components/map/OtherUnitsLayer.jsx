import React from 'react';
import { Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Car, Radio, Clock, MapPin } from 'lucide-react';

// Create icons for other units based on status
const createOtherUnitIcon = (status, heading, showLights) => {
    let color = '#6B7280'; // Gray for Available
    if (status === 'Enroute') color = '#EF4444'; // Red
    else if (status === 'On Scene') color = '#10B981'; // Green
    else if (status === 'On Patrol') color = '#6366F1'; // Indigo
    else if (status === 'Busy') color = '#F59E0B'; // Orange
    else if (status === 'Out of Service') color = '#9CA3AF'; // Light gray

    // Normalize heading to 0-360
    const normalizedHeading = heading ? ((heading % 360) + 360) % 360 : 0;

    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 36px; height: 36px; transform: rotate(${normalizedHeading}deg); transition: transform 0.3s ease;">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));">
                    ${showLights ? `
                    <circle cx="8" cy="5" r="1.5" fill="#FF0000">
                        <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="16" cy="5" r="1.5" fill="#0000FF">
                        <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite"/>
                    </circle>
                    ` : ''}
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" fill="${color}" stroke="white" stroke-width="1"/>
                    <circle cx="7" cy="17" r="2" fill="#1F2937" stroke="white" stroke-width="0.5"/>
                    <circle cx="17" cy="17" r="2" fill="#1F2937" stroke="white" stroke-width="0.5"/>
                    <rect x="6" y="10.5" width="3" height="2" fill="white" opacity="0.7" rx="0.5"/>
                    <rect x="11" y="10.5" width="3" height="2" fill="white" opacity="0.7" rx="0.5"/>
                    <polygon points="12,1 14,7 10,7" fill="${color}" stroke="white" stroke-width="0.8"/>
                </svg>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
};

const getStatusColor = (status) => {
    switch (status) {
        case 'Available': return 'bg-gray-100 text-gray-700';
        case 'Enroute': return 'bg-red-100 text-red-700';
        case 'On Scene': return 'bg-green-100 text-green-700';
        case 'Busy': return 'bg-orange-100 text-orange-700';
        case 'Out of Service': return 'bg-gray-100 text-gray-500';
        default: return 'bg-gray-100 text-gray-700';
    }
};

export default function OtherUnitsLayer({ units, currentUserId, onUnitClick }) {
    if (!units || units.length === 0) return null;
    
    // Filter out current user's unit
    const otherUnits = units.filter(unit => unit.id !== currentUserId);
    
    return (
        <>
            {otherUnits.map((unit) => (
                <React.Fragment key={unit.id}>
                    <Marker
                        position={[unit.latitude, unit.longitude]}
                        icon={createOtherUnitIcon(unit.status, unit.heading, unit.show_lights)}
                        eventHandlers={{
                            click: () => onUnitClick && onUnitClick(unit)
                        }}
                    >
                        <Popup>
                            <div className="p-2 min-w-[200px]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Car className="w-4 h-4 text-blue-600" />
                                    <div>
                                        <p className="font-bold text-base text-blue-600">
                                            Unit {unit.unit_number || 'Unknown'}
                                        </p>
                                        <p className="text-xs text-gray-600">
                                            {unit.full_name?.split(' ').pop() || ''}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="space-y-1 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">Status:</span>
                                        <Badge className={getStatusColor(unit.status)}>
                                            {unit.status || 'Unknown'}
                                        </Badge>
                                    </div>
                                    
                                    {unit.speed !== undefined && unit.speed !== null && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Speed:</span>
                                            <span className="font-semibold">{Math.round(unit.speed)} mph</span>
                                        </div>
                                    )}
                                    
                                    {unit.current_call_info && (
                                        <div className="pt-1 border-t">
                                            <div className="flex items-start gap-1">
                                                <Radio className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-gray-700 text-xs">{unit.current_call_info}</span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center gap-1 text-gray-500 pt-1">
                                        <Clock className="w-3 h-3" />
                                        <span>Updated: {new Date(unit.last_updated).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                </React.Fragment>
            ))}
        </>
    );
}