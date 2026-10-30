import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, MapPin, Crosshair, CloudSun } from 'lucide-react';
import { appParams } from '@/lib/app-params';
import { getVisibleEmergencyStations } from '@/lib/emergencyStationCatalog';
import { POLICE_STATIONS } from './PoliceStationMarkers';
import { precincts } from './PrecinctMarkers';
import { jails } from './JailMarkers';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerCode from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';

let inlinedMaplibreWorkerURL = null;
const workerURL = () => {
  if (!inlinedMaplibreWorkerURL) {
    // Private Base44 apps can deny unauthenticated worker-file downloads.
    // A same-document Blob worker needs no additional auth or network fetch.
    inlinedMaplibreWorkerURL = URL.createObjectURL(new Blob([maplibreWorkerCode], {type:'text/javascript'}));
  }
  return inlinedMaplibreWorkerURL;
};

const coords = (point) => Array.isArray(point) && point.length >= 2
  && [point[0],point[1]].every(n => Number.isFinite(Number(n)))
  && Math.abs(Number(point[0])) <= 90 && Math.abs(Number(point[1])) <= 180;
const mapped = (latitude, longitude) => latitude != null && longitude != null
  && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
  && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180
  && !(Number(latitude) === 0 && Number(longitude) === 0);
const marker = (id, lat, lon, properties={}) => ({type:'Feature', id: String(id),
  geometry:{type:'Point',coordinates:[Number(lon),Number(lat)]},properties});
const featureCollection = features => ({type:'FeatureCollection',features});
// Preserve the CAD symbology from the original Pathfinder map: blue PD calls,
// red fire/PulsePoint, amber EMS, priority/approximate rings, and officer
// patrol shields. MapLibre canvas icons are local and work through private
// Base44 without an external image host or extra geocoding requests.
const callType = call => {
  const incident=String(call.incident||'').toLowerCase();
  const agency=String(call.agency||'').toUpperCase();
  const channel=String(call.source_channel||call.source||'').toLowerCase();
  const external=String(call.external_call_id||'').toLowerCase();
  if(channel.includes('pulsepoint')||external.startsWith('pulsepoint:'))return 'pulsepoint';
  if(/ems|medical|ambulance|unconscious|overdose|stroke|cardiac/.test(incident))return 'ems';
  if(agency.includes('FD')||/fire|smoke|alarm/.test(incident))return 'fire';
  return 'police';
};
const priorityCall = call => /shooting|shots fired|stabbing|officer down|active shooter|10-00|cardiac arrest|person with gun|assault|robbery|burglary in progress|domestic|pursuit|fire|accident with injury/i
  .test(`${call.incident||''} ${call.description||''}`);
const unitPosition = unit => {
  const eligible = unit?.live_location_hidden !== true
    && (unit?.session_active === true || unit?.presence_online === true || unit?.map_visible === true);
  if(!eligible)return null;
  const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const entries = [
    {latitude:unit.latitude,longitude:unit.longitude,at:timestamp(unit.gps_updated_at)},
    {latitude:unit.coarse_latitude,longitude:unit.coarse_longitude,at:timestamp(unit.coarse_gps_updated_at)},
    {latitude:unit.last_known_latitude,longitude:unit.last_known_longitude,at:timestamp(unit.last_gps_updated_at)},
  ].filter(pos=>mapped(pos.latitude,pos.longitude)).sort((a,b)=>b.at-a.at);
  return entries[0] || null;
};
const unitShieldIcon = unit => {
  const state=String(unit.status||'').toLowerCase();
  if(unit.is_supervisor || unit.isSupervisor)return 'bps-unit-supervisor';
  if(state.includes('enroute')||state.includes('dispatch'))return 'bps-unit-enroute';
  if(state.includes('scene'))return 'bps-unit-scene';
  if(state.includes('busy'))return 'bps-unit-busy';
  if(state.includes('out of service'))return 'bps-unit-offline';
  return 'bps-unit-shield';
};
const cadCallIcon = call => {
  const kind=callType(call);
  const approximate=call.geo_approximate===true;
  const priority=priorityCall(call);
  const arrived=/arrived|arv|on scene/i.test(String(call.status||''));
  return `${kind}${approximate?'-approx':''}${priority?'-priority':''}${arrived?'-arrived':''}`;
};
function registerCadIcons(map){
  const size=80, ratio=2;
  const canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const context=canvas.getContext('2d');
  const register=(name,draw)=>{
    if(map.hasImage(name))return;
    context.clearRect(0,0,size,size);
    draw(context);
    map.addImage(name,context.getImageData(0,0,size,size),{pixelRatio:ratio});
  };
  const circle=(ctx,x,y,r,fill,stroke='#fff',width=5)=>{
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();
  };
  for(const type of ['police','fire','ems','pulsepoint']){
    for(const approximate of [false,true])for(const priority of [false,true])for(const arrived of [false,true]){
      register(`bps-${type}${approximate?'-approx':''}${priority?'-priority':''}${arrived?'-arrived':''}`,ctx=>{
        const fill={police:'#1e40af',fire:'#dc2626',ems:'#d97706',pulsepoint:'#b91c1c'}[type];
        circle(ctx,40,40,32,fill,priority?'#ef4444':'#fff',approximate?3:6);
        ctx.fillStyle='#fff';ctx.font=type==='fire'||type==='ems' ? '32px "Apple Color Emoji","Segoe UI Emoji",sans-serif' : '900 27px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(({police:'PD',fire:'🔥',ems:'🚑',pulsepoint:'PP'})[type],40,42);
        // Active/arrived status dot like the existing CAD markers.
        circle(ctx,64,16,10,arrived?'#10b981':'#ef4444','#fff',3);
        if(approximate){ctx.beginPath();ctx.arc(40,40,36,0,Math.PI*2);ctx.setLineDash([7,5]);ctx.lineWidth=4;ctx.strokeStyle='#fbbf24';ctx.stroke();ctx.setLineDash([]);}
      });
    }
  }
  register('bps-unit-shield',ctx=>{
    ctx.beginPath();ctx.moveTo(40,5);ctx.lineTo(69,17);ctx.lineTo(66,48);ctx.quadraticCurveTo(60,66,40,75);ctx.quadraticCurveTo(20,66,14,48);ctx.lineTo(11,17);ctx.closePath();
    ctx.fillStyle='#0f3b68';ctx.fill();ctx.strokeStyle='#dbeafe';ctx.lineWidth=5;ctx.stroke();
    circle(ctx,40,36,18,'#e5eef8','#60a5fa',4);
    ctx.fillStyle='#0c4a6e';ctx.font='900 24px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',40,36);
  });
  for(const [state,color] of Object.entries({enroute:'#ef4444',scene:'#22c55e',busy:'#f59e0b',offline:'#64748b',supervisor:'#facc15'})){
    register(`bps-unit-${state}`,ctx=>{
      ctx.beginPath();ctx.moveTo(40,5);ctx.lineTo(69,17);ctx.lineTo(66,48);ctx.quadraticCurveTo(60,66,40,75);ctx.quadraticCurveTo(20,66,14,48);ctx.lineTo(11,17);ctx.closePath();
      ctx.fillStyle='#0f3b68';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=6;ctx.stroke();
      circle(ctx,40,36,18,'#e5eef8',color,4);
      ctx.fillStyle='#0c4a6e';ctx.font='900 24px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',40,36);
    });
  }
  register('bps-self-shield',ctx=>{
    ctx.beginPath();ctx.moveTo(40,5);ctx.lineTo(69,17);ctx.lineTo(66,48);ctx.quadraticCurveTo(60,66,40,75);ctx.quadraticCurveTo(20,66,14,48);ctx.lineTo(11,17);ctx.closePath();
    ctx.fillStyle='#124776';ctx.fill();ctx.strokeStyle='#67e8f9';ctx.lineWidth=5;ctx.stroke();
    circle(ctx,40,36,18,'#edf6ff','#38bdf8',4);
    ctx.fillStyle='#0c4a6e';ctx.font='900 24px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',40,36);
  });
  for(const kind of ['police','fire','rescue','jail']){
    register(`bps-facility-${kind}`,ctx=>{
      circle(ctx,40,40,33,({police:'#1e40af',fire:'#dc2626',rescue:'#d97706',jail:'#7c3aed'})[kind],'#fff',5);
      ctx.font='900 23px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
      ctx.fillText(({police:'PD',fire:'FD',rescue:'EMS',jail:'JAIL'})[kind],40,40);
    });
  }
  register('bps-search-pin',ctx=>{circle(ctx,40,40,29,'#10b981','#fff',6);circle(ctx,40,40,9,'#fff','#fff',1);});
  register('bps-destination-pin',ctx=>{circle(ctx,40,40,29,'#f97316','#fff',6);circle(ctx,40,40,9,'#fff','#fff',1);});
}

// Base44 resolves function routes under the *app's own origin*. Cross-origin
// base44.app URLs can fail credentialed tile-worker requests (wildcard CORS).
// Use same-origin /functions, both in published and preview apps.
const sdkProxyBase = () => `${window.location.origin}/functions/tomtomMapProxy`;

/** TomTom main CAD map, with automatic fallback to the original map on failure. */
export default function TomTomSdkMapPreview({onClose,currentLocation,activeCalls=[],otherUnits=[],route=[],destination,mapTheme='day',navigation=null,onCallClick,embedded=false,heading=null,onSelectPoint,onMapUnavailable,searchPins=[],selectedPin=null,speedMph=0,recenterRevision=0,mapPickEnabled=false,facilityFilters={},showPoliceStations=true,showFireStations=true,showJails=true,onSelectFacility}) {
  const elementRef=useRef(null);
  const sdkRef=useRef(null);
  const clickRef=useRef(onCallClick);
  const callsRef=useRef(activeCalls);
  const facilitiesRef=useRef([]);
  const userInteractedRef=useRef(false);
  const mapClickEnabledRef=useRef(mapPickEnabled);
  const lastFollowAtRef=useRef(0);
  const onSelectPointRef=useRef(onSelectPoint);
  const onSelectFacilityRef=useRef(onSelectFacility);
  const onMapUnavailableRef=useRef(onMapUnavailable);
  const cadDataRef=useRef({currentLocation,activeCalls,otherUnits,route,destination,searchPins,selectedPin,facilityFilters,showPoliceStations,showFireStations,showJails});
  const trafficRef=useRef({flow:null,incidents:null});
  const trafficInitRef=useRef(false);
  const terrainInitRef=useRef(false);
  const perspectiveInitRef=useRef(false);
  const mapReadyRef=useRef(false);
  const activeThemeRef=useRef(mapTheme);
  const switchingThemeRef=useRef(false);
  const nextThemeRef=useRef(mapTheme);
  const cleanupRef=useRef(null);
  const tileErrorsRef=useRef(0);
  const [trafficVisible,setTrafficVisible]=useState(true);
  const [trafficReady,setTrafficReady]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [resourceStatus,setResourceStatus]=useState('Checking map resources…');
  const [renderStatus,setRenderStatus]=useState('Initializing renderer…');
  clickRef.current=onCallClick;
  onSelectPointRef.current=onSelectPoint;
  onSelectFacilityRef.current=onSelectFacility;
  onMapUnavailableRef.current=onMapUnavailable;
  cadDataRef.current={currentLocation,activeCalls,otherUnits,route,destination,searchPins,selectedPin,facilityFilters,showPoliceStations,showFireStations,showJails};
  mapClickEnabledRef.current=mapPickEnabled;
  // A traffic style reload creates new sources. Immediately repopulate them
  // from the latest CAD snapshot instead of waiting for the next GPS update.
  const syncCadData=(map)=>{
    if(!map || !map.getSource('pathfinder-calls'))return;
    const snapshot=cadDataRef.current;
    const calls=(snapshot.activeCalls||[]).filter(call=>mapped(call.latitude,call.longitude));
    callsRef.current=calls;
    map.getSource('pathfinder-calls')?.setData(featureCollection(calls.map(call=>marker(call.id,call.latitude,call.longitude,{id:call.id,label:String(call.incident||call.call_type||'CAD call').slice(0,42),icon:`bps-${cadCallIcon(call)}`} ))));
    // Same visibility/privacy checks as the original Leaflet officer layer;
    // use freshest valid live, coarse, or last-known coordinate.
    const units=(snapshot.otherUnits||[]).map(unit=>({unit,position:unitPosition(unit)})).filter(row=>row.position);
    map.getSource('pathfinder-units')?.setData(featureCollection(units.map(({unit,position},i)=>
      marker(unit.id||i,position.latitude,position.longitude,{
        icon:unitShieldIcon(unit),label:String(unit.unit_number||unit.unitName||unit.name||'Officer').slice(0,35)
      }))));
    map.getSource('pathfinder-self')?.setData(featureCollection(coords(snapshot.currentLocation)?[marker('self',snapshot.currentLocation[0],snapshot.currentLocation[1])]:[]));
    map.getSource('pathfinder-destination')?.setData(featureCollection(snapshot.destination && coords(snapshot.destination.coords)?[marker('destination',snapshot.destination.coords[0],snapshot.destination.coords[1])]:[]));
    const pins=(snapshot.searchPins||[]).filter(pin=>coords(pin?.coords));
    map.getSource('pathfinder-search-results')?.setData(featureCollection(pins.map((pin,index)=>marker(pin.id||`search-${index}`,pin.coords[0],pin.coords[1],{title:String(pin.name||pin.address||'Destination').slice(0,70)}))));
    const chosen=snapshot.selectedPin;
    map.getSource('pathfinder-selected-point')?.setData(featureCollection(chosen&&coords(chosen.coords)?[marker('selected',chosen.coords[0],chosen.coords[1])]:[]));
    const facilities=[];
    if(snapshot.showPoliceStations){
      for(const station of Object.values(POLICE_STATIONS).flat())
        facilities.push({...station,kind:'police',coords:station.coords});
      for(const station of precincts)
        facilities.push({...station,kind:'police',coords:station.coords});
    }
    if(snapshot.showJails)for(const jail of jails)facilities.push({...jail,kind:'jail',coords:jail.coords});
    if(snapshot.showFireStations){
      for(const station of getVisibleEmergencyStations({...snapshot.facilityFilters,showFireStations:true,showRescueStations:true}))
        facilities.push({...station,kind:station.kind==='rescue'?'rescue':'fire',coords:[station.lat,station.lng]});
    }
    const shown=facilities.filter(item=>coords(item.coords));
    facilitiesRef.current=shown;
    map.getSource('pathfinder-facilities')?.setData(featureCollection(shown.map((facility,index)=>
      marker(`facility-${index}`,facility.coords[0],facility.coords[1],{key:index,icon:`bps-facility-${facility.kind}`,
      label:String(facility.name||facility.kind).slice(0,70)}))));
    const points=(snapshot.route||[]).filter(coords).map(point=>[Number(point[1]),Number(point[0])]);
    map.getSource('pathfinder-route')?.setData(featureCollection(points.length>=2?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}]:[]));
  };
  useEffect(()=>{
    let cancelled=false;
    let sdk;
    let errorTimer;
    async function init(){
      try {
        const [{TomTomMap, BaseMapModule, TerrainModule, TrafficFlowModule, TrafficIncidentsModule}, {TomTomConfig}, maplibre]=await Promise.all([
          import('@tomtom-org/maps-sdk/map'), import('@tomtom-org/maps-sdk/core'), import('maplibre-gl'),
        ]);
        if(cancelled || !elementRef.current) return;
        const proxy=sdkProxyBase();
        // Validate the actual signed-in map-style and vector tile endpoints.
        // MapLibre can emit a 'load' event with no usable tile imagery; report
        // service responses separately so a blank map is never silent.
        void (async()=>{
          try {
            const auth=window.localStorage.getItem('base44_access_token');
            const requestHeaders={...(auth?{Authorization:`Bearer ${auth}`}:{}) ,
              'Base44-App-Id':appParams.appId,
              ...(appParams.functionsVersion?{'Base44-Functions-Version':appParams.functionsVersion}:{})};
            const url=new URL(proxy);
            url.searchParams.set('resourcePath','/maps/orbis/assets/styles/0.6.0-0/style.json');
            url.searchParams.set('apiVersion','1');
            url.searchParams.set('map','basic_street-light');
            const styleResponse=await fetch(url,{headers:requestHeaders,credentials:'include'});
            if(!styleResponse.ok)throw new Error(`style HTTP ${styleResponse.status}`);
            const json=await styleResponse.json();
            const template=json.sources?.vectorTiles?.tiles?.[0];
            if(!template)throw new Error('style missing street-tile source');
            const tileUrl=String(template).replace(/\{z\}/g,'13').replace(/\{x\}/g,'2330').replace(/\{y\}/g,'3139');
            const tileResponse=await fetch(tileUrl,{headers:requestHeaders,credentials:'include'});
            if(!tileResponse.ok)throw new Error(`street tile HTTP ${tileResponse.status}`);
            if(cancelled)return;
            setResourceStatus('TomTom street tiles available');
          }catch(e){
            if(!cancelled){
              setResourceStatus(`TomTom tile check pending: ${e?.message || 'network error'}`);
            }
          }
        })();
        // No API key is passed to the map. The authenticated Base44 function
        // adds credentials upstream and strips them from styles and other data.
        TomTomConfig.instance.put({commonBaseURL:proxy,language:'en-US'});
        maplibre.setWorkerUrl(workerURL());
        sdk=new TomTomMap({registerMapLibreWorker:false,
          style:{type:'standard',id:mapTheme==='night'?'streetDarkDriving':'streetLightDriving',include:['terrain','trafficFlow','trafficIncidents']},
          mapLibre:{container:elementRef.current,center:coords(currentLocation)
            ? [Number(currentLocation[1]),Number(currentLocation[0])] : [-77.436,37.541],zoom:15.5,pitch:50},
          // MapLibre's transformRequest MUST be synchronous; an async callback
          // returns a Promise instead of RequestParameters and breaks tiles.
          transformRequest:request=>{
            const url=new URL(request.url,window.location.href);
            // Guard against forwarding a user's Base44 session to TomTom/CDNs.
            if(url.origin!==new URL(proxy).origin || !url.pathname.startsWith(new URL(proxy).pathname)) return request;
            // Base44 routes one function name only; nested paths otherwise
            // return 404. Tunnel the SDK resource pathname as a query value.
            const proxyPath = new URL(proxy).pathname;
            const suffix = url.pathname.slice(proxyPath.length);
            const resolved = new URL(proxy);
            resolved.search = url.search;
            if (suffix) resolved.searchParams.set('resourcePath', suffix);
            resolved.searchParams.delete('key');
            // SDK uses map version and language in URL. Preserve them while
            // stripping key; Base44 adds private credentials upstream.
            const token=window.localStorage.getItem('base44_access_token');
            return {...request,url:resolved.toString(),headers:{...(request.headers||{}),
              ...(token?{Authorization:`Bearer ${token}`}:{}) ,
              'Base44-App-Id':appParams.appId,
              ...(appParams.functionsVersion?{'Base44-Functions-Version':appParams.functionsVersion}:{})},
              credentials:'include'};
          },
        });
        if(cancelled){sdk?.destroy?.();return;}
        sdkRef.current=sdk;
        activeThemeRef.current=mapTheme;
        const map=sdk.mapLibreMap;
        // Some iPads and embedded browsers build the map before their flex
        // viewport is laid out. Keep its WebGL canvas matched to the element.
        const observer=typeof ResizeObserver==='function' ? new ResizeObserver(()=>map.resize()) : null;
        if(observer)observer.observe(elementRef.current);
        const resize=()=>map.resize();
        window.addEventListener('resize',resize);
        window.requestAnimationFrame(()=>{if(!cancelled)map.resize();});
        const updateRenderStatus=()=>{
          if(cancelled)return;
          const canvas=map.getCanvas();
          const rect=elementRef.current?.getBoundingClientRect();
          const layerCount=map.getStyle()?.layers?.length||0;
          const sourceCount=Object.keys(map.getStyle()?.sources||{}).length;
          let featureCount=0;
          try{featureCount=map.queryRenderedFeatures().length;}catch{}
          setRenderStatus(`Canvas ${Math.round(rect?.width||0)}×${Math.round(rect?.height||0)} · GL ${canvas.width}×${canvas.height} · Layers ${layerCount} · Sources ${sourceCount} · Features ${featureCount}`);
        };
        map.on('idle',updateRenderStatus);
        // Diagnostics run on actual rendering events, not every few seconds
        // while an officer pans the map on a phone.
        const renderMonitor=null;
        window.setTimeout(()=>{if(!cancelled)updateRenderStatus();},800);
        const previousCleanup=cleanupRef.current;
        cleanupRef.current=()=>{window.removeEventListener('resize',resize);observer?.disconnect();window.clearInterval(renderMonitor);previousCleanup?.();};
        const dataInit=()=>{
          if(cancelled) return;
          registerCadIcons(map);
          if(!map.getSource('pathfinder-calls')){
            map.addSource('pathfinder-calls',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-calls-dot',type:'symbol',source:'pathfinder-calls',
              layout:{'icon-image':['get','icon'],'icon-size':0.88,'icon-allow-overlap':true,'icon-ignore-placement':true}});
            map.addLayer({id:'pathfinder-calls-label',type:'symbol',source:'pathfinder-calls',
              layout:{'text-field':['get','label'],'text-size':11,'text-offset':[0,1.6],'text-optional':true},
              paint:{'text-color':'#ffffff','text-halo-color':'#7f1025','text-halo-width':2}});
            map.on('click','pathfinder-calls-dot',event=>{
              const id=event.features?.[0]?.properties?.id;
              const current=(callsRef.current||[]).find(call=>String(call.id)===String(id));
              if(current) clickRef.current?.(current);
            });
          }
          if(!map.getSource('pathfinder-units')){
            map.addSource('pathfinder-units',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-units-dot',type:'symbol',source:'pathfinder-units',
              layout:{'icon-image':['get','icon'],'icon-size':0.75,'icon-allow-overlap':true,'icon-ignore-placement':true}});
            map.addLayer({id:'pathfinder-units-label',type:'symbol',source:'pathfinder-units',
              layout:{'text-field':['get','label'],'text-size':11,'text-offset':[0,1.55],'text-optional':true},
              paint:{'text-color':'#fff','text-halo-color':'#075985','text-halo-width':2}});
          }
          if(!map.getSource('pathfinder-self')){
            map.addSource('pathfinder-self',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-self-dot',type:'symbol',source:'pathfinder-self',
              layout:{'icon-image':'bps-self-shield','icon-size':0.82,'icon-allow-overlap':true,'icon-ignore-placement':true}});
          }
          if(!map.getSource('pathfinder-route')){
            map.addSource('pathfinder-route',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-route-line',type:'line',source:'pathfinder-route',
              paint:{'line-color':'#38bdf8','line-width':6,'line-opacity':0.9}});
          }
          if(!map.getSource('pathfinder-destination')){
            map.addSource('pathfinder-destination',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-destination-dot',type:'symbol',source:'pathfinder-destination',
              layout:{'icon-image':'bps-destination-pin','icon-size':0.75,'icon-allow-overlap':true,'icon-ignore-placement':true}});
          }
          if(!map.getSource('pathfinder-search-results')){
            map.addSource('pathfinder-search-results',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-search-results-dot',type:'symbol',source:'pathfinder-search-results',
              layout:{'icon-image':'bps-search-pin','icon-size':0.72,'icon-allow-overlap':true,'icon-ignore-placement':true}});
            map.on('click','pathfinder-search-results-dot',event=>{
              const feature=event.features?.[0];
              if(feature?.geometry?.coordinates)onSelectPointRef.current?.([feature.geometry.coordinates[1],feature.geometry.coordinates[0]]);
            });
          }
          if(!map.getSource('pathfinder-selected-point')){
            map.addSource('pathfinder-selected-point',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-selected-point-dot',type:'symbol',source:'pathfinder-selected-point',
              layout:{'icon-image':'bps-search-pin','icon-size':0.85,'icon-allow-overlap':true,'icon-ignore-placement':true}});
          }
          if(!map.getSource('pathfinder-facilities')){
            map.addSource('pathfinder-facilities',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-facilities-symbols',type:'symbol',source:'pathfinder-facilities',
              layout:{'icon-image':['get','icon'],'icon-size':0.65,'icon-allow-overlap':false,
                'text-field':['get','label'],'text-size':10,'text-offset':[0,2],'text-optional':true},
              paint:{'text-color':'#fff','text-halo-color':'#0f172a','text-halo-width':2}});
            map.on('click','pathfinder-facilities-symbols',event=>{
              const index=Number(event.features?.[0]?.properties?.key);
              const station=facilitiesRef.current[index];
              if(station)onSelectFacilityRef.current?.({name:station.name,address:station.address||station.name,coords:station.coords,label:'Facility'});
            });
          }
          syncCadData(map);
          // Driving-style 3D buildings need a pitched camera and sufficiently
          // close zoom; the SDK's style initialization can reset mapLibre pitch.
          if(!perspectiveInitRef.current){
            perspectiveInitRef.current=true;
            map.easeTo({zoom:Math.max(15.5,map.getZoom()),pitch:50,duration:300,essential:true});
          }
          mapReadyRef.current=true;
          setReady(true);
          // Built-in TomTom 3D buildings and real elevation/terrain are part
          // of the standard Maps SDK. The enhanced-landmarks preview is not
          // required to enable these stable layers.
          if(!terrainInitRef.current){
            terrainInitRef.current=true;
            Promise.allSettled([
              BaseMapModule.get(sdk,{groups:{buildings3D:{visible:true}}}),
              TerrainModule.get(sdk,{hillshade:{visible:true,method:'multidirectional'},elevation:{visible:true,exaggeration:1.15}}),
            ]).then(results=>{
              for(const result of results) if(result.status==='rejected')
                console.warn('TomTom 3D feature unavailable:',result.reason?.message||'provider unavailable');
            });
          }
          // Re-running TrafficFlowModule.get on every style.load can cause
          // repeated style reloads, lost CAD layers, and visible flickering.
          if(trafficInitRef.current) return;
          trafficInitRef.current=true;
          // The TomTom SDK owns real vector traffic-flow/incident overlays.
          Promise.all([
            TrafficFlowModule.get(sdk,{visible:true}),
            TrafficIncidentsModule.get(sdk,{visible:true,icons:{visible:true}}),
          ]).then(([flow,incidents])=>{
            if(cancelled)return;
            trafficRef.current={flow,incidents};
            setTrafficReady(true);
          }).catch(e=>console.warn('TomTom live traffic modules unavailable:',e?.message||e));
        };
        map.on('load',dataInit);
        map.on('style.load',dataInit);
        map.on('click', event=>{
          const features=map.queryRenderedFeatures(event.point,{layers:['pathfinder-calls-dot']});
          if(!features.length && mapClickEnabledRef.current)onSelectPointRef.current?.([event.lngLat.lat,event.lngLat.lng]);
        });
        map.on('dragstart',()=>{userInteractedRef.current=true;});
        if(map.isStyleLoaded()) dataInit();
        const onMapError=e=>{
          if(cancelled)return;
          tileErrorsRef.current++;
          const status=Number(e?.error?.status||e?.error?.statusCode||0);
          // Optional terrain and traffic tile errors must not remove a
          // working TomTom street map. Fallback only if no base map renders.
          if((status===401||status===403) && !mapReadyRef.current){
            setError('TomTom map access denied. Checking map availability…');
          }
          console.warn('[TomTom SDK map]',status||e?.error?.code||'Map resource error');
        };
        map.on('error',onMapError);
        map.on('sourcedata', event=>{if(event.isSourceLoaded)tileErrorsRef.current=0;});
        // Loading 3D terrain can temporarily replace map layers and clear
        // queryRenderedFeatures() while style tiles are being re-fetched.
        // Never switch officers back to Leaflet just because terrain/traffic
        // was still loading at 18 seconds. Only a fatal init error or the
        // user's explicit backup-map choice should replace TomTom.
        errorTimer=window.setTimeout(()=>{
          if(cancelled)return;
          let rendered=false;
          try{rendered=map.isStyleLoaded() && map.queryRenderedFeatures().length>0;}catch{}
          if(!rendered){
            map.resize();
            map.triggerRepaint();
            setResourceStatus('TomTom 3D map is loading or rebuilding; CAD backup remains in Map Tools.');
          }
        },18000);
      }catch(e){if(!cancelled){setError(`TomTom map could not start: ${e?.message||'Unknown error'}.`);if(embedded)onMapUnavailableRef.current?.();}}
    }
    init();
    return ()=>{cancelled=true;clearTimeout(errorTimer);cleanupRef.current?.();cleanupRef.current=null;trafficRef.current={flow:null,incidents:null};trafficInitRef.current=false;terrainInitRef.current=false;perspectiveInitRef.current=false;mapReadyRef.current=false;try{sdkRef.current?.mapLibreMap?.remove?.();}catch{}sdkRef.current=null;};
  }, []);
  // The Pathfinder day/night toggle changes props, not the TomTom map
  // instance. Update the actual TomTom style and retain module state. The
  // style.load handler below rebuilds CAD overlays on the new style.
  useEffect(()=>{
    const sdk=sdkRef.current;
    if(!sdk || !ready)return;
    nextThemeRef.current=mapTheme;
    if(switchingThemeRef.current || activeThemeRef.current===mapTheme)return;
    let stopped=false;
    const update=async()=>{
      switchingThemeRef.current=true;
      try{
        while(!stopped && activeThemeRef.current!==nextThemeRef.current){
          const target=nextThemeRef.current;
          await sdk.setStyle({type:'standard',id:target==='night'?'streetDarkDriving':'streetLightDriving',
            include:['terrain','trafficFlow','trafficIncidents']});
          if(stopped)return;
          activeThemeRef.current=target;
          syncCadData(sdk.mapLibreMap);
        }
        if(!stopped)setError('');
      }catch(error){
        if(!stopped){
          console.warn('TomTom theme change failed:',error?.message||error);
          setError('TomTom map theme could not load; current map remains available.');
        }
      }finally{switchingThemeRef.current=false;}
    };
    void update();
    return()=>{stopped=true;};
  },[mapTheme,ready]);
  useEffect(()=>{
    if(!trafficReady)return;
    trafficRef.current.flow?.setVisible(trafficVisible);
    trafficRef.current.incidents?.setVisible(trafficVisible);
  },[trafficVisible,trafficReady]);
  useEffect(()=>{
    const map=sdkRef.current?.mapLibreMap;
    if(ready&&map)syncCadData(map);
  },[ready,currentLocation,activeCalls,otherUnits,route,destination,searchPins,selectedPin,facilityFilters,showPoliceStations,showFireStations,showJails]);
  useEffect(()=>{
    const map=sdkRef.current?.mapLibreMap;
    const driving=Boolean(navigation) || Number(speedMph)>=5;
    if (!ready || !map || !coords(currentLocation) || !driving) return;
    const now=Date.now();
    if(now-lastFollowAtRef.current<700)return;
    lastFollowAtRef.current=now;
    const bearing=Number.isFinite(Number(heading)) ? Number(heading) : map.getBearing();
    map.easeTo({center:[Number(currentLocation[1]),Number(currentLocation[0])],zoom:Math.max(map.getZoom(),16),pitch:55,bearing,duration:650,essential:true});
  },[ready,currentLocation,heading,navigation?.instruction,speedMph]);
  useEffect(()=>{
    if(!ready || !recenterRevision)return;
    const map=sdkRef.current?.mapLibreMap;
    if(map && coords(currentLocation))map.flyTo({center:[Number(currentLocation[1]),Number(currentLocation[0])],zoom:16,duration:550});
  },[ready,recenterRevision]);
  const surface = <div role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-label="TomTom SDK interactive map" className={embedded ? 'absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-[#07101b] text-white' : 'fixed inset-0 z-[2147482900] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#07101b] text-white'} style={embedded ? {height:'100%',minHeight:0,width:'100%'} : {height:'100dvh',minHeight:'100dvh',width:'100vw',paddingTop:'env(safe-area-inset-top)',paddingBottom:'env(safe-area-inset-bottom)'}}>
    {!embedded && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cyan-900 bg-[#0b1d2b] p-2 sm:flex-nowrap sm:gap-3 sm:p-3">
      <div className="flex min-w-0 items-center gap-2"><Shield className="h-5 w-5 shrink-0 text-cyan-300"/><div className="min-w-0"><h2 className="truncate text-sm font-black">TomTom Maps SDK</h2><p className="truncate text-[10px] text-slate-300">Interactive map preview · CAD remains available underneath</p></div></div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <button type="button" disabled={!trafficReady} onClick={()=>setTrafficVisible(v=>!v)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-600 px-3 text-xs font-bold disabled:opacity-50" aria-pressed={trafficVisible} title="Toggle real TomTom traffic flow and road incidents"><CloudSun size={17}/>{trafficVisible?'Traffic on':'Traffic off'}</button>
        <button type="button" onClick={()=>{const map=sdkRef.current?.mapLibreMap;if(map&&coords(currentLocation))map.flyTo({center:[Number(currentLocation[1]),Number(currentLocation[0])],zoom:16});}} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-600 px-3 text-xs font-bold" title="Recenter TomTom map on your GPS"><Crosshair size={17}/><span className="hidden sm:inline">Recenter</span></button>
        <button type="button" onClick={onClose} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-cyan-700 px-3 text-xs font-bold"><X size={17}/>Back to CAD</button>
      </div>
    </div>}
    {!embedded && navigation && <div role="status" className="shrink-0 border-b border-emerald-700 bg-[#0a251b] px-3 py-2 text-white"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{navigation.distance} · {navigation.instruction}</strong><span className="text-xs font-bold text-emerald-200">{navigation.eta} ETA · {navigation.provider === 'TomTom' ? 'TomTom routing' : 'Fallback routing'}</span></div>{navigation.then && <div className="mt-1 text-xs text-slate-200">Then: {navigation.then}</div>}</div>}
    <div className="relative min-h-0 w-full flex-1 overflow-hidden" style={embedded ? {height:'100%',minHeight:0,flex:'1 1 auto'} : {height:'calc(100dvh - 100px)',minHeight:'240px',flex:'1 1 auto'}}>
      <div ref={elementRef} className="absolute inset-0 h-full w-full" style={{width:'100%',height:'100%',minHeight:embedded ? 0 : '240px'}} aria-label="TomTom interactive map"/>
      {error && <div role="alert" className="pointer-events-none absolute inset-x-3 top-3 rounded-xl border border-amber-500 bg-slate-950/95 p-4 text-sm text-amber-100 shadow-lg">{error}</div>}
      {!ready && !error && <div role="status" className="pointer-events-none absolute inset-x-3 top-3 rounded-xl bg-slate-950/90 p-3 text-xs text-white">Loading TomTom map resources…</div>}
      {(error || !ready) && <div role="status" className="pointer-events-none absolute bottom-4 right-3 max-w-[70%] rounded-lg bg-slate-950/85 p-2 text-[10px] text-slate-200"><div>{resourceStatus}</div>{error && <div className="mt-0.5 opacity-75">{renderStatus}</div>}</div>}
      {!embedded && ready && <div className="pointer-events-none absolute bottom-4 left-3 rounded-lg bg-slate-950/85 p-2 text-[10px] text-slate-200"><MapPin className="mr-1 inline h-3 w-3"/>Red: CAD calls · Blue: units · Green: your GPS</div>}
    </div>
  </div>;
  return embedded ? surface : createPortal(surface,document.body);
}
