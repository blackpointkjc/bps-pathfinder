
import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer} from 'react-leaflet';
import PathfinderTileLayer from '/src/components/map/PathfinderTileLayer';
import {Search,Crosshair,Users,Eye,Home,Flame,Layers,MapPin} from 'lucide-react';
import '/src/index.css';
import '/src/App.css';
import '/src/responsive.css';
import '/src/field-readability.css';
import '/src/components/map/mapWorkspace.css';
import 'leaflet/dist/leaflet.css';
import LiveMapToolbar from '/src/components/map/LiveMapToolbar';
import MapToolDock from '/src/components/map/MapToolDock';
import MapCallPanel from '/src/components/map/MapCallPanel';
import EmergencyStationMarkers from '/src/components/map/EmergencyStationMarkers';
import PoliceStationMarkers from '/src/components/map/PoliceStationMarkers';
import PrecinctMarkers from '/src/components/map/PrecinctMarkers';
const noop=()=>{};
function Review(){
 const toolbarRef=useRef(null);const [top,setTop]=useState(68);
 useEffect(()=>{const element=toolbarRef.current;const update=()=>setTop(element.getBoundingClientRect().height+12);const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect();},[]);
 const [panel,setPanel]=useState('layers');
 const [call,setCall]=useState(false);
 const [collapsed,setCollapsed]=useState(false);
 const [status,setStatus]=useState('Available');
 const [filters,setFilters]=useState({showFireStations:true,showRescueStations:true,showPoliceStations:true,showEMS:true,showJails:false});
 const user={unit_number:'100',rank:'Officer',role:'officer'};
 const actions=[{key:'search',title:'Search for a destination',icon:<Search/>,onClick:()=>{setCall(true);setPanel(null);}},
 {key:'recenter',title:'Center on my location',icon:<Crosshair/>,onClick:noop},
 {key:'fitunits',title:'Show all units',icon:<Users/>,onClick:noop},
 {key:'calls',title:'Show calls',icon:<Eye/>,active:true,onClick:()=>{setCall(true);setPanel(null);}},
 {key:'home',title:'Show home location',icon:<Home/>,onClick:noop},
 {key:'pick',title:'Pick a location',icon:<MapPin/>,onClick:noop},
 {key:'theme',title:'Change map style',icon:<Layers/>,onClick:noop},
 {key:'heatmap',title:'Show call heatmap',icon:<Flame/>,onClick:noop}];
 return <div className="cad-app" style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
 <header className="pathfinder-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'white'}}><div style={{display:'flex',gap:14,alignItems:'center'}}><button>☰</button><button>Admin main</button><div className="pf-header-context"><div>Pathfinder</div><div>Operations platform</div></div></div><div style={{display:'flex',alignItems:'center',gap:10}}><button className="pf-display-trigger">Aa</button><button>System</button><button>Device GPS</button><button>Audio on</button><button>↻</button></div></header>
 <nav className="cad-mode-nav">{['Command board','Dispatch queue','Officer queue','Live map','Officer status','BOLO / alerts','Call history','Records'].map(label=><button key={label} aria-current={label==='Live map'?'page':undefined}>{label}</button>)}</nav>
 <main className="mobile-field-content" data-page="Navigation" style={{flex:1,minHeight:0,display:"flex"}}><div className="pf-navigation-workspace" style={{flex:1,minHeight:0,position:'relative'}}>
 <MapContainer center={[37.55,-77.445]} zoom={13} style={{position:'absolute',inset:0}} zoomControl={false}>
 <PathfinderTileLayer theme="day"/>
 <EmergencyStationMarkers filters={filters} onNavigate={noop}/><PoliceStationMarkers showStations={filters.showPoliceStations} onNavigateToStation={noop}/><PrecinctMarkers showStations={filters.showPoliceStations} onNavigateToPrecinct={noop}/>
 </MapContainer>
 <div ref={toolbarRef} style={{position:'absolute',top:0,left:0,right:0,zIndex:1010}}><LiveMapToolbar user={user} status={status} onStatusChange={setStatus} onBack={noop} onRecenter={noop} gpsLabel="GPS unavailable" online unitCount={1} callCount={27} unassignedCount={3} criticalCount={2} onToggleFullscreen={noop} onRefreshCalls={noop} callsStatus="Calls checked 9:25 PM"/></div>
 <MapToolDock actions={actions} panel={panel} onPanelChange={next=>{setPanel(next);if(next)setCall(false);}} filters={filters} onFiltersChange={setFilters} top={top}/>
 {call&&<MapCallPanel top={top} call={{id:'design-demo',incident:'Structure fire',location:'1300 Coalter St',agency:'RFD',priority:'critical',status:'On Scene',time_received:'2026-10-30T00:50:00Z',latitude:37.54,longitude:-77.42,description:'Assist fire personnel with traffic and crowd control. Follow incident command instructions.',assigned_units:[]}} currentUser={user} collapsed={collapsed} onCollapse={setCollapsed} onClose={()=>setCall(false)} onLocate={noop} onNavigate={noop} onAssign={noop} onUnassign={noop} onStreetView={noop} onExternalMap={noop} unitLabel={value=>value}/>}
 </div></main></div>;
}
createRoot(document.getElementById('root')).render(<Review/>);
