import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Car, Radio, Clock } from 'lucide-react';

// Get agency label from unit data
const getAgencyLabel = (unitNumber) => {
    if (!unitNumber) return 'UNIT';
    const num = unitNumber.toString().toUpperCase();
    
    if (num.includes('HENRICO') || num.includes('HPD')) return 'HPD';
    if (num.includes('RICHMOND') || num.includes('RPD')) return 'RPD';
    if (num.includes('CHESTERFIELD') || num.includes('CCPD')) return 'CCPD';
    if (num.includes('HFD')) return 'HFD';
    
    return num.slice(0, 4) || 'UNIT';
};

// Create icons for other units based on status with agency labels
const createOtherUnitIcon = (status, heading, showLights, isSupervisor, unitNumber) => {
    let color = '#6B7280'; // Gray for Available
    if (status === 'Enroute') color = '#EF4444'; // Red
    else if (status === 'On Scene') color = '#10B981'; // Green
    else if (status === 'On Patrol') color = '#6366F1'; // Indigo
    else if (status === 'Busy') color = '#F59E0B'; // Orange
    else if (status === 'Out of Service') color = '#9CA3AF'; // Light gray

    if (isSupervisor) {
        color = '#EAB308'; // Gold/Yellow
    }

    const normalizedHeading = heading ? ((heading % 360) + 360) % 360 : 0;
    const agencyLabel = getAgencyLabel(unitNumber);

    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 50px; height: 50px; transform: rotate(${normalizedHeading}deg); transition: transform 0.3s ease;">
                <div style="
                    width: 50px;
                    height: 50px;
                    background: ${color};
                    border: 3px solid ${isSupervisor ? '#FFD700' : 'white'};
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                ">
                    ${showLights ? `
                        <div style="position: absolute; top: 3px; left: 10px; width: 6px; height: 6px; background: #FF0000; border-radius: 50%; animation: blink1 0.8s infinite;"></div>
                        <div style="position: absolute; top: 3px; right: 10px; width: 6px; height: 6px; background: #0000FF; border-radius: 50%; animation: blink2 0.8s infinite;"></div>
                    ` : ''}
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 10px;
                        font-family: system-ui, -apple-system, sans-serif;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
                    ">${agencyLabel}</span>
                    <div style="
                        position: absolute;
                        top: -5px;
                        width: 0;
                        height: 0;
                        border-left: 8px solid transparent;
                        border-right: 8px solid transparent;
                        border-bottom: 12px solid ${color};
                    "></div>
                </div>
                <style>
                    @keyframes blink1 {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                    @keyframes blink2 {
                        0%, 100% { opacity: 0; }
                        50% { opacity: 1; }
                    }
                </style>
            </div>
        `,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
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
    
    // Filter out current user and units with show_on_map = false
    const otherUnits = units.filter(unit => {
        if (unit.id === currentUserId) return false;
        if (unit.show_on_map === false) return false;
        return true;
    });

    if (otherUnits.length === 0) return null;
    
    return (
        <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={(cluster) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="
                        background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
                        color: white;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: 14px;
                        border: 3px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    ">${count}</div>`,
                    className: 'custom-cluster-icon',
                    iconSize: [40, 40]
                });
            }}
        >
            {otherUnits.map((unit) => (
                <Marker
                    key={unit.id}
                    position={[unit.latitude, unit.longitude]}
                    icon={createOtherUnitIcon(unit.status, unit.heading, unit.show_lights, unit.is_supervisor, unit.unit_number)}
                >
                        <Popup>
                            <div className="p-3 min-w-[240px]">
                                <div className="flex items-start gap-3 mb-3 pb-3 border-b">
                                    <div className={`w-10 h-10 rounded-full ${unit.is_supervisor ? 'bg-yellow-100' : 'bg-blue-100'} flex items-center justify-center flex-shrink-0`}>
                                        <Car className={`w-5 h-5 ${unit.is_supervisor ? 'text-yellow-600' : 'text-blue-600'}`} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-gray-900">
                                            {unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name || 'Unknown'}
                                            {unit.is_supervisor && <span className="ml-2 text-yellow-600">★</span>}
                                        </p>
                                        <p className="text-xs text-blue-600 font-semibold">
                                            {unit.unit_number || 'No Unit ID'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">Status:</span>
                                        <Badge className={getStatusColor(unit.status)}>
                                            {unit.status || 'Available'}
                                        </Badge>
                                    </div>

                                    {unit.speed !== undefined && unit.speed !== null && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">Speed:</span>
                                            <span className="text-sm font-bold text-gray-900">{Math.round(unit.speed)} mph</span>
                                        </div>
                                    )}

                                    {unit.current_call_info && (
                                        <div className="pt-2 border-t">
                                            <div className="flex items-start gap-2">
                                                <Radio className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-xs text-gray-700 leading-relaxed">{unit.current_call_info}</span>
                                            </div>
                                        </div>
                                    )}

                                    {unit.last_updated && (
                                        <div className="flex items-center gap-1.5 text-gray-500 pt-2 border-t">
                                            <Clock className="w-3 h-3" />
                                            <span className="text-xs">Last seen: {new Date(unit.last_updated).toLocaleTimeString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Popup>
                        </Marker>
                        ))}
                        </MarkerClusterGroup>
                        );
                        }