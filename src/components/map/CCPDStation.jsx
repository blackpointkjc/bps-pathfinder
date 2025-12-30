import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Shield, MapPin } from 'lucide-react';

const createCCPDIcon = () => {
    return new L.DivIcon({
        className: 'custom-ccpd-marker',
        html: `
            <div style="
                position: relative;
                width: 44px;
                height: 44px;
            ">
                <div style="
                    width: 44px;
                    height: 44px;
                    background: #1E40AF;
                    border: 3px solid white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(30, 64, 175, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 11px;
                        font-family: system-ui, -apple-system, sans-serif;
                    ">PD</span>
                </div>
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22]
    });
};

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
            icon={createCCPDIcon()}
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