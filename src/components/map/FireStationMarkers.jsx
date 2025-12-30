import React, { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, Phone, MapPin } from 'lucide-react';

// Fire station icon
const createFireStationIcon = () => {
    return new L.DivIcon({
        className: 'custom-fire-station-marker',
        html: `
            <div style="
                position: relative;
                width: 32px;
                height: 32px;
            ">
                <div style="
                    width: 32px;
                    height: 32px;
                    background: #DC2626;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                        <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>
                    </svg>
                </div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

export default function FireStationMarkers({ showStations, onNavigateToStation }) {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFireStations();
    }, []);

    const fetchFireStations = async () => {
        try {
            const response = await fetch(
                'https://portal.henrico.gov/mapping/rest/services/Layers/Fire_Stations_and_Rescue_Squads/MapServer/0/query?outFields=*&where=1%3D1&f=json'
            );
            const data = await response.json();

            if (data.features) {
                const stationsData = data.features.map(feature => ({
                    name: feature.attributes.NAME || 'Fire Station',
                    address: feature.attributes.ADDRESS || '',
                    type: feature.attributes.TYPE || 'Fire Station',
                    lat: feature.geometry.y,
                    lng: feature.geometry.x
                }));
                setStations(stationsData);
                console.log('🔥 Loaded', stationsData.length, 'fire stations');
            }
        } catch (error) {
            console.error('Error fetching fire stations:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!showStations || loading || stations.length === 0) {
        return null;
    }

    return (
        <>
            {stations.map((station, index) => (
                <Marker
                    key={`fire-station-${index}`}
                    position={[station.lat, station.lng]}
                    icon={createFireStationIcon()}
                    eventHandlers={{
                        click: () => {
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
                                <Flame className="w-5 h-5 text-red-600" />
                                <h3 className="font-bold text-red-900">{station.name}</h3>
                            </div>
                            {station.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{station.address}</span>
                                </div>
                            )}
                            <div className="text-xs text-gray-600 bg-red-50 px-2 py-1 rounded">
                                {station.type}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}