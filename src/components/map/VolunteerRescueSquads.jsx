import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Ambulance, MapPin } from 'lucide-react';

const createVRSIcon = () => {
    return new L.DivIcon({
        className: 'custom-vrs-marker',
        html: `
            <div style="
                position: relative;
                width: 44px;
                height: 44px;
            ">
                <div style="
                    width: 44px;
                    height: 44px;
                    background: #F59E0B;
                    border: 3px solid white;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <span style="
                        color: white;
                        font-weight: bold;
                        font-size: 10px;
                        font-family: system-ui, -apple-system, sans-serif;
                    ">VRS</span>
                </div>
            </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22]
    });
};

const rescueSquads = [
    { name: 'BBVRS', fullName: 'Bensley-Bermuda Volunteer Rescue Squad', address: '2500 Rio Vista St, Chester, VA 23831', lat: 37.37333, lng: -77.41796 },
    { name: 'EMVRS', fullName: 'Ettrick-Matoaca Volunteer Rescue Squad', address: '5711 River Rd, South Chesterfield, VA 23804', lat: 37.23095, lng: -77.47068 },
    { name: 'FVRS', fullName: 'Forest View Volunteer Rescue Squad', address: '8008 Midlothian Turnpike, North Chesterfield, VA 23235', lat: 37.49961, lng: -77.54390 },
    { name: 'MVRS', fullName: 'Manchester Volunteer Rescue Squad', address: '3500 Courthouse Rd, North Chesterfield, VA 23236', lat: 37.44494, lng: -77.58374 },
    { name: 'TVRS', fullName: 'Tuckahoe Volunteer Rescue Squad', address: '7425 Patterson Ave, Henrico, VA 23229', lat: 37.59295, lng: -77.53883 }
];

export default function VolunteerRescueSquads({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    return (
        <>
            {rescueSquads.map((squad, index) => (
                <Marker
                    key={`vrs-${index}`}
                    position={[squad.lat, squad.lng]}
                    icon={createVRSIcon()}
                    eventHandlers={{
                        click: (e) => {
                            e.originalEvent.stopPropagation();
                            if (onNavigateToStation) {
                                onNavigateToStation({
                                    name: squad.fullName,
                                    coords: [squad.lat, squad.lng]
                                });
                            }
                        }
                    }}
                >
                    <Popup maxWidth={250}>
                        <div className="p-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Ambulance className="w-5 h-5 text-amber-600" />
                                <h3 className="font-bold text-amber-900">{squad.name}</h3>
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-2">{squad.fullName}</p>
                            {squad.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{squad.address}</span>
                                </div>
                            )}
                            <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded">
                                Volunteer Rescue Squad
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}