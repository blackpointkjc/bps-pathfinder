import { facilityMapIcon } from '@/lib/facilityMapIcon';
import { Marker, Popup, Tooltip } from 'react-leaflet';

// Jail icon
const jailIcon = facilityMapIcon('jail');

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

                >
                    <Tooltip direction="top" opacity={1}>{jail.name} — {jail.address}</Tooltip>
                    <Popup autoPan={false}>
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