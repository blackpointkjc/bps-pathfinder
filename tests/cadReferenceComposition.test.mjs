import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
// Render the real workspace component. Isolate provider-bound children so
// this test never opens a Base44 preview, makes requests or starts a map SDK.
const bundle=await build({entryPoints:['src/components/dispatch/cad/UnifiedCadGrid.jsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','react-dom'],loader:{'.css':'empty'},plugins:[{name:'isolate-operational-panels',setup(b){
 b.onResolve({filter:/^(\.\.\/TacticalCommandMap|\.\.\/CommandIncidentDetails|\.\/CadIncidentComments)$/},args=>({path:args.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:'export default function Panel(){return null;}',loader:'js'}));
 b.onResolve({filter:/^@\//},args=>({path:require.resolve('../src/'+args.path.slice(2)+'.js')}));
 }}]});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
const Workspace=mod.exports.default;
const pending={id:'pending',status:'New',incident:'Alarm',location:'100 Test St',assigned_units:[]};
const active={id:'active',status:'Dispatched',incident:'Assist',location:'200 Test St',assigned_units:['u1']};
const props={calls:[pending,active],allCalls:[pending,active],units:[{id:'u1',unit_number:'100',status:'Available',session_active:true}],priorityOf:()=> 'medium',priorities:{medium:{label:'P3 · Standard'}},identifierOf:c=>({value:c.id}),incidentOf:c=>c.incident,elapsedOf:()=> '1m',callDistrict:()=> 'Test district',showMap:true,canManage:true,query:'',agency:'all'};
const render=extra=>renderToStaticMarkup(React.createElement(Workspace,{...props,...extra}));
test('monitor view has real pending/active queues and units without a vacant incident editor',()=>{
 const html=render({});
 assert.match(html,/data-selected="false"/);
 assert.match(html,/Pending incidents \(1\)/);assert.match(html,/Active incidents \(1\)/);
 assert.match(html,/cc-radio-row/);assert.match(html,/100 Test St/);
 assert.ok(!html.includes('aria-label="Selected incident"'));
 assert.match(html,/aria-label="Live map"/);
});
test('selected call opens a tabbed center editor with comments beside it and preserves both queues',()=>{
 const html=render({detail:active});
 assert.match(html,/data-selected="true"/);assert.match(html,/aria-label="Open incidents"/);
 assert.match(html,/role="tab" aria-selected="true">active/);
 assert.match(html,/cc-editor-comments/);assert.match(html,/Pending incidents \(1\)/);assert.match(html,/Active incidents \(1\)/);
});
test('draft is rendered inline rather than obscuring the live queues; layout contains monitor and selected compositions',()=>{
 const html=render({draftOpen:true,draft:React.createElement('div',null,'Test unsaved draft')});
 assert.match(html,/data-draft="true"/);assert.match(html,/Test unsaved draft/);assert.match(html,/Pending incidents \(1\)/);assert.match(html,/Active incidents \(1\)/);
 const css=readFileSync('src/components/dispatch/cad/unified-cad-grid.css','utf8');
 assert.ok(css.includes('grid-template-areas:"units pending active map"'));
 assert.ok(css.includes('grid-template-areas:"units pending incident active map"'));
 const intake=readFileSync('src/components/dispatch/CreateCallDialog.jsx','utf8');
 assert.ok(intake.includes('if(inline)'));assert.ok(intake.includes("invoke('createDispatchCall'"));
});
