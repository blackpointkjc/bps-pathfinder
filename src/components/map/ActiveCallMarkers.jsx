import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Radio } from 'lucide-react';

// Create custom markers for different agencies and statuses
const createCallIcon = (agency, status, incident) => {
    // Determine color based on status and incident type
    let color = '#FF3B30'; // Default red for enroute
    
    // Check for EMS calls first - always yellow
    if (incident.includes('EMS') || incident.includes('MEDICAL') || incident.includes('HEMORRHAGE') || 
        incident.includes('STROKE') || incident.includes('UNCONSCIOUSNESS') || incident.includes('OVERDOSE')) {
        color = '#FFD60A'; // Yellow for EMS
    }
    // Status-based colors for non-EMS
    else if (status.includes('Arrived') || status.includes('ARRIVED') || status.includes('ARV')) {
        color = '#34C759'; // Green for arrived
    } else if (status.includes('Enroute') || status.includes('ENROUTE') || status.includes('Dispatched')) {
        color = '#FF3B30'; // Red for enroute
    }
    
    // Agency-specific icons
    let iconSvg = '';
    if (agency === 'RPD') {
        // Richmond Police Department - Police car
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
            <circle cx="7" cy="17" r="2"></circle>
            <circle cx="17" cy="17" r="2"></circle>
        </svg>`;
    } else if (agency === 'CCPD') {
        // Chesterfield Police - Shield badge
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>`;
    } else if (agency === 'HPD' || agency === 'HCPD') {
        // Henrico Police - Star badge
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>`;
    } else if (agency === 'BPS') {
        // BPS - School badge
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" stroke-width="2">
            <path d="M12 2L2 7v6c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7z"></path>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#000"></path>
        </svg>`;
    } else {
        // Fire/EMS - Ambulance/Fire
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
            <path d="M10 17h4V5H2v12h3"></path>
            <circle cx="7" cy="17" r="2"></circle>
            <path d="M22 12h-5v5h3"></path>
            <circle cx="17" cy="17" r="2"></circle>
        </svg>`;
    }
    
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
                    background: ${agency === 'BPS' ? '#000000' : color};
                    border: 3px solid ${agency === 'BPS' ? '#FFD700' : 'white'};
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: pulse 2s infinite;
                ">
                    ${iconSvg}
                </div>
                <style>
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.1); opacity: 0.8; }
                    }
                </style>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
};

export default function ActiveCallMarkers({ calls }) {
    if (!calls || calls.length === 0) return null;
    
    return (
        <>
            {calls.map((call, index) => (
                <Marker
                    key={`call-${index}-${call.timeReceived}`}
                    position={[call.latitude, call.longitude]}
                    icon={createCallIcon(call.agency, call.status, call.incident)}
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
            ))}
        </>
    );
}