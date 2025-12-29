import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Jail icon
const jailIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="position: relative; width: 32px; height: 32px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                <rect x="3" y="11" width="18" height="10" rx="2" fill="#DC2626" fill-opacity="0.2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                <line x1="7" y1="15" x2="7" y2="18"/>
                <line x1="12" y1="15" x2="12" y2="18"/>
                <line x1="17" y1="15" x2="17" y2="18"/>
            </svg>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
});

const jails = [
    {
        name: 'Richmond City Jail',
        address: '1701 Fairfield Way, Richmond, VA 23223',
        coords: [37.54655, -77.42289],
        jurisdiction: 'Richmond'
    },
    {
        name: 'Henrico County Regional Jail West',
        address: '4317 East Parham Road, Henrico, VA 23228',
        coords: [37.62881, -77.51821],
        jurisdiction: 'Henrico'
    },
    {
        name: 'Henrico County Regional Jail East',
        address: '17320 New Kent Highway, Barhamsville, VA 23011',
        coords: [37.49537, -76.86185],
        jurisdiction: 'Henrico'
    },
    {
        name: 'Riverside Regional Jail Authority',
        address: '500 Folar Trail North, Prince George, VA 23860',
        coords: [37.30761, -77.34173],
        jurisdiction: 'Chesterfield'
    }
];

export default function JailMarkers({ showJails = true, onNavigateToJail }) {
    if (!showJails) return null;

    return (
        <>
            {jails.map((jail, index) => (
                <Marker
                    key={index}
                    position={jail.coords}
                    icon={jailIcon}
                    eventHandlers={{
                        click: () => {
                            if (onNavigateToJail) {
                                onNavigateToJail(jail);
                            }
                        }
                    }}
                >
                    <Popup>
                        <div className="p-2">
                            <p className="font-bold text-red-600 mb-1">{jail.name}</p>
                            <p className="text-xs text-gray-600 mb-1">{jail.address}</p>
                            <p className="text-xs text-gray-500 mb-2">Serves: {jail.jurisdiction}</p>
                            <button
                                onClick={() => onNavigateToJail && onNavigateToJail(jail)}
                                className="w-full bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-2 rounded"
                            >
                                Navigate Here
                            </button>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}