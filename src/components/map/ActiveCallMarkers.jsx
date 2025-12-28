import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Radio } from 'lucide-react';

// Icon based on incident type and agency
const createCallIcon = (call) => {
    const incident = call.incident?.toLowerCase() || '';
    const agency = call.agency || '';
    const isDispatch = call.source === 'dispatch';
    
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
    
    // Special handling for dispatch calls
    if (isDispatch) {
        bgColor = '#000000'; // Black background
        iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" stroke-width="2">
                <polygon points="12,2 15,8.5 22,9.5 17,14.5 18,21.5 12,18 6,21.5 7,14.5 2,9.5 9,8.5"/>
            </svg>
        `;
    } else
    if (isEMS) {
        bgColor = '#F59E0B'; // Amber for EMS
        iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                <path d="M10 17h4V5H2v12h3"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M22 12h-5v5h3"/>
                <circle cx="17" cy="17" r="2"/>
            </svg>
        `;
    } else if (isFire) {
        bgColor = '#DC2626'; // Red for fire
        iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                <path d="M18 17h2v-6l-3-5H6v11"/>
                <circle cx="7" cy="17" r="2"/>
                <circle cx="17" cy="17" r="2"/>
                <path d="M6 11V6h3"/>
            </svg>
        `;
    } else {
        // Police car icon
        iconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <circle cx="17" cy="17" r="2"/>
            </svg>
        `;
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
                    background: ${bgColor};
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: pulse 2s infinite;
                ">
                    ${iconSvg}
                </div>
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

export default function ActiveCallMarkers({ calls, onCallClick }) {
    if (!calls || calls.length === 0) return null;
    
    const validCalls = calls.filter(call => 
        call.latitude && call.longitude && 
        !isNaN(call.latitude) && !isNaN(call.longitude)
    );
    
    if (validCalls.length === 0) return null;
    
    return (
        <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={(cluster) => {
                const count = cluster.getChildCount();
                let size = 'small';
                let bgColor = 'bg-red-500';
                
                if (count > 20) {
                    size = 'large';
                    bgColor = 'bg-red-700';
                } else if (count > 10) {
                    size = 'medium';
                    bgColor = 'bg-red-600';
                }
                
                return new L.DivIcon({
                    html: `<div class="flex items-center justify-center w-full h-full ${bgColor} text-white rounded-full font-bold border-4 border-white shadow-lg">${count}</div>`,
                    className: `marker-cluster marker-cluster-${size}`,
                    iconSize: new L.Point(50, 50)
                });
            }}
        >
            {validCalls.map((call, index) => {
                
                return (
                    <Marker
                        key={`call-${index}-${call.timeReceived}-${call.incident}`}
                        position={[call.latitude, call.longitude]}
                        icon={createCallIcon(call)}
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
        </MarkerClusterGroup>
    );
}