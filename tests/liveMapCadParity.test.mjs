import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isLiveMapCall,isVisibleActiveCall} from '../base44/functions/_shared/callFeedPolicy.js';
const now=Date.now();
const base={id:'call',incident:'Assist police',location:'Test address',source:'richmond',latitude:37.54,longitude:-77.4,status:'On Scene',time_received:new Date(now-600000).toISOString()};
test('map uses active policy plus a strict one-hour limit and valid coordinates',()=>{
 for(const row of [base,{...base,time_received:new Date(now-4*3600000).toISOString(),pathfinder_source_active:true},{...base,status:'Cleared'},{...base,time_cleared:new Date(now).toISOString()},{...base,time_received:new Date(now-4*3600000).toISOString()},{...base,manual_dismissed:true}]){
  assert.equal(isLiveMapCall(row,now),isVisibleActiveCall(row,now)&&Date.parse(row.time_received)>now-3600000);
 }
 assert.equal(isLiveMapCall({...base,property_closed:true},now),false);
 assert.equal(isLiveMapCall({...base,latitude:null},now),false);
 assert.equal(isLiveMapCall({...base,latitude:'',longitude:0},now),false);
 assert.equal(isLiveMapCall({...base,latitude:100},now),false);
});
test('navigation shares CAD shell provider and both marker engines consume the same predicate',()=>{
 const read=path=>readFileSync(path,'utf8');
 const nav=read('src/pages/Navigation.jsx');
 assert.ok(nav.includes('calls:activeCalls,loading:cadLoading'));
 assert.ok(nav.includes('useOptionalDashboardData()'));
 assert.ok(!nav.includes('subscribeDispatchCallChanges'));
 assert.ok(!nav.includes('loadActiveDispatchCallRows'));
 assert.ok(!nav.includes('limit: 250'));
 assert.ok(nav.includes('activeCalls={showActiveCalls ? displayedCalls : []}'));
 assert.ok(read('src/components/map/ActiveCallMarkers.jsx').includes('isLiveMapCall(c)'));
 assert.ok(read('src/components/map/TomTomSdkMapPreview.jsx').includes('isLiveMapCall(call)'));
 assert.ok(read('src/lib/dispatchCallRealtime.js').includes('recordCadRealtimeEvent(event)'));
});

test('agency absence and recorded source closure override misleading stored open status and legacy attachments',()=>{
 const old={...base,time_received:new Date(now-40*86400000).toISOString(),status:'On Scene',pathfinder_source_absent:true,pathfinder_property_alert:true,assigned_units:['legacy']};
 assert.equal(isLiveMapCall(old,now),false);
 assert.equal(isVisibleActiveCall({...base,pathfinder_source_absent:true},now),false);
 assert.equal(isLiveMapCall({...base,time_closed:new Date(now).toISOString(),pathfinder_source_active:true},now),false);
 assert.equal(isLiveMapCall({...old,pathfinder_source_active:true,pathfinder_source_absent:false},now),false);
 assert.equal(isLiveMapCall({...old,pathfinder_assignment_unit_ids:['confirmed-local'],pathfinder_local_response:true},now),false);
});

test('even assigned and source-confirmed incidents expire from map at one hour but remain in the active feed',()=>{
 const assigned={...base,pathfinder_source_active:true,pathfinder_assignment_unit_ids:['officer'],time_received:new Date(now-3599999).toISOString()};
 assert.equal(isLiveMapCall(assigned,now),true);
 assert.equal(isLiveMapCall(assigned,now+1),false);
 assert.equal(isVisibleActiveCall(assigned,now+1),true);
 assert.equal(isLiveMapCall({...assigned,source:'dispatch_manual',time_received:new Date(now-7200000).toISOString()},now),false);
 assert.equal(isLiveMapCall({...base,property_closed:true},now),false);
 assert.equal(isLiveMapCall({...base,time_received:new Date(now+1000).toISOString()},now),false);
 const read=path=>readFileSync(path,'utf8');
 assert.ok(read('src/hooks/useLiveMapWindow.js').includes('at+LIVE_MAP_WINDOW_MS'));
 assert.ok(read('src/components/map/TomTomSdkMapPreview.jsx').includes('recentMapCalls=useLiveMapWindow(activeCalls)'));
 assert.ok(read('src/components/map/ActiveCallMarkers.jsx').includes('useLiveMapWindow(calls||EMPTY_CALLS)'));
 assert.ok(read('src/pages/Navigation.jsx').includes('allCalls={mapWindowCalls}'));
 assert.ok(read('src/pages/Navigation.jsx').includes('const indexCalls=mapWindowCalls.filter'));
});
