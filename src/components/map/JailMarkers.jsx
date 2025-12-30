import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Jail icon
const jailIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 32px;
            height: 32px;
            background: #DC2626;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">🏛️</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
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