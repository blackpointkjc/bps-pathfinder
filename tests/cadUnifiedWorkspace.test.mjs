import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitCadIncidents,cadDisplayUnitState} from '../src/lib/cadWorkspaceModel.js';
import {cadRecommendUnits} from '../src/lib/cadRecommendations.js';
import {readCadDisplaySettings,writeCadDisplaySettings,cadScaleValue} from '../src/lib/cadDisplaySettings.js';
import {readFileSync} from 'node:fs';
test('CAD queues partition all open incidents without truncation and keep field intake',()=>{
 const pending=Array.from({length:520},(_,i)=>({id:String(i),status:'New',assigned_units:[]}));
 const calls=[...pending,{id:'field',status:'Dispatched',assigned_units:['u'],source_channel:'dispatcher_field_intake'},{id:'closed',status:'Cleared',assigned_units:[]}];
 const groups=splitCadIncidents(calls);
 assert.equal(groups.pending.length,520);assert.deepEqual(groups.active.map(c=>c.id),['field']);
 assert.deepEqual(splitCadIncidents(calls,true).active.map(c=>c.id),['field']);
 assert.equal(splitCadIncidents([{id:'1',status:'On Scene',assigned_units:['u']}]).active.length,1);
});
test('only connected, unheld, eligible units are recommended; missing positions are not fabricated',()=>{
 const units=[{id:'ok',status:'Available',session_active:true,latitude:null,longitude:10,gps_updated_at:new Date().toISOString()},{id:'offline',status:'Available'},{id:'held',status:'Available',session_active:true,dispatch_hold_new_calls:true},{id:'assigned',user_id:'canonical',status:'Available',session_active:true},{id:'stale',status:'Available',session_active:true,connection_stale:true},{id:'desk',status:'Dispatch',session_active:true}];
 const ranked=cadRecommendUnits({latitude:37,longitude:-77,assigned_units:['canonical']},units);
 assert.deepEqual(ranked.map(x=>x.unit.id),['ok']);assert.equal(ranked[0].distance,null);
 assert.equal(cadDisplayUnitState(units[1]),'offline');assert.equal(cadDisplayUnitState(units[2]),'hold');
});
test('saved scale and map layout are validated and restored',()=>{
 const storage=new Map();globalThis.window={localStorage:{getItem:key=>storage.get(key),setItem:(key,v)=>storage.set(key,v)}};
 try{writeCadDisplaySettings({scale:'large',monitor:false,showMap:false});assert.deepEqual(readCadDisplaySettings(),{scale:'large',monitor:false,showMap:false});assert.equal(cadScaleValue('large'),1.12);assert.equal(writeCadDisplaySettings({scale:'invalid'}).scale,'standard');}finally{delete globalThis.window;}
});
test('CAD shell mounts real unified components and existing authenticated dispatch paths',()=>{
 const grid=readFileSync('src/components/dispatch/cad/UnifiedCadGrid.jsx','utf8');
 const details=readFileSync('src/components/dispatch/CommandIncidentDetails.jsx','utf8');
 const comments=readFileSync('src/components/dispatch/cad/CadIncidentComments.jsx','utf8');
 for(const token of ['Pending incidents','Active incidents','TacticalCommandMap','CadIncidentComments','CommandIncidentDetails'])assert.ok(grid.includes(token));
 assert.ok(details.includes('UnitAssignmentPanel'));assert.ok(comments.includes('sharedCadTimeline'));assert.ok(comments.includes('CallStatusLog'));
});
