import React, { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, Phone, MapPin } from 'lucide-react';

// Fire station icon with HFD label
const createFireStationIcon = () => {
    return new L.DivIcon({
        className: 'custom-fire-station-marker',
        html: `
            <div style="
                position: relative;
                width: 44px;
                height: 44px;
            ">
                <div style="
                    width: 44px;
                    height: 44px;
                    background: #DC2626;
                    border: 3px solid white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 12px;
                        font-family: system-ui, -apple-system, sans-serif;
                    ">HFD</span>
                </div>
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22]
    });
};

export default function FireStationMarkers({ showStations, onNavigateToStation }) {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFireStations();
    }, []);

    // Convert Web Mercator (EPSG:3857) to WGS84 Lat/Lng (EPSG:4326)
    const webMercatorToLatLng = (x, y) => {
        const lng = (x * 180) / 20037508.34;
        let lat = (y * 180) / 20037508.34;
        lat = (Math.atan(Math.exp(lat * (Math.PI / 180))) * 360) / Math.PI - 90;
        return [lat, lng];
    };

    const fetchFireStations = async () => {
        try {
            console.log('🔥 Fetching Henrico fire stations...');
            const henricoResponse = await fetch(
                'https://portal.henrico.gov/mapping/rest/services/Layers/Fire_Stations_and_Rescue_Squads/MapServer/0/query?outFields=*&where=1%3D1&f=json'
            );
            const henricoData = await henricoResponse.json();

            console.log('🔥 Fetching Richmond fire stations...');
            const richmondResponse = await fetch(
                'https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/FireStation/FeatureServer/0/query?outFields=*&where=1%3D1&f=json'
            );
            const richmondData = await richmondResponse.json();

            const allStations = [];

            // Process Henrico stations
            if (henricoData.features && henricoData.features.length > 0) {
                const henricoStations = henricoData.features.map(feature => {
                    const [lat, lng] = webMercatorToLatLng(feature.geometry.x, feature.geometry.y);
                    return {
                        name: feature.attributes.NAME || 'Fire Station',
                        address: feature.attributes.ADDRESS || '',
                        type: 'Henrico Fire',
                        lat,
                        lng
                    };
                });
                allStations.push(...henricoStations);
                console.log('🔥 Loaded', henricoStations.length, 'Henrico fire stations');
            }

            // Process Richmond stations
            if (richmondData.features && richmondData.features.length > 0) {
                const richmondStations = richmondData.features.map(feature => {
                    const [lat, lng] = webMercatorToLatLng(feature.geometry.x, feature.geometry.y);
                    return {
                        name: feature.attributes.NAME || feature.attributes.STATION || 'Fire Station',
                        address: feature.attributes.ADDRESS || feature.attributes.FULLADDR || '',
                        type: 'Richmond Fire',
                        lat,
                        lng
                    };
                });
                allStations.push(...richmondStations);
                console.log('🔥 Loaded', richmondStations.length, 'Richmond fire stations');
            }

            console.log('🔥 Total fire stations:', allStations.length);
            setStations(allStations);
        } catch (error) {
            console.error('❌ Error fetching fire stations:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!showStations) {
        console.log('🔥 Fire stations hidden by filter');
        return null;
    }
    
    if (loading) {
        console.log('🔥 Fire stations loading...');
        return null;
    }
    
    if (stations.length === 0) {
        console.log('🔥 No fire stations to display');
        return null;
    }

    console.log('🔥 Rendering', stations.length, 'fire station markers');

    return (
        <>
            {stations.map((station, index) => {
                console.log(`🔥 Rendering station ${index}:`, station.name, 'at', [station.lat, station.lng]);
                return (
                <Marker
                    key={`fire-station-${index}`}
                    position={[station.lat, station.lng]}
                    icon={createFireStationIcon()}
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
            );
            })}
        </>
    );
}