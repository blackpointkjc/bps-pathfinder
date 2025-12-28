import React, { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const precinctIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="position: relative; width: 36px; height: 36px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));">
                <path d="M12 1L14 7L12 9L10 7L12 1Z" fill="#1E40AF" stroke="white" stroke-width="1"/>
                <circle cx="12" cy="12" r="9" fill="#1E40AF" stroke="#FFD700" stroke-width="1.5"/>
                <circle cx="12" cy="12" r="6" fill="white" opacity="0.9"/>
                <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="#1E40AF">PD</text>
            </svg>
        </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
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

export default function PrecinctMarkers() {
    const [geocodedPrecincts, setGeocodedPrecincts] = useState([]);

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