import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, MapPin } from 'lucide-react';

const cfdIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
            <circle cx="16" cy="16" r="15" fill="#DC2626" stroke="white" stroke-width="2"/>
            <path d="M16 6c-2 3-3.5 5-3.5 7.5 0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5c0-2.5-1.5-4.5-3.5-7.5zm-4 8c-1.5 2-2.5 3.5-2.5 5.5 0 1.5 1 2.5 2.5 2.5s2.5-1 2.5-2.5c0-2-1-3.5-2.5-5.5zm8 0c-1.5 2-2.5 3.5-2.5 5.5 0 1.5 1 2.5 2.5 2.5s2.5-1 2.5-2.5c0-2-1-3.5-2.5-5.5z" fill="white"/>
        </svg>
    `),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

const chesterfieldStations = [
    { number: '1', name: 'Chester', address: '4325 Old Hundred Rd, Chester, VA 23831', lat: 37.35472, lng: -77.44742 },
    { number: '2', name: 'Manchester', address: '7541 Hull Street Rd, North Chesterfield, VA 23235', lat: 37.46742, lng: -77.53202 },
    { number: '3', name: 'Bensley', address: '2836 Dundas Rd, North Chesterfield, VA 23234', lat: 37.43694, lng: -77.44611 },
    { number: '4', name: 'Bon Air', address: '2600 Polo Parkway, Midlothian, VA 23112', lat: 37.52707, lng: -77.61449 },
    { number: '5', name: 'Midlothian', address: '13420 Midlothian Turnpike, Midlothian, VA 23113', lat: 37.50328, lng: -77.64862 },
    { number: '6', name: 'Enon', address: '1920 East Hundred Rd, Chester, VA 23831', lat: 37.33188, lng: -77.32303 },
    { number: '7', name: 'Clover Hill', address: '13810 Hull Street Rd, Midlothian, VA 23112', lat: 37.40762, lng: -77.65917 },
    { number: '8', name: 'Matoaca', address: '6612 Hickory Rd, South Chesterfield, VA', lat: 37.26223, lng: -77.48497 },
    { number: '9', name: 'Buford', address: '8001 Buford Ct, North Chesterfield, VA 23235', lat: 37.50048, lng: -77.54407 },
    { number: '10', name: 'Wagstaff Circle', address: '2101 Adkins Rd, North Chesterfield, VA 23234', lat: 37.46529, lng: -77.57577 },
    { number: '11', name: 'Dale', address: '5811 Ironbridge Rd, North Chesterfield, VA 23234', lat: 37.43750, lng: -77.48903 },
    { number: '12', name: 'Ettrick', address: '21200 Chesterfield Ave, South Chesterfield, VA 23803', lat: 37.23569, lng: -77.42411 },
    { number: '13', name: 'Phillips', address: '10630 River Rd, Chesterfield, VA 23832', lat: 37.27735, lng: -77.56684 },
    { number: '14', name: 'Dutch Gap', address: '2711 West Hundred Rd, Chester, VA 23831', lat: 37.35492, lng: -77.41655 },
    { number: '17', name: 'Centralia', address: '9501 Chester Rd, North Chesterfield, VA 23237', lat: 37.39201, lng: -77.44446 },
    { number: '19', name: 'Beach Rd', address: '14010 Beach Rd, Chesterfield, VA 23838', lat: 37.35942, lng: -77.66823 },
    { number: '20', name: 'Courthouse Rd', address: '201 Courthouse Rd, North Chesterfield, VA 23236', lat: 37.48673, lng: -77.59607 },
    { number: '24', name: 'Manchester VRS', address: '3500 Courthouse Rd, North Chesterfield, VA 23236', lat: 37.44494, lng: -77.58374 },
    { number: '25', name: 'Magnolia Green', address: '6730 Woolridge Rd, Chesterfield, VA 23832', lat: 37.41126, lng: -77.72480 }
];

export default function ChesterfieldFireStations({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    return (
        <>
            {chesterfieldStations.map((station, index) => (
                <Marker
                    key={`cfd-${index}`}
                    position={[station.lat, station.lng]}
                    icon={cfdIcon}
                    eventHandlers={{
                        click: (e) => {
                            e.originalEvent.stopPropagation();
                            if (onNavigateToStation) {
                                onNavigateToStation({
                                    name: `CFD Station ${station.number} - ${station.name}`,
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
                                <h3 className="font-bold text-red-900">CFD Station {station.number} - {station.name}</h3>
                            </div>
                            {station.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{station.address}</span>
                                </div>
                            )}
                            <div className="text-xs text-gray-600 bg-red-50 px-2 py-1 rounded">
                                Chesterfield Fire Department
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}