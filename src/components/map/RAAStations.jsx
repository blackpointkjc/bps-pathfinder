import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Ambulance, MapPin } from 'lucide-react';

const createRAAIcon = () => {
    return new L.DivIcon({
        className: 'custom-raa-marker',
        html: `
            <div style="
                width: 32px;
                height: 32px;
                background: #10B981;
                border: 2px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            ">🚑</div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

const raaStations = [
    { name: 'Headquarters', address: '2400 Hermitage Rd, Richmond, VA 23220', lat: 37.56514, lng: -77.46171 },
    { name: 'Southside Station', address: '2810 Decatur St, Richmond, VA 23224', lat: 37.51002, lng: -77.45877 },
    { name: 'East End Station', address: '1400 N 25th St, Richmond, VA 23223', lat: 37.54150, lng: -77.40980 },
    { name: 'Northside Station', address: '2901 North Ave, Richmond, VA 23222', lat: 37.57015, lng: -77.43252 },
    { name: 'Downtown Station', address: '601 E Jackson St, Richmond, VA 23219', lat: 37.54604, lng: -77.43329 }
];

export default function RAAStations({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    return (
        <>
            {raaStations.map((station, index) => (
                <Marker
                    key={`raa-${index}`}
                    position={[station.lat, station.lng]}
                    icon={createRAAIcon()}
                    eventHandlers={{
                        click: (e) => {
                            e.originalEvent.stopPropagation();
                            if (onNavigateToStation) {
                                onNavigateToStation({
                                    name: `RAA ${station.name}`,
                                    coords: [station.lat, station.lng]
                                });
                            }
                        }
                    }}
                >
                    <Popup maxWidth={250}>
                        <div className="p-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Ambulance className="w-5 h-5 text-green-600" />
                                <h3 className="font-bold text-green-900">RAA {station.name}</h3>
                            </div>
                            {station.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{station.address}</span>
                                </div>
                            )}
                            <div className="text-xs text-gray-600 bg-green-50 px-2 py-1 rounded">
                                Richmond Ambulance Authority
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}