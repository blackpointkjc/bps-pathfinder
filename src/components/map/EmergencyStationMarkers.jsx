import { Marker, Popup, Tooltip } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { facilityMapIcon, facilityClusterIcon } from '@/lib/facilityMapIcon';
import { getVisibleEmergencyStations, stationAgencyLabels, stationDescription, stationDestination } from '@/lib/emergencyStationCatalog';

export default function EmergencyStationMarkers({ filters, onNavigate }) {
  return <MarkerClusterGroup chunkedLoading maxClusterRadius={32} disableClusteringAtZoom={14} showCoverageOnHover={false} iconCreateFunction={facilityClusterIcon}>{getVisibleEmergencyStations(filters).map(station =>
    <Marker key={station.id} position={[station.lat,station.lng]} icon={facilityMapIcon(station.kind==='rescue'?'rescue':'fire')}
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
  )}</MarkerClusterGroup>;
}
