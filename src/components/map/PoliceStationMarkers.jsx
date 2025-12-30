import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const policeStationIcon = new L.Icon({
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

const POLICE_STATIONS = {
    henrico: [
        {
            name: 'West Station (Headquarters)',
            address: '7721 E. Parham Rd., Henrico, VA 23294',
            hours: 'Open 24/7',
            coords: [37.63043349090483, -77.52872767487804]
        },
        {
            name: 'Central Station',
            address: '7850 Villa Park Drive, Henrico, VA 23228',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.62811679494957, -77.46510437303036]
        },
        {
            name: 'South Station',
            address: '640 N. Airport Drive, Henrico, VA 23075',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.54718345767878, -77.30586710327077]
        }
    ],
    chesterfield: [
        {
            name: 'Police Department Headquarters',
            address: '10001 Iron Bridge Road, Chesterfield, VA 23832',
            hours: 'Open 24/7',
            coords: [37.37655545346001, -77.50774145590032]
        },
        {
            name: 'Appomattox Police Station',
            address: '2920 W Hundred Road, Chester, VA 23831',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.35687122622971, -77.41931798390023]
        },
        {
            name: 'Falling Creek Police Station',
            address: '20 N Providence Road, North Chesterfield, VA 23235',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.498369571122886, -77.54790702883547]
        },
        {
            name: 'Hicks Road Police Station',
            address: '2730 Hicks Road, North Chesterfield, VA 23235',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.45985328501191, -77.55158670184836]
        },
        {
            name: 'Swift Creek Police Station',
            address: '6812 Woodlake Commons Loop, Midlothian, VA 23112',
            hours: 'Monday – Friday 8:00 AM – 4:30 PM',
            coords: [37.405807788612144, -77.68557607116452]
        }
    ]
};

export default function PoliceStationMarkers({ showStations = true, onNavigateToStation }) {
    console.log('👮 Police station markers - showStations:', showStations);
    if (!showStations) {
        console.log('👮 Police stations hidden by filter');
        return null;
    }

    const allStations = [
        ...POLICE_STATIONS.henrico.map(s => ({ ...s, county: 'Henrico' })),
        ...POLICE_STATIONS.chesterfield.map(s => ({ ...s, county: 'Chesterfield' }))
    ];

    return (
        <>
            {allStations.map((station, idx) => (
                <Marker
                    key={idx}
                    position={station.coords}
                    icon={policeStationIcon}
                    eventHandlers={{
                        click: () => {
                            if (onNavigateToStation) {
                                onNavigateToStation({
                                    coords: station.coords,
                                    name: station.name
                                });
                            }
                        }
                    }}
                >
                    <Popup>
                        <div className="p-2 min-w-[200px]">
                            <p className="font-bold text-blue-900">{station.name}</p>
                            <p className="text-xs text-blue-600 mb-2">{station.county} County Police</p>
                            <p className="text-xs text-gray-700">{station.address}</p>
                            <p className="text-xs text-gray-600 mt-1 italic">{station.hours}</p>
                            {onNavigateToStation && (
                                <button
                                    onClick={() => onNavigateToStation({ coords: station.coords, name: station.name })}
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