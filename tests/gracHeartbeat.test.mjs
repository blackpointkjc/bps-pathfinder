import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceStatus,cadSourceNeedsPoll,noteCadRead,noteCadReadFailure,getConfirmedCadRead,getCadReadFailure,noteCadSourceHealth,getCadSourceSnapshot} from '../src/lib/cadSourceHealth.js';
const now=Date.now(),source={poll_at:new Date(now-30000).toISOString(),poll_status:'success',website_rows:46,api_rows:46,latest_received:new Date(now-600000).toISOString()};
test('recent successful GRAC poll is healthy even with no newly reported incidents',()=>{
 assert.equal(sourceStatus(source,now).label,'GRAC synced');
 assert.equal(cadSourceNeedsPoll(source,now),false);
 assert.equal(cadSourceNeedsPoll(source,now+50000),true);
 assert.equal(sourceStatus(source,now+100000).label,'GRAC delayed');
 assert.equal(sourceStatus({...source,poll_status:'failed:ingestion'},now).label,'GRAC retrying');
 assert.equal(sourceStatus({...source,api_rows:0},now).label,'GRAC partial source');
});
test('failed or invalidated CAD read cannot erase the confirmed read or advance it',()=>{
 noteCadRead(now-1000);noteCadReadFailure('429');
 assert.equal(getConfirmedCadRead(),now-1000);assert.equal(getCadReadFailure(),'429');
 noteCadSourceHealth(source);noteCadSourceHealth({...source,poll_at:new Date(now-60000).toISOString()});assert.equal(getCadSourceSnapshot().poll_at,source.poll_at);
 const active=readFileSync('src/lib/activeDispatchCalls.js','utf8');
 assert.ok(active.includes('getActiveDispatchCallReadTime = getConfirmedCadRead'));
 assert.ok(active.includes('Array.isArray(lastGoodRows)'));
 const dash=readFileSync('src/lib/DashboardDataContext.jsx','utf8');
 assert.ok(dash.includes('if(confirmedReadAt)setLastRefresh'));assert.ok(!dash.includes('refreshCadIngestionIfStale(callsData)'));
 assert.ok(!readFileSync('src/components/dispatch/cad/CadStatusBar.jsx','utf8').includes('Awaiting sync'));
});
