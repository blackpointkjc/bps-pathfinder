import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import HistoricalCallAlert from './HistoricalCallAlert';
import { Clock, MapPin, Radio } from 'lucide-react';

// Icon based on incident type and agency
const createCallIcon = (call, isHighPriority = false) => {
    const incident = call.incident?.toLowerCase() || '';
    const agency = call.agency || '';
    const isDispatch = call.source === 'dispatch';
    
    // Determine if it's EMS, Police, or Fire
    // IMPORTANT: Firearm/gunfire/shooting are POLICE calls, not fire/EMS
    const isPoliceFirearmCall = incident.includes('firearm') || 
                                incident.includes('gun') || 
                                incident.includes('shooting') || 
                                incident.includes('shots fired') ||
                                incident.includes('weapon');
    
    const isEMS = !isPoliceFirearmCall && (
                  incident.includes('ems') || incident.includes('medical') || 
                  incident.includes('ambulance') || incident.includes('unconscious') ||
                  incident.includes('overdose') || incident.includes('hemorrhage') ||
                  incident.includes('stroke') || incident.includes('cardiac'));
    
    const isFire = !isPoliceFirearmCall && (
                   agency.includes('FD') || incident.includes('fire') || 
                   incident.includes('smoke') || incident.includes('alarm'));
    
    // Determine status color
    let statusColor = '#EF4444';
    if (call.status?.toLowerCase().includes('arrived') || 
        call.status?.toLowerCase().includes('arv') || 
        call.status?.toLowerCase().includes('on scene')) {
        statusColor = '#10B981';
    }
    
    // Choose icon and color
    let icon = '';
    let bgColor = '#1E40AF'; // Blue for police (default)
    
    if (isEMS) {
        bgColor = '#F59E0B'; // Amber for EMS
        icon = '🚨';
    } else if (isFire) {
        bgColor = '#DC2626'; // Red for fire
        icon = '🚨';
    } else {
        // Police
        bgColor = '#1E40AF';
        icon = '👮';
    }
    
    const pulseAnimation = isHighPriority ? `
        @keyframes flashPulse {
            0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            50% { transform: scale(1.2); opacity: 0.9; box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
    ` : `
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
    `;

    return new L.DivIcon({
        className: 'custom-call-marker',
        html: `
            <div style="
                position: relative;
                width: 36px;
                height: 36px;
            ">
                <div style="
                    width: 36px;
                    height: 36px;
                    background: ${bgColor};
                    border: 3px solid ${isHighPriority ? '#EF4444' : 'white'};
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    animation: ${isHighPriority ? 'flashPulse 1.5s infinite' : 'pulse 2s infinite'};
                ">${icon}</div>
                <div style="
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    width: 10px;
                    height: 10px;
                    background: ${statusColor};
                    border: 2px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                "></div>
                <style>
                    ${pulseAnimation}
                </style>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
};

// Priority assessment
const assessCallPriority = (call) => {
    const incident = call.incident?.toLowerCase() || '';
    const description = call.description?.toLowerCase() || '';
    const combined = `${incident} ${description}`;

    if (
        combined.includes('shooting') ||
        combined.includes('stabbing') ||
        combined.includes('officer down') ||
        combined.includes('shots fired') ||
        combined.includes('active shooter') ||
        combined.includes('code 3') ||
        combined.includes('10-00') ||
        incident.includes('cardiac arrest') ||
        incident.includes('person with gun')
    ) {
        return { level: 'critical', score: 4 };
    }

    if (
        combined.includes('assault') ||
        combined.includes('robbery') ||
        combined.includes('burglary in progress') ||
        combined.includes('domestic') ||
        combined.includes('pursuit') ||
        combined.includes('accident with injury') ||
        combined.includes('fire') ||
        incident.includes('weapons')
    ) {
        return { level: 'high', score: 3 };
    }

    return { level: 'low', score: 1 };
};

export default function ActiveCallMarkers({ calls, onCallClick }) {
    if (!calls || calls.length === 0) {
        return null;
    }
    
    const validCalls = calls.filter(call => {
        return call.latitude && call.longitude && 
               !isNaN(call.latitude) && !isNaN(call.longitude) &&
               call.latitude !== 0 && call.longitude !== 0;
    });
    
    if (validCalls.length === 0) {
        return null;
    }
    
    return (
        <>
            {validCalls.map((call, index) => {
                const position = [call.latitude, call.longitude];
                const priority = assessCallPriority(call);
                const isHighPriority = priority.score >= 3;
                const icon = createCallIcon(call, isHighPriority);
                
                return (
                    <Marker
                        key={`call-${index}-${call.timeReceived}-${call.incident}`}
                        position={position}
                        icon={icon}
                        eventHandlers={{
                            click: () => {
                                if (onCallClick) {
                                    onCallClick(call);
                                }
                            }
                        }}
                    >
                        <Popup maxWidth={300}>
                            <div className="p-2">
                                <div className="flex items-start gap-2 mb-2">
                                    <Radio className="w-4 h-4 text-red-500 flex-shrink-0 mt-1" />
                                    <h3 className="font-bold text-sm text-[#1D1D1F] leading-tight">
                                        {call.incident}
                                    </h3>
                                </div>
                                
                                <div className="space-y-2 text-xs">
                                    {call.ai_summary && (
                                        <div className="bg-blue-50 p-2 rounded text-xs text-blue-900 font-medium mb-2">
                                            {call.ai_summary}
                                        </div>
                                    )}
                                    
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
                                        <span className="text-gray-700">{call.location}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                        <span className="text-gray-600">{call.timeReceived}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-wrap pt-1">
                                        <Badge 
                                            variant="secondary" 
                                            className="bg-blue-100 text-blue-700 text-xs"
                                        >
                                            {call.agency}
                                        </Badge>
                                        <Badge 
                                            variant="secondary"
                                            className={`text-xs ${
                                                call.incident.includes('EMS')
                                                    ? 'bg-yellow-100 text-yellow-700'
                                                    : call.status.includes('Arrived') || call.status.includes('ARRIVED')
                                                    ? 'bg-green-100 text-green-700'
                                                    : call.status.includes('Enroute') || call.status.includes('ENROUTE')
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-gray-100 text-gray-700'
                                            }`}
                                        >
                                            {call.status}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
}