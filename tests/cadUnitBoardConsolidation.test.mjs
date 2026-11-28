import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('one unit workstation removes duplicate backlog and retains legacy links; direct command uses new workstation',()=>{
 const shell=readFileSync('src/pages/CADCenter.jsx','utf8');
 const board=readFileSync('src/pages/UnitStatus.jsx','utf8');
 const command=readFileSync('src/pages/CommandDashboard.jsx','utf8');
 assert.equal((shell.match(/id: 'units'/g)||[]).length,1);
 assert.ok(!shell.includes("id: 'resources'"));
 assert.ok(shell.includes("params.get(toolKey)==='resources'?'units'"));
 assert.ok(!board.includes('Pending assignments'));assert.ok(board.includes('Officer detail'));assert.ok(board.includes('initialUnitSearch'));
 assert.ok(command.includes('unified={true}'));assert.ok(command.includes('officerMode'));assert.ok(command.includes('showMap={false} canManage={false}'));
});
