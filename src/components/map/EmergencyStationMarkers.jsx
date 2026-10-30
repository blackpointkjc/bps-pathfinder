import { Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { getVisibleEmergencyStations, stationAgencyLabels, stationDescription, stationDestination } from '@/lib/emergencyStationCatalog';

const iconCache = new Map();
function stationIcon(station) {
  const agencyCode = { richmond: 'R', henrico: 'H', chesterfield: 'C' }[station.agency];
  const label = station.kind === 'rescue' ? 'EMS' : agencyCode + station.number;
  const color = station.kind === 'rescue' ? '#b45309' : '#b91c1c';
  const key = color + ':' + label;
  if (!iconCache.has(key)) iconCache.set(key, new L.DivIcon({
    className: 'emergency-station-marker',
    html: '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:' + color + ';color:white;border:2px solid white;box-shadow:0 2px 6px #0006;font:800 12px Arial">' + label + '</div>',
    iconSize: [36,36], iconAnchor: [18,18], popupAnchor: [0,-18],
  }));
  return iconCache.get(key);
}

export default function EmergencyStationMarkers({ filters, onNavigate }) {
  return <>{getVisibleEmergencyStations(filters).map(station =>
    <Marker key={station.id} position={[station.lat,station.lng]} icon={stationIcon(station)}
      title={stationDescription(station)} bubblingMouseEvents={false}>
      <Tooltip direction="top" offset={[0,-20]} opacity={1} className="station-tooltip">
        <div className="max-w-72 whitespace-normal">
          <strong>{station.name}</strong><div>{station.address}</div>
          {station.battalion && <div>Battalion {station.battalion}</div>}
          <div>{station.companies}</div>
        </div>
      </Tooltip>
      <Popup autoPan={false} maxWidth={340} className="station-popup">
        <div className="space-y-2 p-2 text-slate-900">
          <h3 className="text-base font-extrabold">{station.name}</h3>
          <p>{stationAgencyLabels[station.agency]} · {station.kind === 'rescue' ? 'Volunteer rescue / EMS' : station.kind === 'fire_rescue' ? 'Fire / EMS / volunteer rescue' : 'Fire station'}</p>
          <p>{station.address}</p>
          {station.battalion && <p><strong>Battalion:</strong> {station.battalion}</p>}
          <p><strong>Companies / services:</strong> {station.companies}</p>
          {onNavigate && <button type="button" className="min-h-11 w-full rounded border border-slate-500 bg-slate-100 px-4 py-2 font-bold text-slate-900"
            onClick={() => onNavigate(stationDestination(station))}>Navigate</button>}
        </div>
      </Popup>
    </Marker>
  )}</>;
}
