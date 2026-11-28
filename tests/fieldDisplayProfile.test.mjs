import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveFieldDisplay,readFieldDisplayInput} from '../src/lib/fieldDisplayProfile.js';
import {normalizeDisplayPreferences} from '../src/lib/displayPreferences.js';
const read=path=>readFileSync(path,'utf8');
test('CF-33 3:2 display resolves field fit at native, 150%, and 200% Windows scaling without needing an antenna',()=>{
 for(const [sw,sh,w,h] of [[2160,1440,2160,1290],[1440,960,1440,810],[1080,720,1080,580]]){
  const input={width:w,height:h,screenWidth:sw,screenHeight:sh,touch:true,windows:true};
  assert.equal(resolveFieldDisplay(input),'field');
  assert.equal(resolveFieldDisplay({...input,externalGps:true}),'field');
 }
});
test('external receiver provides a field-layout hint, but phones and ordinary large desktop displays remain distinct',()=>{
 const input={width:1280,height:700,screenWidth:1920,screenHeight:1080,windows:true,touch:false};
 assert.equal(resolveFieldDisplay(input),'compact');
 assert.equal(resolveFieldDisplay({...input,externalGps:true}),'field');
 assert.equal(resolveFieldDisplay({...input,width:1920,height:1000,externalGps:true}),'desktop');
 assert.equal(resolveFieldDisplay({...input,width:390,height:820,touch:true,externalGps:true}),'mobile');
 assert.equal(resolveFieldDisplay({...input,mode:'desktop',externalGps:true}),'desktop');
 assert.equal(resolveFieldDisplay({...input,mode:'field'}),'field');
 assert.equal(normalizeDisplayPreferences({layout:'field'}).layout,'field');
 assert.equal(normalizeDisplayPreferences({}).layout,'auto');
 assert.equal(readFieldDisplayInput({innerWidth:1080,innerHeight:580,screen:{width:1080,height:720},navigator:{platform:'Win32',maxTouchPoints:10}},true).externalGps,true);
});
test('screen fit is shared, keeps field navigation reachable, gives selected incidents a full panel, and allows short viewport scrolling',()=>{
 const css=read('src/field-screen-fit.css'),layout=read('src/Layout.jsx'),display=read('src/components/DisplayPreferences.jsx');
 assert.ok(read('src/main.jsx').includes('field-screen-fit.css'));
 assert.ok(layout.includes('externalGps={externalGps.connected===true'));
 assert.ok(display.includes('Screen layout'));
 assert.ok(display.includes('Toughbook / field'));
 assert.ok(display.includes("window.visualViewport?.addEventListener('resize',apply)"));
 assert.ok(css.includes('.pf-field-tools{display:flex!important}'));
 const board=read('src/components/dispatch/cad/unified-cad-grid.css');
 assert.ok(board.includes('grid-template-areas:"pending active"'));
 assert.ok(board.includes('[data-view=incident],[data-view=comments]'));
 assert.ok(css.includes('data-mobile-view=detail]>.pf-dispatch-detail'));
 assert.ok(css.includes('@media(max-height:650px)'));
 assert.ok(css.includes('overflow-y:auto!important'));
 assert.ok(!css.includes('zoom:'));
});
