import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Ambulance, MapPin } from 'lucide-react';

const createRAAIcon = () => {
    return new L.DivIcon({
        className: 'custom-raa-marker',
        html: `
            <div style="
                position: relative;
                width: 44px;
                height: 44px;
            ">
                <div style="
                    width: 44px;
                    height: 44px;
                    background: #10B981;
                    border: 3px solid white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M18 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm1.5-9H17V12h4.46L19.5 9.5zM6 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM20 8l3 4v5h-2c0 1.66-1.34 3-3 3s-3-1.34-3-3H9c0 1.66-1.34 3-3 3s-3-1.34-3-3H1V6c0-1.11.89-2 2-2h14v4h3zM8 6H4v6h4V6z"/>
                    </svg>
                </div>
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22]
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