import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, MapPin, Crosshair, CloudSun } from 'lucide-react';
import { appParams } from '@/lib/app-params';
import 'maplibre-gl/dist/maplibre-gl.css';

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
// Base44 resolves function routes under the *app's own origin*. Cross-origin
// base44.app URLs can fail credentialed tile-worker requests (wildcard CORS).
// Use same-origin /functions, both in published and preview apps.
const sdkProxyBase = () => `${window.location.origin}/functions/tomtomMapProxy`;

/**
 * Opt-in interactive TomTom SDK renderer. Does not unmount or replace the
 * operational Leaflet CAD map. If the map proxy is inaccessible or WebGL fails,
 * officers close this view and keep the full-featured dispatch map unchanged.
 */
export default function TomTomSdkMapPreview({onClose,currentLocation,activeCalls=[],otherUnits=[],route=[],destination,mapTheme='day',onCallClick}) {
  const elementRef=useRef(null);
  const sdkRef=useRef(null);
  const clickRef=useRef(onCallClick);
  const callsRef=useRef(activeCalls);
  const trafficRef=useRef({flow:null,incidents:null});
  const [trafficVisible,setTrafficVisible]=useState(true);
  const [trafficReady,setTrafficReady]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  clickRef.current=onCallClick;
  useEffect(()=>{
    let cancelled=false;
    let sdk;
    let errorTimer;
    async function init(){
      try {
        const [{TomTomMap, TrafficFlowModule, TrafficIncidentsModule}, {TomTomConfig}, maplibre]=await Promise.all([
          import('@tomtom-org/maps-sdk/map'), import('@tomtom-org/maps-sdk/core'), import('maplibre-gl'),
        ]);
        if(cancelled || !elementRef.current) return;
        const proxy=sdkProxyBase();
        // No API key is passed to the map. The authenticated Base44 function
        // adds credentials upstream and strips them from styles and other data.
        TomTomConfig.instance.put({commonBaseURL:proxy,language:'en-US'});
        maplibre.setWorkerUrl('/tomtom-sdk/maplibre-gl-worker.mjs');
        sdk=new TomTomMap({registerMapLibreWorker:false,
          style:{type:'standard',id:mapTheme==='night'?'streetDarkDriving':'streetLightDriving',include:['trafficFlow','trafficIncidents']},
          mapLibre:{container:elementRef.current,center:coords(currentLocation)
            ? [Number(currentLocation[1]),Number(currentLocation[0])] : [-77.436,37.541],zoom:13},
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
        const map=sdk.mapLibreMap;
        const dataInit=()=>{
          if(cancelled) return;
          if(!map.getSource('pathfinder-calls')){
            map.addSource('pathfinder-calls',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-calls-dot',type:'circle',source:'pathfinder-calls',
              paint:{'circle-radius':8,'circle-color':'#ff334b','circle-stroke-width':2,'circle-stroke-color':'#fff'}});
            map.on('click','pathfinder-calls-dot',event=>{
              const id=event.features?.[0]?.properties?.id;
              const current=(callsRef.current||[]).find(call=>String(call.id)===String(id));
              if(current) clickRef.current?.(current);
            });
          }
          if(!map.getSource('pathfinder-units')){
            map.addSource('pathfinder-units',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-units-dot',type:'circle',source:'pathfinder-units',
              paint:{'circle-radius':7,'circle-color':'#0ea5e9','circle-stroke-width':2,'circle-stroke-color':'#fff'}});
          }
          if(!map.getSource('pathfinder-self')){
            map.addSource('pathfinder-self',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-self-dot',type:'circle',source:'pathfinder-self',
              paint:{'circle-radius':10,'circle-color':'#22c55e','circle-stroke-width':3,'circle-stroke-color':'#fff'}});
          }
          if(!map.getSource('pathfinder-route')){
            map.addSource('pathfinder-route',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-route-line',type:'line',source:'pathfinder-route',
              paint:{'line-color':'#38bdf8','line-width':6,'line-opacity':0.9}});
          }
          if(!map.getSource('pathfinder-destination')){
            map.addSource('pathfinder-destination',{type:'geojson',data:featureCollection([])});
            map.addLayer({id:'pathfinder-destination-dot',type:'circle',source:'pathfinder-destination',
              paint:{'circle-radius':10,'circle-color':'#f97316','circle-stroke-width':3,'circle-stroke-color':'#fff'}});
          }
          setReady(true);
          // The TomTom SDK owns real, live vector-tile traffic flow and incident
          // overlays; no generated/random traffic on a patrol map.
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
        if(map.isStyleLoaded()) dataInit();
        const onMapError=e=>{
          if(!cancelled && !sdk.mapReady) setError('TomTom map resources could not load. The original CAD map is still available.');
          console.warn('[TomTom SDK map]',e?.error?.code||e?.error?.message||'Map resource unavailable');
        };
        map.on('error',onMapError);
        errorTimer=window.setTimeout(()=>{if(!cancelled&&!map.isStyleLoaded())setError('TomTom map did not finish loading. Close this window to use the standard CAD map.');},16000);
      }catch(e){if(!cancelled)setError(`TomTom SDK could not start: ${e?.message||'Unknown error'}. Close to return to CAD.`);}
    }
    init();
    return ()=>{cancelled=true;clearTimeout(errorTimer);trafficRef.current={flow:null,incidents:null};try{sdkRef.current?.mapLibreMap?.remove?.();}catch{}sdkRef.current=null;};
  }, []);
  useEffect(()=>{
    if(!trafficReady)return;
    trafficRef.current.flow?.setVisible(trafficVisible);
    trafficRef.current.incidents?.setVisible(trafficVisible);
  },[trafficVisible,trafficReady]);
  useEffect(()=>{
    const map=sdkRef.current?.mapLibreMap;
    if(!ready||!map)return;
    const calls=activeCalls.filter(call=>mapped(call.latitude,call.longitude));
    // Keep current calls in the component, never in global window state.
    callsRef.current=calls;
    map.getSource('pathfinder-calls')?.setData(featureCollection(calls.map(call=>marker(call.id,call.latitude,call.longitude,{id:call.id}))));
    const units=otherUnits.filter(unit=>mapped(unit.latitude,unit.longitude));
    map.getSource('pathfinder-units')?.setData(featureCollection(units.map((unit,i)=>marker(unit.id||i,unit.latitude,unit.longitude))));
    map.getSource('pathfinder-self')?.setData(featureCollection(coords(currentLocation)?[marker('self',currentLocation[0],currentLocation[1])]:[]));
    map.getSource('pathfinder-destination')?.setData(featureCollection(destination && coords(destination.coords)?[marker('destination',destination.coords[0],destination.coords[1])]:[]));
    const points=route.filter(coords).map(point=>[Number(point[1]),Number(point[0])]);
    map.getSource('pathfinder-route')?.setData(featureCollection(points.length>=2?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}]:[]));
    return undefined;
  },[ready,currentLocation,activeCalls,otherUnits,route,destination]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="TomTom SDK interactive map" className="fixed inset-0 z-[2147482900] flex flex-col bg-[#07101b] text-white" style={{paddingTop:'env(safe-area-inset-top)',paddingBottom:'env(safe-area-inset-bottom)'}}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cyan-900 bg-[#0b1d2b] p-2 sm:flex-nowrap sm:gap-3 sm:p-3">
      <div className="flex min-w-0 items-center gap-2"><Shield className="h-5 w-5 shrink-0 text-cyan-300"/><div className="min-w-0"><h2 className="truncate text-sm font-black">TomTom Maps SDK</h2><p className="truncate text-[10px] text-slate-300">Interactive map preview · CAD remains available underneath</p></div></div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <button type="button" disabled={!trafficReady} onClick={()=>setTrafficVisible(v=>!v)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-600 px-3 text-xs font-bold disabled:opacity-50" aria-pressed={trafficVisible} title="Toggle real TomTom traffic flow and road incidents"><CloudSun size={17}/>{trafficVisible?'Traffic on':'Traffic off'}</button>
        <button type="button" onClick={()=>{const map=sdkRef.current?.mapLibreMap;if(map&&coords(currentLocation))map.flyTo({center:[Number(currentLocation[1]),Number(currentLocation[0])],zoom:16});}} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-slate-600 px-3 text-xs font-bold" title="Recenter TomTom map on your GPS"><Crosshair size={17}/><span className="hidden sm:inline">Recenter</span></button>
        <button type="button" onClick={onClose} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-cyan-700 px-3 text-xs font-bold"><X size={17}/>Back to CAD</button>
      </div>
    </div>
    <div className="relative min-h-0 flex-1">
      <div ref={elementRef} className="absolute inset-0" aria-label="TomTom interactive map"/>
      {error && <div role="alert" className="pointer-events-none absolute inset-x-3 top-3 rounded-xl border border-amber-500 bg-slate-950/95 p-4 text-sm text-amber-100 shadow-lg">{error}</div>}
      {!ready && !error && <div role="status" className="pointer-events-none absolute inset-x-3 top-3 rounded-xl bg-slate-950/90 p-3 text-xs text-white">Loading TomTom map resources…</div>}
      {ready && <div className="pointer-events-none absolute bottom-4 left-3 rounded-lg bg-slate-950/85 p-2 text-[10px] text-slate-200"><MapPin className="mr-1 inline h-3 w-3"/>Red: CAD calls · Blue: units · Green: your GPS</div>}
    </div>
  </div>,document.body);
}
