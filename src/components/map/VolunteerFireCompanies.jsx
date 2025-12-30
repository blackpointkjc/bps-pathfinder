import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Flame, MapPin } from 'lucide-react';

const vfcIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
            <circle cx="16" cy="16" r="15" fill="#EF4444" stroke="white" stroke-width="2"/>
            <path d="M22 22c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm1-6h-2v2.5h3l-1-2.5zM10 22c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1zm13-10l2 2.5v3.5h-1.5c0 1.38-1.12 2.5-2.5 2.5s-2.5-1.12-2.5-2.5h-6c0 1.38-1.12 2.5-2.5 2.5S7.5 19.88 7.5 18.5H6v-8h11v2h2zm-11-1h-2v3h2v-3z" fill="white"/>
        </svg>
    `),
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