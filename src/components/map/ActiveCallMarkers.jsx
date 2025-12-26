import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Radio } from 'lucide-react';

// Single emergency icon for all active calls
const createCallIcon = (status) => {
    // Determine status color indicator
    let statusColor = '#EF4444'; // red for enroute/dispatched (default)
    if (status?.includes('Arrived') || status?.includes('ARRIVED') || status?.includes('ARV') || status?.includes('On Scene')) {
        statusColor = '#10B981'; // green for arrived
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
                    background: #EF4444;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: pulse 2s infinite;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 8v4m0 4h.01" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
                    </svg>
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
    
    return (
        <>
            {calls.map((call, index) => {
                if (!call.latitude || !call.longitude) return null;
                
                return (
                    <Marker
                        key={`call-${index}-${call.timeReceived}-${call.incident}`}
                        position={[call.latitude, call.longitude]}
                        icon={createCallIcon(call.status || 'Unknown')}
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