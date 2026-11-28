import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cadReadAction,isCriticalCadRead,isCadWorkspace,retryDeadline,cadConnectionProblem} from '../src/lib/cadRequestPolicy.js';
test('CAD history and timeline reads use the queue rather than fake mutations',()=>{
 assert.equal(cadReadAction('getCallHistoryFeed','recent_property_incidents'),true);
 assert.equal(cadReadAction('getCallHistoryFeed','call_details'),true);
 assert.equal(cadReadAction('sharedCadTimeline','read'),true);
 assert.equal(cadReadAction('sharedCadTimeline','post'),false);
 assert.equal(cadReadAction('getCallHistoryFeed','delete'),false);
 assert.equal(isCriticalCadRead({kind:'function',name:'getMyDispatchQueue',action:''}),true);
 assert.equal(isCriticalCadRead({kind:'function',name:'getCallHistoryFeed',action:'recent_property_incidents'}),false);
 assert.equal(isCadWorkspace('CADCenter'),true);
 const sdk=readFileSync('src/api/base44Client.js','utf8');
 assert.ok(sdk.includes('if(cadReadAction(functionName,action))return true'));
 assert.ok(sdk.includes('sharedCriticalRetryAt()-Date.now()'));
});
test('provider Retry-After is honored without artificial minute-long CAD holds',()=>{
 const now=Date.now();
 assert.equal(retryDeadline(now,'2',''),now+2000);
 assert.equal(retryDeadline(now,null,'Rate limit; retry after 3s'),now+3000);
 assert.equal(retryDeadline(now,null,'rate limit'),now+8000);
 assert.equal(retryDeadline(now,'60',''),now+60000);
});
test('CAD banner distinguishes unrelated throttling from an unconfirmed or stale live read',()=>{
 const now=Date.now(),base={now,confirmedAt:now-1000,failure:'',criticalQueued:0,criticalWait:0,criticalRetryAt:now+60000};
 assert.equal(cadConnectionProblem(base),false);
 assert.equal(cadConnectionProblem({...base,confirmedAt:0,criticalQueued:1}),true);
 assert.equal(cadConnectionProblem({...base,confirmedAt:now-40000,failure:'429'}),true);
 assert.equal(cadConnectionProblem({...base,officerError:true}),true);
});
