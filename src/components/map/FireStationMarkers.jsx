import React, { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, Phone, MapPin } from 'lucide-react';

// Fire station icon with agency label
const fireStationIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
            <circle cx="16" cy="16" r="15" fill="#DC2626" stroke="white" stroke-width="2"/>
            <path d="M22 22c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm1-6h-2v2.5h3l-1-2.5zM10 22c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm13-10l2 2.5v3.5h-1.5c0 1.38-1.12 2.5-2.5 2.5s-2.5-1.12-2.5-2.5h-6c0 1.38-1.12 2.5-2.5 2.5S7.5 19.88 7.5 18.5H6v-8h11v2h2zm-11-1h-2v3h2v-3z" fill="white"/>
        </svg>
    `),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

export default function FireStationMarkers({ showStations, onNavigateToStation }) {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFireStations();
    }, []);

    const fetchFireStations = async () => {
        try {
            const henricoResponse = await fetch(
                'https://portal.henrico.gov/mapping/rest/services/Layers/Fire_Stations_and_Rescue_Squads/MapServer/0/query?outFields=*&where=1%3D1&f=json&outSR=4326'
            );
            const henricoData = await henricoResponse.json();

            const richmondResponse = await fetch(
                'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/FireStation/FeatureServer/0/query?outFields=*&where=1%3D1&f=json&outSR=4326'
            );
            const richmondData = await richmondResponse.json();

            const allStations = [];

            if (henricoData.features && henricoData.features.length > 0) {
                const henricoStations = henricoData.features.map(feature => {
                    return {
                        name: feature.attributes.NAME || 'Fire Station',
                        address: feature.attributes.ADDRESS || '',
                        type: 'Henrico Fire',
                        agency: 'HFD',
                        lat: feature.geometry.y,
                        lng: feature.geometry.x
                    };
                });
                allStations.push(...henricoStations);
            }

            if (richmondData.features && richmondData.features.length > 0) {
                const richmondStations = richmondData.features.map(feature => {
                    return {
                        name: feature.attributes.NAME || feature.attributes.STATION || 'Fire Station',
                        address: feature.attributes.ADDRESS || feature.attributes.FULLADDR || '',
                        type: 'Richmond Fire',
                        agency: 'RFD',
                        lat: feature.geometry.y,
                        lng: feature.geometry.x
                    };
                });
                allStations.push(...richmondStations);
            }

            setStations(allStations);
        } catch (error) {
            // Silently fail
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
                    icon={fireStationIcon}
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