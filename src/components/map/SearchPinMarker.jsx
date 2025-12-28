import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const searchPinIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#10B981" stroke="white" stroke-width="2"/>
            <circle cx="12" cy="9" r="3" fill="white"/>
        </svg>
    `),
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

export default function SearchPinMarker({ position, address, propertyInfo }) {
    if (!position) return null;
    
    return (
        <Marker position={position} icon={searchPinIcon}>
            <Popup maxWidth={300}>
                <div className="p-3 min-w-[250px]">
                    <p className="font-bold text-green-600 mb-2 text-sm">📍 Search Result</p>
                    <p className="text-xs text-gray-700 mb-3 border-b pb-2">{address}</p>
                    
                    {propertyInfo && (
                        <div className="mt-2">
                            <p className="font-semibold text-blue-700 text-xs mb-1">🏠 Property Information:</p>
                            <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                {propertyInfo}
                            </div>
                        </div>
                    )}
                </div>
            </Popup>
        </Marker>
    );
}