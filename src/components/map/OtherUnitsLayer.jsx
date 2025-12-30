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
const createOtherUnitIcon = (status, heading, showLights, isSupervisor, unitNumber, isUnionLead) => {
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

    // Determine if unit should show lights - green for dispatched/enroute/on scene
    const shouldShowLights = status === 'Dispatched' || status === 'Enroute' || status === 'On Scene';
    const lightsColor = shouldShowLights ? '#00FF00' : null;

    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 50px; height: 50px; transform: rotate(${normalizedHeading}deg); transition: transform 0.3s ease;">
                <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" style="position: relative; z-index: 2; filter: drop-shadow(0 3px 10px rgba(0,0,0,0.4));">
                    ${lightsColor ? `
                    <circle cx="8" cy="5" r="1.8" fill="${lightsColor}">
                        <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="16" cy="5" r="1.8" fill="${lightsColor}">
                        <animate attributeName="opacity" values="0;1;0" dur="0.8s" repeatCount="indefinite"/>
                    </circle>
                    ` : ''}
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" fill="${color}" stroke="${isSupervisor ? '#FFD700' : (lightsColor ? lightsColor : '#1E3A8A')}" stroke-width="0.8"/>
                    <circle cx="7" cy="17" r="2.2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <circle cx="17" cy="17" r="2.2" fill="#1F2937" stroke="#111827" stroke-width="0.5"/>
                    <rect x="6" y="10.5" width="3.5" height="2.5" fill="#60A5FA" rx="0.5"/>
                    <rect x="11" y="10.5" width="3.5" height="2.5" fill="#60A5FA" rx="0.5"/>
                    <polygon points="12,1 15,7 9,7" fill="${color}" stroke="${isSupervisor ? '#FFD700' : (lightsColor ? lightsColor : '#1E3A8A')}" stroke-width="0.8"/>
                </svg>
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
    
    // Group units by union and filter
    const unitsToShow = [];
    const processedUnionIds = new Set();
    
    units.forEach(unit => {
        // Skip current user, hidden units, and Out of Service units
        if (unit.id === currentUserId || unit.show_on_map === false || unit.status === 'Out of Service') return;
        
        // If unit is in a union
        if (unit.union_id) {
            // Only process each union once
            if (processedUnionIds.has(unit.union_id)) return;
            processedUnionIds.add(unit.union_id);
            
            // Find all members of this union
            const unionMembers = units.filter(u => u.union_id === unit.union_id);
            
            // Find highest ranking officer (lowest unit number or first alphabetically)
            const leadUnit = unionMembers.sort((a, b) => {
                const aNum = parseInt(a.unit_number) || 999;
                const bNum = parseInt(b.unit_number) || 999;
                return aNum - bNum;
            })[0];
            
            // Mark as union leader
            unitsToShow.push({
                ...leadUnit,
                isUnionLead: true,
                unionMembers: unionMembers.length
            });
        } else {
            // Regular unit, not in union
            unitsToShow.push(unit);
        }
    });

    if (unitsToShow.length === 0) return null;
    
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
            {unitsToShow.map((unit) => (
                <Marker
                    key={unit.id}
                    position={[unit.latitude, unit.longitude]}
                    icon={createOtherUnitIcon(unit.status, unit.heading, unit.show_lights, unit.is_supervisor, unit.unit_number, unit.isUnionLead)}
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
                                            {unit.isUnionLead && (
                                                <Badge className="ml-2 bg-green-600 text-white text-xs">
                                                    {unit.unionMembers} Unit Group
                                                </Badge>
                                            )}
                                        </p>
                                        <p className="text-xs text-blue-600 font-semibold">
                                            {unit.union_id || unit.unit_number || 'No Unit ID'}
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