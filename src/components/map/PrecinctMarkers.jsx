import React, { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const precinctIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <circle cx="12" cy="12" r="11" fill="#1E40AF" stroke="white" stroke-width="2"/>
            <text x="12" y="17" font-size="14" font-weight="bold" text-anchor="middle" fill="white">PD</text>
        </svg>
    `),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

const precincts = [
    {
        name: 'Richmond Police Headquarters',
        precinctNumber: 'HQ',
        address: '200 W Grace St, Richmond, VA',
        coords: null
    },
    {
        name: 'First Precinct',
        precinctNumber: '1',
        address: '2501 Q St, Richmond, VA',
        coords: null
    },
    {
        name: 'Third Precinct',
        precinctNumber: '3',
        address: '301 S Meadow St, Richmond, VA',
        coords: null
    },
    {
        name: 'Second Precinct',
        precinctNumber: '2',
        address: '177 Belt Blvd, Richmond, VA',
        coords: null
    },
    {
        name: 'Fourth Precinct',
        precinctNumber: '4',
        address: '2219 Chamberlayne Ave, Richmond, VA',
        coords: null
    }
];

export default function PrecinctMarkers({ showStations = true }) {
    const [geocodedPrecincts, setGeocodedPrecincts] = useState([]);
    
    if (!showStations) return null;

    useEffect(() => {
        geocodePrecincts();
    }, []);

    const geocodePrecincts = async () => {
        const geocoded = [];
        
        for (const precinct of precincts) {
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(precinct.address)}&limit=1`,
                    { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                );
                const data = await response.json();
                
                if (data && data.length > 0) {
                    geocoded.push({
                        ...precinct,
                        coords: [parseFloat(data[0].lat), parseFloat(data[0].lon)]
                    });
                }
                
                // Rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error geocoding ${precinct.name}:`, error);
            }
        }
        
        setGeocodedPrecincts(geocoded);
    };

    return (
        <>
            {geocodedPrecincts.map((precinct, idx) => (
                precinct.coords && (
                    <Marker
                        key={idx}
                        position={precinct.coords}
                        icon={precinctIcon}
                    >
                        <Popup>
                            <div className="p-3 min-w-[200px]">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-blue-600 font-bold text-sm">
                                            {precinct.precinctNumber}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-gray-900">{precinct.name}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 mt-2">{precinct.address}</p>
                            </div>
                        </Popup>
                    </Marker>
                )
            ))}
        </>
    );
}