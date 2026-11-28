import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isIaRead,iaReadCacheMs} from '../src/lib/iaRequestPolicy.js';
const read=p=>readFileSync(p,'utf8');
test('IA read classification never treats a mutation as a scheduled read',()=>{
 for(const action of ['list','reports','get','officer_directory','training_options','client_referrals','notifications','audit_history','officer_file','evidence_storage_status'])assert.equal(isIaRead({action}),true,action);
 for(const action of ['create_case','update','close_case','finding','publish_public_release','retry_notification','upload','suspend_officer','assign_training','export'])assert.equal(isIaRead({action}),false,action);
 for(const method of ['list','filter','get'])assert.ok(isIaRead({action:'legacy_entity',method}));
 for(const method of ['create','update','delete'])assert.ok(!isIaRead({action:'legacy_entity',method}));
 assert.equal(iaReadCacheMs('officer_file'),0);
 assert.equal(iaReadCacheMs('audit_history'),0);
});
test('CAD roster merge preserves canonical identity and exclusions',async()=>{
 const source=read('src/hooks/useCadRoster.js');
 const pure=source.slice(source.indexOf('const emailOf='),source.indexOf('function useLocalCadRoster'));
 const {isOperationalOfficer}=await import('../src/lib/directoryUtils.js');
 const merge=new Function('isOperationalOfficer',pure.replace('export function','function')+';return mergeCadRoster;')(isOperationalOfficer);
 const directory=[{id:'canonical',email:'OFFICER@example.test',additional_roles:['officer'],rank:'Captain',status:'Available'},{id:'disabled',email:'disabled@example.test',additional_roles:['officer'],disabled:true}];
 const live=[{id:'session',officer_email:'officer@example.test',additional_roles:['officer'],status:'Enroute',session_active:true},{id:'disabled',email:'disabled@example.test',additional_roles:['officer'],status:'Available'}];
 const result=merge(directory,live);assert.equal(result.length,1);assert.equal(result[0].id,'canonical');assert.equal(result[0].status,'Enroute');assert.equal(result[0].rank,'Captain');
 assert.equal(merge(directory,[]).length,1);
});
test('CAD shell reuses one roster and one call provider; officer status does not start a second feed',()=>{
 assert.ok(read('src/pages/CADCenter.jsx').includes('<CadRosterProvider><CadShell'));
 assert.ok(read('src/pages/UnitStatus.jsx').includes('existing?<UnitStatusPage {...props}/>'));
 assert.ok(read('src/pages/UnitStatus.jsx').includes('refresh(true)'));
 const hub=read('src/lib/officerLocationHub.js');assert.ok(hub.includes('locationListeners'));
 const endpoint=read('base44/functions/getOnDutyUnits/entry.ts');assert.ok(endpoint.includes('markExpiredSessions'));assert.ok(!endpoint.includes('retireExpiredSessions'));
});
