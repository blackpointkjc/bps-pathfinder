import {useState} from 'react';
import {MapContainer} from 'react-leaflet';
import {Map as MapIcon, RefreshCw} from 'lucide-react';
import LazyTomTomMap from '@/components/map/LazyTomTomMap';
import PathfinderTileLayer from '@/components/map/PathfinderTileLayer';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import 'leaflet/dist/leaflet.css';

export default function TacticalCommandMap({calls=[],units=[],onCallClick,compact=false}){
 const [backup,setBackup]=useState(false),[theme,setTheme]=useState('night'),[revision,setRevision]=useState(0);
 return <section className={'tac-map-panel '+(compact?'tac-map-compact':'')} aria-label="Live tactical map">
  <div className="tac-panel-bar"><span><MapIcon size={15}/> Tactical map</span><div><button type="button" onClick={()=>setTheme(x=>x==='night'?'day':'night')}>{theme==='night'?'Day':'Night'}</button><button type="button" onClick={()=>setBackup(x=>!x)}>{backup?'TomTom':'Backup map'}</button><button type="button" aria-label="Reset tactical map" onClick={()=>setRevision(x=>x+1)}><RefreshCw size={14}/></button></div></div>
  <div className="tac-map-surface">{!backup?<LazyTomTomMap key={revision} embedded showDistress centerDistress activeCalls={calls} otherUnits={units} mapTheme={theme} onCallClick={onCallClick} onMapUnavailable={()=>setBackup(true)} showPoliceStations={false} showFireStations={false} showJails={false}/>:<MapContainer key={revision} center={[37.5407,-77.436]} zoom={11} className="h-full w-full" zoomControl><PathfinderTileLayer theme={theme}/><ActiveCallMarkers calls={calls} onCallClick={onCallClick}/><OtherUnitsLayer units={units}/><OfficerDistressMarker autoCenter/></MapContainer>}</div>
  <div className="tac-map-legend"><span>● Calls</span><span>◆ Units</span><span className="text-red-300">● SOS</span><span>{backup?'Backup map':'TomTom'} · recorded locations</span></div>
 </section>
}
