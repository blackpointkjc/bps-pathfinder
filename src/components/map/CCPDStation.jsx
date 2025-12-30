import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Shield, MapPin } from 'lucide-react';

const ccpdIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
            <circle cx="16" cy="16" r="15" fill="#1E40AF" stroke="white" stroke-width="2"/>
            <path d="M16 6L9 10v5c0 4.33 3 8.38 7 9.4 4-1.02 7-5.07 7-9.4v-5l-7-4z" fill="white"/>
        </svg>
    `),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

export default function CCPDStation({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    const station = {
        name: 'Chesterfield County Police Department',
        address: '5701 Rte 1, North Chesterfield, VA 23234',
        lat: 37.44639,
        lng: -77.43919
    };

    return (
        <Marker
            position={[station.lat, station.lng]}
            icon={ccpdIcon}
            eventHandlers={{
                click: (e) => {
                    e.originalEvent.stopPropagation();
                    if (onNavigateToStation) {
                        onNavigateToStation({
                            name: station.name,
                            coords: [station.lat, station.lng]
                        });
                    }
                }
            }}
        >
            <Popup maxWidth={250}>
                <div className="p-2">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-blue-900">{station.name}</h3>
                    </div>
                    {station.address && (
                        <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{station.address}</span>
                        </div>
                    )}
                    <div className="text-xs text-gray-600 bg-blue-50 px-2 py-1 rounded">
                        Chesterfield County Police
                    </div>
                </div>
            </Popup>
        </Marker>
    );
}