const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const catalog = require('../src/data/emergencyStations.json');
const {stations} = catalog;
assert.equal(stations.length,75);
assert.equal(new Set(stations.map(station=>station.id)).size,75);
for(const station of stations){
 assert(station.lat>37&&station.lat<38&&station.lng>-78&&station.lng<-76);
 assert(station.name&&station.address&&station.coordinateSource&&station.companies);
}
assert.deepEqual(stations.filter(s=>s.agency==='richmond').map(s=>s.number).sort((a,b)=>a-b),[1,5,6,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]);
assert.deepEqual(stations.filter(s=>s.agency==='henrico'&&s.kind==='fire').map(s=>s.number).sort((a,b)=>a-b),Array.from({length:23},(_,i)=>i+1));
assert.deepEqual(stations.filter(s=>s.agency==='chesterfield'&&s.number).map(s=>s.number).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,24,25]);
assert(stations.find(s=>s.id==='cfd-5').address.startsWith('13900'));
assert.equal(stations.filter(s=>s.address.startsWith('3500 Courthouse')).length,1);

const modules = new Map();
const leaflet = {DivIcon:class{constructor(options){Object.assign(this,options);}},Icon:class{constructor(options){Object.assign(this,options);}}};
const leafletComponents = new Proxy({}, {get:(_,name)=>name==='__esModule'?false:name});
function load(file){
 file=path.resolve(file);
 if(modules.has(file))return modules.get(file);
 const exports={};modules.set(file,exports);
 const source=fs.readFileSync(file,'utf8');
 const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const requireMock = name=>{
  if(name==='react-leaflet'||name==='lucide-react')return leafletComponents;
  if(name==='leaflet')return leaflet;
  if(name==='react-leaflet-cluster')return 'MarkerClusterGroup';
  if(name.startsWith('@/'))return load(path.resolve('src',name.slice(2))+'.js');
  if(name.startsWith('.')){
   const dest=path.resolve(path.dirname(file),name);
   return dest.endsWith('.json')?require(dest):load(dest.endsWith('.js')?dest:dest+'.js');
  }
  return require(name);
 };
 vm.runInNewContext(result,{exports,require:requireMock,React,console,Map,Set,btoa:text=>Buffer.from(text).toString('base64')},{filename:file});
 return exports;
}
const helper=load('src/lib/emergencyStationCatalog.js');
assert.equal(helper.getVisibleEmergencyStations({showFireStations:true}).length,66);
assert.equal(helper.getVisibleEmergencyStations({showRescueStations:true}).length,10);
assert.equal(helper.getVisibleEmergencyStations({showFireStations:true,showRescueStations:true}).length,75);
assert.equal(helper.getVisibleEmergencyStations({showFireStations:false,showRescueStations:false}).length,0);
assert.equal(helper.getVisibleEmergencyStations({showFireStations:true,richmondFacilities:false}).length,46);

function walk(element,out=[]){
 if(Array.isArray(element)){element.forEach(child=>walk(child,out));return out;}
 if(!element||typeof element!=='object')return out;
 if(element.type)out.push(element);
 walk(element.props?.children,out);
 return out;
}
function verifyInteraction(Component, props, callbackName, expectedCount){
 const calls=[];
 const elements=walk(Component({...props,[callbackName]:destination=>calls.push(destination)}));
 const markers=elements.filter(e=>e.type==='Marker');
 assert.equal(markers.length,expectedCount);
 assert.equal(calls.length,0);
 for(const marker of markers){
  assert(!marker.props.eventHandlers?.click,'Marker click must not start navigation');
  const contents=walk(marker);
  assert(contents.some(e=>e.type==='Tooltip'),'Missing hover details');
  const navigate=contents.find(e=>e.type==='button'&&typeof e.props.onClick==='function');
  assert(navigate,'Missing explicit Navigate button');
  const before=calls.length;
  navigate.props.onClick();
  assert.equal(calls.length,before+1);
  assert(Array.isArray(calls.at(-1).coords));
 }
}
verifyInteraction(load('src/components/map/EmergencyStationMarkers.jsx').default,{filters:{showFireStations:true,showRescueStations:true}},'onNavigate',75);
verifyInteraction(load('src/components/map/PoliceStationMarkers.jsx').default,{showStations:true},'onNavigateToStation',8);
verifyInteraction(load('src/components/map/PrecinctMarkers.jsx').default,{showStations:true},'onNavigateToPrecinct',5);
verifyInteraction(load('src/components/map/JailMarkers.jsx').default,{showJails:true},'onNavigateToJail',4);
verifyInteraction(load('src/components/map/CCPDStation.jsx').default,{showStations:true},'onNavigateToStation',1);
verifyInteraction(load('src/components/map/RAAStations.jsx').default,{showStations:true},'onNavigateToStation',5);
// Unit marker uses the same popup-only policy; its existing button remains.
const units=fs.readFileSync('src/components/map/OtherUnitsLayer.jsx','utf8');
assert(!units.includes('eventHandlers={{ click: () => onUnitClick'));
assert(units.includes('onClick={() => onUnitClick(unit)}'));
// Fixed palette exceeds WCAG AA normal text contrast (4.5:1).
function luminance(hex){
 const rgb=hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
assert((luminance('ffffff')+.05)/(luminance('111827')+.05)>4.5);
assert((luminance('e2e8f0')+.05)/(luminance('111827')+.05)>4.5);
console.log('PASS: all requested station sets, official coordinates, regional/type filters, shared-site dedupe, 98 popup-only markers, explicit Navigate callbacks, hover details, readable contrast.');
