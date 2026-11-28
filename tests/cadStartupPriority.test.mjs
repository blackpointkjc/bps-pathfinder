import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('CAD shell opens the command board without loading other workstations',()=>{
 const shell=read('src/pages/CADCenter.jsx');
 for(const name of ['Navigation','UnitStatus','BOLOAlerts','CallHistory','OfficerDispatchQueue','CadCommandPalette','CadResponseAnalytics','CadResourceBoard']){
  assert.ok(shell.includes('const '+name+'=lazy(()=>import('),name);
  assert.ok(!shell.includes('import '+name+' from '),name);
 }
 assert.ok(shell.includes("import CommandDashboard from './CommandDashboard'"));
 assert.ok(shell.includes('<Suspense fallback={<CadToolLoading label={active.label}/>}>'));
 assert.ok(shell.includes('{paletteOpen&&<Suspense'));
 assert.ok(read('src/components/dispatch/cad/UnifiedCadGrid.jsx').includes('const TacticalCommandMap=lazy'));
 assert.ok(read('src/components/dispatch/LiveCommandWorkspace.jsx').includes('const TacticalCommandMap=lazy'));
});
test('startup warms one authorized route and live feed precedes property history',()=>{
 const prep=read('src/lib/lazyPages.js').split('export function prepareWorkspace')[1];
 assert.ok(prep.includes('route&&canAccessPage(user,route)'));
 assert.ok(prep.includes('prepareToolLoaders(load?[load]:[]'));
 assert.ok(prep.includes('concurrency:1'));
 assert.ok(!prep.includes('getAppDirectory'));
 assert.ok(read('src/pages/CommandDashboard.jsx').includes('useRecentPropertyIncidents(authenticatedUser?.id,!loading)'));
 assert.ok(read('src/hooks/useRecentPropertyIncidents.js').includes('enabled:!!userId&&enabled'));
 assert.ok(read('src/pages/CADCenter.jsx').includes('<DashboardDataProvider loadRoster={false}>'));
 const roster=read('src/hooks/useCadRoster.js');
 assert.ok(roster.indexOf('await statusRequest;')<roster.indexOf('await getAppDirectory(force)'));
});
