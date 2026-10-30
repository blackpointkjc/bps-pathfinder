import { facilityMapIcon } from '@/lib/facilityMapIcon';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Shield, MapPin } from 'lucide-react';

const ccpdIcon = facilityMapIcon('police');

export default function CCPDStation({ showStations = true, onNavigateToStation }) {
    if (!showStations) return null;

    const station = {
        name: 'Chesterfield County Police Department',
        address: '5701 Rte 1, North Chesterfield, VA 23234',
        lat: 37.44639,
        lng: -77.43919
    };

    return (
        <Marker
            position={[station.lat, station.lng]}
            icon={ccpdIcon}

        >
            <Tooltip direction="top" opacity={1}>{station.name} — {station.address}</Tooltip>
                    <Popup autoPan={false} maxWidth={250}>
                <div className="p-2">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-blue-900">{station.name}</h3>
                    </div>
                    {station.address && (
                        <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{station.address}</span>
                        </div>
                    )}
                    <div className="text-xs text-gray-600 bg-blue-50 px-2 py-1 rounded">
                        Chesterfield County Police
                    </div>
                </div>
            {onNavigateToStation && <button type="button" className="min-h-11 w-full rounded border border-slate-500 bg-slate-100 px-3 py-2 font-bold text-slate-900" onClick={() => onNavigateToStation({name: station.name, address: station.address, coords: [station.lat, station.lng]})}>Navigate</button>}
                    </Popup>
        </Marker>
    );
}