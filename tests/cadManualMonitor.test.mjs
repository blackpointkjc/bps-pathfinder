import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monitorStorageKey,normalizeMonitorIds,toggleMonitorId,monitoredIncidents} from '../src/lib/cadMonitorSelection.js';
const read=path=>readFileSync(path,'utf8');
test('manual incident monitor never auto-selects; follows selected incidents and keeps different officer accounts separate',()=>{
 const calls=[{id:'a',status:'New'},{id:'b',status:'Dispatched'},{id:'c',status:'Cleared'}];
 assert.deepEqual(monitoredIncidents(calls,[]),[]);
 assert.deepEqual(monitoredIncidents(calls,['b','a','b','c','missing']).map(c=>c.id),['b','a']);
 assert.deepEqual(toggleMonitorId(['b'],'a'),['b','a']);
 assert.deepEqual(toggleMonitorId(['b','a'],'b'),['a']);
 assert.deepEqual(normalizeMonitorIds(['a','a','',null,42]),['a']);
 assert.notEqual(monitorStorageKey('officer-a'),monitorStorageKey('officer-b'));
});
test('Aa is the single zoom control and sends same-tab changes to CAD pages',()=>{
 const aa=read('src/components/DisplayPreferences.jsx');
 assert.ok(aa.includes('CAD workspace zoom'));assert.ok(aa.includes('CadZoomControls'));assert.ok(aa.includes('bps-cad-display-changed'));
 for(const path of ['src/pages/CADCenter.jsx','src/pages/CommandDashboard.jsx','src/pages/DispatchCenter.jsx']){
  const page=read(path);assert.ok(page.includes('bps-cad-display-changed'));assert.ok(!page.includes('<CadZoomControls'));
 }
});
