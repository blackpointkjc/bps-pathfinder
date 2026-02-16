import React from 'react';
import { Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Shield, MapPin, Eye } from 'lucide-react';

// Create custom icon for monitored properties
const createPropertyIcon = () => {
    return new L.DivIcon({
        className: 'custom-marker',
        html: `
            <div style="position: relative; width: 40px; height: 40px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 8px rgba(139,92,246,0.6));">
                    <circle cx="12" cy="12" r="11" fill="#8B5CF6" opacity="0.2"/>
                    <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="1.5"/>
                    <circle cx="12" cy="12" r="3" fill="#FFFFFF"/>
                </svg>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });
};

export default function MonitoredPropertyMarkers({ properties }) {
    if (!properties || properties.length === 0) return null;

    // Filter for enabled properties with valid coordinates
    const validProperties = properties.filter(p => 
        p.enabled !== false && 
        p.latitude && p.longitude && 
        !isNaN(p.latitude) && !isNaN(p.longitude)
    );

    if (validProperties.length === 0) return null;

    return (
        <>
            {validProperties.map((property) => (
                <React.Fragment key={property.id}>
                    {/* Monitoring radius circle */}
                    <Circle
                        center={[property.latitude, property.longitude]}
                        radius={property.radiusMeters || 500}
                        pathOptions={{
                            color: '#8B5CF6',
                            fillColor: '#8B5CF6',
                            fillOpacity: 0.15,
                            weight: 2,
                            opacity: 0.6,
                            dashArray: '10, 10'
                        }}
                    />
                    
                    {/* Property marker */}
                    <Marker
                        position={[property.latitude, property.longitude]}
                        icon={createPropertyIcon()}
                    >
                        <Popup>
                            <div className="p-3 min-w-[200px]">
                                <div className="flex items-start gap-2 mb-2 pb-2 border-b">
                                    <Shield className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-sm text-gray-900">{property.name}</p>
                                        <p className="text-xs text-purple-600 font-semibold">MONITORED PROPERTY</p>
                                    </div>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                                        <span className="text-xs text-gray-700 leading-relaxed">{property.address}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <Eye className="w-3.5 h-3.5 text-gray-500" />
                                        <span className="text-xs text-gray-600">
                                            Monitoring {property.radiusMeters || 500}m radius
                                        </span>
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