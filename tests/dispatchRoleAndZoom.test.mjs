import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canAccessDispatchCenter,canEditIncidentPriority} from '../src/lib/dispatchPermissions.js';
import {stepCadScale,cadScaleValue,CAD_SCALES,writeCadDisplaySettings,readCadDisplaySettings} from '../src/lib/cadDisplaySettings.js';
test('dispatch workstation requires an explicitly assigned dispatch role, not generic CAD or rank access',()=>{
 for(const user of [{role:'dispatch'},{role:'dispatcher'},{role:'user',dispatch_role:true},{role:'admin',additional_roles:['dispatch']},{additional_roles:['officer','dispatcher']}])assert.equal(canAccessDispatchCenter(user),true);
 for(const user of [null,{role:'admin'},{role:'admin',additional_roles:['full_access']},{rank:'Colonel',is_supervisor:true},{additional_roles:['officer','cad_access']},{additional_roles:['supervisor']},{dispatch_role:'false'},{role:'dispatch',disabled:true},{role:'dispatch',portal_approved:false},{role:'dispatch',termination_date:'2020-01-01'},{role:'dispatch',account_status:'suspended'},{role:'dispatch',additional_roles:['student']},{role:'dispatch',user_type:'client'}])assert.equal(canAccessDispatchCenter(user),false,JSON.stringify(user));
 assert.equal(canEditIncidentPriority({role:'dispatch'}),true);
});
test('page guard and every nested navigation entry use the dispatch authorization policy',()=>{
 const layout=readFileSync('src/Layout.jsx','utf8'),shell=readFileSync('src/pages/CADCenter.jsx','utf8'),page=readFileSync('src/pages/DispatchCenter.jsx','utf8');
 assert.ok(layout.includes("if (pageName === 'DispatchCenter') return canAccessDispatchCenter(user)"));
 assert.ok(shell.includes("items.filter(item=>(item.id!=='dispatch'||dispatchAllowed)"));
 assert.ok(shell.includes('Object.entries(permittedTools).flatMap'));
 assert.ok(shell.includes('Object.entries(permittedTools).map'));
 assert.ok(shell.includes("if(tool==='dispatch'&&!dispatchAllowed)return"));
 assert.ok(page.indexOf('if(!canAccessDispatchCenter(user))')<page.indexOf('return <DispatchWorkspace'));
 assert.ok(page.includes('if (!canAccessDispatchCenter(user))'));
});
test('zoom controls step up/down through 200%, reset and persist',()=>{
 let id='standard';for(let i=0;i<10;i++)id=stepCadScale(id,1);
 assert.equal(cadScaleValue(id),2);assert.equal(stepCadScale(id,1),id);
 for(let i=0;i<10;i++)id=stepCadScale(id,-1);
 assert.equal(cadScaleValue(id),.9);assert.equal(stepCadScale(id,-1),id);
 const mem=new Map();globalThis.window={localStorage:{getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v)}};
 try{writeCadDisplaySettings({scale:'200',monitor:false,showMap:true});assert.equal(readCadDisplaySettings().scale,'200');assert.equal(cadScaleValue(readCadDisplaySettings().scale),2);}finally{delete globalThis.window;}
 assert.ok(CAD_SCALES.every((s,i)=>i===0||s.value>CAD_SCALES[i-1].value));
});
test('dispatch redesign keeps real response actions, timeline and assignment controls',()=>{
 const page=readFileSync('src/pages/DispatchCenter.jsx','utf8');
 for(const token of ['Waiting for assignment','Other live / responding incidents','UnitAssignmentPanel','requestWelfareForSelectedCall','requestSupervisorForSelectedCall','addCallNote','CadVoiceBroadcastButton','PropertyCallLinkControl','DispatcherShiftReports','MessagingPanel','CreateCallDialog'])assert.ok(page.includes(token),token);
 const css=readFileSync('src/components/dispatch/cad/dispatch-readable.css','utf8');
 assert.ok(css.includes('@container(max-width:900px)'));
 assert.ok(css.includes('grid-template-columns:minmax(220px,29%) minmax(0,1fr) minmax(220px,28%)'));
});

test('monitor preference controls actual rendering on command, not an excluded route',()=>{
 const shell=readFileSync('src/pages/CADCenter.jsx','utf8');
 const command=readFileSync('src/pages/CommandDashboard.jsx','utf8');
 assert.ok(shell.includes('const monitorOpen=display.monitor'));
 assert.ok(shell.includes('monitor:!previous.monitor'));
 assert.ok(shell.includes('{monitorOpen && <CadIncidentMonitor'));
 assert.ok(!shell.includes("monitorOpen && active.id!=='command'"));
 assert.ok(command.includes('!embedded&&monitor&&<CadIncidentMonitor'));
 assert.ok(!command.includes("invoke('updateCadCallStatus'"));
 assert.ok(!command.includes('CreateCallDialog'));
});
test('dispatch idle monitor expands both queues; field intake, cloning and recommendations are in dispatch',()=>{
 const page=readFileSync('src/pages/DispatchCenter.jsx','utf8');
 const css=readFileSync('src/components/dispatch/cad/dispatch-readable.css','utf8');
 assert.ok(page.includes('data-selected={!!selectedCall||showCreateDialog}'));
 assert.ok(page.includes('CreateCallDialog inline source={intakeSource}'));
 assert.ok(page.includes('CadCloneIncidentDialog open={cloneOpen}'));
 assert.ok(page.includes('CadRecommendationList key={selectedCall.id}'));
 assert.ok(css.includes('.dispatch-v4-grid[data-selected=false] .dispatch-v4-queue-lanes'));
});
