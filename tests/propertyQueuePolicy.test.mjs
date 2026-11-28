import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {needsPropertyAssignment,splitCadIncidents,isOperationalPropertyAlert} from '../src/lib/cadWorkspaceModel.js';
import {canAccessCadAdminPages} from '../src/lib/dispatchPermissions.js';
import {propertyAlertWasTimely,propertyAlertUpstreamDelayMs} from '../src/lib/propertyAlertFreshness.js';
test('only verified active property alerts without BPS assignment are waiting; other agency and personal queue are distinct',()=>{
 const property={id:'p',status:'On Scene',assigned_units:[]},external={id:'e',status:'Dispatched',assigned_units:[]},assigned={id:'a',status:'On Scene',assigned_units:['officer']},mine={id:'m',status:'New',assigned_units:['me']};
 const ids=new Set(['p','a','m']);
 assert.ok(needsPropertyAssignment(property,ids));assert.ok(!needsPropertyAssignment(external,ids));assert.ok(!needsPropertyAssignment(assigned,ids));assert.ok(!needsPropertyAssignment(property,ids,new Set(['p'])));
 const result=splitCadIncidents([property,external,assigned,mine],false,ids,['me']);
 assert.deepEqual(result.pending.map(x=>x.id),['p']);assert.deepEqual(result.active.map(x=>x.id),['e','a']);
 assert.ok(!isOperationalPropertyAlert({callId:'p',propertyId:'site',lifecycle_status:'resolved'}));assert.ok(!isOperationalPropertyAlert({callId:'p',propertyId:'public-helpme'}));
});
test('Armstrong late-publication alert passes active-notification gate; closed alerts cannot replay',()=>{
 const row={callTime:'2026-11-28T01:22:00.000Z',created_date:'2026-11-28T01:38:43.829000',callStatus:'On Scene',lifecycle_status:'active'};
 assert.ok(propertyAlertUpstreamDelayMs(row)>15*60000);assert.ok(propertyAlertWasTimely(row));
 assert.ok(!propertyAlertWasTimely({...row,callStatus:'Cleared'}));assert.ok(!propertyAlertWasTimely({...row,lifecycle_status:'resolved'}));
});
test('history and analytics are admin-only; dispatcher and supervisory roles alone are insufficient',()=>{
 assert.ok(canAccessCadAdminPages({role:'admin'}));for(const user of [{role:'dispatch'},{additional_roles:['supervisor']},{role:'admin',disabled:true},{role:'admin',additional_roles:['client']}])assert.ok(!canAccessCadAdminPages(user));
 const shell=readFileSync('src/pages/CADCenter.jsx','utf8');assert.ok(shell.includes("if(['history','response'].includes(tool)&&!adminAllowed)return"));assert.ok(shell.includes('selectedIds={monitoredIds} onTogglePin={togglePin}'));
});
