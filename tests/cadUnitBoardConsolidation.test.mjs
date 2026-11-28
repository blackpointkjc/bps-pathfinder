import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('one unit workstation removes duplicate backlog and retains legacy links; direct command uses new workstation',()=>{
 const shell=readFileSync('src/pages/CADCenter.jsx','utf8');
 const board=readFileSync('src/pages/UnitStatus.jsx','utf8');
 const command=readFileSync('src/pages/CommandDashboard.jsx','utf8');
 assert.equal((shell.match(/id: 'units'/g)||[]).length,1);
 assert.ok(!shell.includes("id: 'resources'"));
 assert.ok(shell.includes("['resources','statusboard','units'].includes(rawTool)"));
 assert.ok(!shell.includes('const UnitStatus=lazy'));assert.ok(!shell.includes("id: 'statusboard'"));assert.ok(shell.includes("active.id === 'units' ? <CadResourceBoard"));
 assert.ok(!board.includes('Pending assignments'));assert.ok(board.includes('Officer detail'));assert.ok(board.includes('initialUnitSearch'));
 assert.ok(command.includes('unified={true}'));assert.ok(command.includes('officerMode'));assert.ok(command.includes('showMap={false} canManage={false}'));
});

test('CAD removes the redundant sync row and uses a single resource board with working property refresh',()=>{
 const shell=readFileSync('src/pages/CADCenter.jsx','utf8');
 const status=readFileSync('src/components/dispatch/cad/CadStatusBar.jsx','utf8');
 assert.ok(!status.includes('GracFeedIndicator'));
 assert.ok(!status.includes('CAD queue synced'));
 assert.ok(!status.includes('Oldest '));
 assert.ok(shell.includes("!['command','units'].includes(active.id)&&<CadStatusBar"));
 const board=readFileSync('src/components/dispatch/cad/CadResourceBoard.jsx','utf8');
 assert.ok(!board.includes('Full board'));assert.ok(board.includes('selectedCalls.map'));assert.ok(board.includes('onClick={onRefresh}'));
 const hook=readFileSync('src/hooks/useRecentPropertyIncidents.js','utf8');
 assert.ok(hook.includes('...(force?{refresh:true}:{})'));
 assert.ok(hook.includes('query.refetch({cancelRefetch:false})'));
 const grid=readFileSync('src/components/dispatch/cad/UnifiedCadGrid.jsx','utf8');
 assert.ok(grid.includes('disabled={propertyRefreshing}'));assert.ok(grid.includes('Refreshing…'));
});
