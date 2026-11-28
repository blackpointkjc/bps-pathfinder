import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
const read=p=>readFileSync(p,'utf8');
const output=buildSync({entryPoints:['src/lib/incidentPriority.js'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports',output)(m,m.exports);
test('priority aliases and dispatcher overrides remain consistent across CAD workstations',()=>{
 const {incidentPriority,priorityCode}=m.exports;
 for(const [value,expected,code] of [['P1','critical','P1'],['P2','high','P2'],['P3','medium','P3'],['P4','low','P4']]){
  assert.equal(incidentPriority({priority:value,priority_override:true,incident:'Shooting'}),expected);
  assert.equal(priorityCode({priority:value,priority_override:true}),code);
 }
});
test('only P1 and P2 have flashing priority rules and both maps use canonical priorities',()=>{
 const css=read('src/components/dispatch/cad/priority-indicators.css');
 assert.match(css,/\[data-priority="critical"\][\s\S]*?animation:pf-cad-p1-flash/);
 assert.match(css,/\[data-priority="high"\][\s\S]*?animation:pf-cad-p2-flash/);
 assert.match(css,/\[data-priority="low"\][\s\S]*?animation:none/);
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.ok(read('src/main.jsx').includes('priority-indicators.css'));
 for(const file of ['src/pages/OfficerDispatchQueue.jsx','src/pages/DispatchCenter.jsx','src/components/map/ActiveCallMarkers.jsx','src/components/map/TomTomSdkMapPreview.jsx','src/components/map/MapCallPanel.jsx','src/components/dispatch/NewCallAlert.jsx'])assert.ok(read(file).includes('incidentPriority('),file);
 assert.ok(read('src/components/map/TomTomSdkMapPreview.jsx').includes('pathfinder-priority-ring'));
 assert.ok(read('src/utils/voiceAnnouncer.js').includes('new SpeechSynthesisUtterance(formatCadReferenceForSpeech(clean))'));
});
