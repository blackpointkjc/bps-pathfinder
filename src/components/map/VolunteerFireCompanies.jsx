import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, MapPin } from 'lucide-react';

const vfcIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 32px;
            height: 32px;
            background: #EF4444;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">🔥</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
});

const fireCompanies = [
    { name: 'Rivers Bend Volunteer Fire Company', address: '901 Bermuda Hundred Rd, Chester, VA 23831', lat: 37.34325, lng: -77.38053 },
    { name: 'Winterpock Volunteer Fire Company', address: '7810 Winterpock Rd, Chesterfield, VA 23832', lat: 37.39769, lng: -77.67392 }
];

export default function VolunteerFireCompanies({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    return (
        <>
            {fireCompanies.map((company, index) => (
                <Marker
                    key={`vfc-${index}`}
                    position={[company.lat, company.lng]}
                    icon={vfcIcon}
                    eventHandlers={{
                        click: (e) => {
                            e.originalEvent.stopPropagation();
                            if (onNavigateToStation) {
                                onNavigateToStation({
                                    name: company.name,
                                    coords: [company.lat, company.lng]
                                });
                            }
                        }
                    }}
                >
                    <Popup maxWidth={250}>
                        <div className="p-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Flame className="w-5 h-5 text-red-600" />
                                <h3 className="font-bold text-red-900">{company.name}</h3>
                            </div>
                            {company.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{company.address}</span>
                                </div>
                            )}
                            <div className="text-xs text-gray-600 bg-red-50 px-2 py-1 rounded">
                                Volunteer Fire Company
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
    );
}