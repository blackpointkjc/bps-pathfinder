import React, { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const precinctIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 32px;
            height: 32px;
            background: #1E40AF;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">🚓</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

const precincts = [
    {
        name: 'Richmond Police Headquarters',
        precinctNumber: 'HQ',
        address: '200 W Grace St, Richmond, VA',
        coords: [37.5419, -77.4440]
    },
    {
        name: 'First Precinct',
        precinctNumber: '1',
        address: '2501 Q St, Richmond, VA',
        coords: [37.5257, -77.4109]
    },
    {
        name: 'Second Precinct',
        precinctNumber: '2',
        address: '177 Belt Blvd, Richmond, VA',
        coords: [37.5586, -77.5012]
    },
    {
        name: 'Third Precinct',
        precinctNumber: '3',
        address: '301 S Meadow St, Richmond, VA',
        coords: [37.5336, -77.4047]
    },
    {
        name: 'Fourth Precinct',
        precinctNumber: '4',
        address: '2219 Chamberlayne Ave, Richmond, VA',
        coords: [37.5798, -77.4375]
    }
];

export default function PrecinctMarkers({ showStations = true, onNavigateToPrecinct }) {
    if (!showStations) return null;

    return (
        <>
            {precincts.map((precinct, idx) => (
                <Marker
                    key={idx}
                    position={precinct.coords}
                    icon={precinctIcon}
                    eventHandlers={{
                        click: () => {
                            if (onNavigateToPrecinct) {
                                onNavigateToPrecinct({
                                    coords: precinct.coords,
                                    name: precinct.name
                                });
                            }
                        }
                    }}
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
                            {onNavigateToPrecinct && (
                                <button
                                    onClick={() => onNavigateToPrecinct({ coords: precinct.coords, name: precinct.name })}
                                    className="mt-2 w-full bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700"
                                >
                                    Navigate Here
                                </button>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}