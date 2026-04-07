import React from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

// Icon based on incident type and agency
const createCallIcon = (call, isHighPriority = false) => {
    const incident = call.incident?.toLowerCase() || '';
    const agency = call.agency || '';
    const isApproximate = call.geo_approximate === true;
    
    // Determine if it's EMS, Police, or Fire
    const isEMS = incident.includes('ems') || incident.includes('medical') || 
                  incident.includes('ambulance') || incident.includes('unconscious') ||
                  incident.includes('overdose') || incident.includes('hemorrhage') ||
                  incident.includes('stroke') || incident.includes('cardiac');
    
    const isFire = agency.includes('FD') || incident.includes('fire') || 
                   incident.includes('smoke') || incident.includes('alarm');
    
    // Determine status color
    let statusColor = '#EF4444';
    if (call.status?.toLowerCase().includes('arrived') || 
        call.status?.toLowerCase().includes('arv') || 
        call.status?.toLowerCase().includes('on scene')) {
        statusColor = '#10B981';
    }
    
    // Choose icon and color
    let iconSvg = '';
    let bgColor = '#1E40AF'; // Blue for police (default)
    
    if (isEMS) {
        bgColor = '#D97706'; // Amber for EMS
        iconSvg = `<text x="20" y="26" font-size="18" text-anchor="middle" font-family="Arial">🚑</text>`;
    } else if (isFire) {
        bgColor = '#DC2626'; // Red for fire
        iconSvg = `<text x="20" y="26" font-size="18" text-anchor="middle" font-family="Arial">🔥</text>`;
    } else {
        bgColor = '#1E40AF';
        iconSvg = `<text x="20" y="26" font-size="16" text-anchor="middle" font-family="Arial" fill="white" font-weight="bold">PD</text>`;
    }

    // Approximate locations: yellow ring + dashed border
    const outerRing = isApproximate
        ? `<circle cx="20" cy="20" r="18" fill="none" stroke="#FBBF24" stroke-width="3" stroke-dasharray="4 2"/>`
        : '';
    const approxBadge = isApproximate
        ? `<circle cx="8" cy="8" r="6" fill="#FBBF24" stroke="white" stroke-width="1.5"/>
           <text x="8" y="12" font-size="8" text-anchor="middle" font-family="Arial" fill="black" font-weight="bold">~</text>`
        : '';

    return new L.DivIcon({
        className: 'custom-call-marker',
        html: `
            <div style="position:relative;width:40px;height:40px;">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="${bgColor}" stroke="${isHighPriority ? '#EF4444' : 'white'}" stroke-width="${isApproximate ? 1.5 : 3}" ${isApproximate ? 'opacity="0.75"' : ''}/>
                    ${iconSvg}
                    <circle cx="32" cy="8" r="6" fill="${statusColor}" stroke="white" stroke-width="2"/>
                    ${outerRing}
                    ${approxBadge}
                </svg>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
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
        console.log('🗺️ ActiveCallMarkers: No calls provided');
        return null;
    }
    
    console.log(`🗺️ ActiveCallMarkers: Rendering ${calls.length} calls on map`);
    
    const validCalls = calls.filter(call => {
        const hasCoords = call.latitude && call.longitude && 
               !isNaN(parseFloat(call.latitude)) && !isNaN(parseFloat(call.longitude)) &&
               parseFloat(call.latitude) !== 0 && parseFloat(call.longitude) !== 0;
        
        if (!hasCoords) {
            const isUnmappable = call.geo_confidence === 'unmappable';
            if (isUnmappable) {
                console.log(`🚫 UNMAPPABLE: ${call.incident} @ ${call.location}`);
            } else {
                console.log(`❌ NO COORDS: ${call.incident} @ ${call.location} [${call.agency}]`);
            }
        }
        
        return hasCoords;
    });
    
    console.log(`🗺️ FINAL: ${validCalls.length}/${calls.length} calls will render on map`);
    
    if (validCalls.length === 0) {
        console.warn('⚠️ No calls with valid coordinates to display on map');
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
                        key={call.id || `call-${index}-${call.time_received}-${call.incident}`}
                        position={position}
                        icon={icon}
                        eventHandlers={{
                            click: () => {
                                if (onCallClick) onCallClick(call);
                            }
                        }}
                    />
                );
            })}
        </>
    );
}