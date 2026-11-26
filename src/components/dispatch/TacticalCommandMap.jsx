import {useState,useEffect,useRef} from 'react';
import {MapContainer,useMap} from 'react-leaflet';
import {Map as MapIcon,RefreshCw,Maximize2,Minimize2,Plus,Minus,Crosshair} from 'lucide-react';
import LazyTomTomMap from '@/components/map/LazyTomTomMap';
import PathfinderTileLayer from '@/components/map/PathfinderTileLayer';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import 'leaflet/dist/leaflet.css';

const validPoint=(lat,lng)=>lat!=null&&lng!=null&&lat!==''&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lng))<=180&&!(Number(lat)===0&&Number(lng)===0);
const point=(lat,lng)=>validPoint(lat,lng)?[Number(lat),Number(lng)]:null;
function overviewPoints(calls,units){
 return [...calls.map(c=>point(c.latitude,c.longitude)),...units.filter(u=>u.live_location_hidden!==true&&(u.session_active===true||u.presence_online===true||u.map_visible===true)).map(u=>{
   const positions=[[u.latitude,u.longitude,u.gps_updated_at],[u.coarse_latitude,u.coarse_longitude,u.coarse_gps_updated_at],[u.last_known_latitude,u.last_known_longitude,u.last_gps_updated_at]].filter(p=>validPoint(p[0],p[1])).sort((a,b)=>(Date.parse(b[2])||0)-(Date.parse(a[2])||0));
   return positions.length?point(positions[0][0],positions[0][1]):null;
 })].filter(Boolean);
}
function BackupCamera({camera}){
 const map=useMap();
 useEffect(()=>{const el=map.getContainer();const resize=()=>{if(el.clientWidth&&el.clientHeight)map.invalidateSize({pan:false});};const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(el);resize();return()=>observer?.disconnect();},[map]);
 useEffect(()=>{if(!camera)return;const points=camera.points||[];if(camera.mode==='in'){map.zoomIn();return;}if(camera.mode==='out'){map.zoomOut();return;}if(!points.length){map.setView([37.5407,-77.436],11);return;}if(camera.mode==='focus'||points.every(p=>p[0]===points[0][0]&&p[1]===points[0][1]))map.setView(points[0],camera.mode==='focus'?15:13);else map.fitBounds(points,{padding:[35,35],maxZoom:13});},[map,camera]);
 return null;
}
export default function TacticalCommandMap({calls=[],units=[],onCallClick,compact=false,selectedCall=null,expanded=false,onExpand}){
 const [backup,setBackup]=useState(false),[theme,setTheme]=useState('night'),[revision,setRevision]=useState(0),[camera,setCamera]=useState(null);
 const initialized=useRef(false);
 const selectedPoint=point(selectedCall?.latitude,selectedCall?.longitude);
 const overview=()=>setCamera({mode:'overview',points:overviewPoints(calls,units)});
 const focus=()=>{if(selectedPoint)setCamera({mode:'focus',points:[selectedPoint]});};
 // Fit once when real positions arrive. Subsequent feed updates do not move the camera.
 useEffect(()=>{if(compact||initialized.current)return;const points=overviewPoints(calls,units);if(points.length){initialized.current=true;setCamera({mode:'overview',points});}},[calls,units,compact]);
 return <section className={'tac-map-panel '+(compact?'tac-map-compact':'')} aria-label="Live tactical map">
  <div className="tac-panel-bar"><span><MapIcon size={15}/> Tactical map</span><div><button type="button" onClick={()=>setTheme(x=>x==='night'?'day':'night')}>{theme==='night'?'Day':'Night'}</button><button type="button" onClick={()=>{setBackup(x=>!x);overview();}}>{backup?'TomTom':'Backup map'}</button><button type="button" aria-label="Reload tactical map" onClick={()=>{overview();setRevision(x=>x+1)}}><RefreshCw size={14}/></button>{onExpand&&<button type="button" aria-pressed={expanded} onClick={onExpand}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {expanded?'Restore':'Expand map'}</button>}</div></div>
  <div className="tac-map-surface">{!backup?<LazyTomTomMap key={revision} embedded showDistress centerDistress activeCalls={calls} otherUnits={units} mapTheme={theme} tacticalCamera={camera} onCallClick={onCallClick} onMapUnavailable={()=>setBackup(true)} showPoliceStations={false} showFireStations={false} showJails={false}/>:<MapContainer key={revision} center={[37.5407,-77.436]} zoom={11} className="h-full w-full" zoomControl={false}><PathfinderTileLayer theme={theme}/><ActiveCallMarkers calls={calls} onCallClick={onCallClick}/><OtherUnitsLayer units={units}/><OfficerDistressMarker autoCenter/><BackupCamera camera={camera}/></MapContainer>}
    <div className="tac-map-camera-tools" aria-label="Map view controls"><button type="button" onClick={()=>setCamera({mode:'in'})} aria-label="Zoom in"><Plus size={19}/></button><button type="button" onClick={()=>setCamera({mode:'out'})} aria-label="Zoom out"><Minus size={19}/></button><button type="button" onClick={overview} title="Fit mapped calls and visible units"><Maximize2 size={17}/> Overview</button><button type="button" disabled={!selectedPoint} onClick={focus} title="Center on selected incident"><Crosshair size={17}/> Selected call</button></div>
  </div>
  <div className="tac-map-legend"><span>● Calls</span><span>◆ Units</span><span className="text-red-300">● SOS</span><span>{backup?'Backup map':'TomTom'} · recorded locations</span></div>
 </section>
}
