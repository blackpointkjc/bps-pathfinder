import fs from 'node:fs';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
const source=fs.readFileSync('src/components/PublishedUpdateNotice.jsx','utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
const code=transformSync(source,{loader:'jsx',define:{'import.meta.env.PROD':'true','import.meta.env.VITE_PATHFINDER_BUILD_ID':'"running-build"'}}).code;
let cleanup,check,available=false,body={app:'pathfinder',buildId:'running-build'},json=true,fail=false;
const events=new Map();
const target={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
let index=0;
new Function('useEffect','useState','window','document','navigator','fetch','setTimeout','clearTimeout','setInterval','clearInterval',code+';PublishedUpdateNotice();')(
fn=>{cleanup=fn();},
()=>{const i=index++;return[false,value=>{if(i===0)available=value;}]},
target,{...target,visibilityState:'visible'},{onLine:true},
async()=>{if(fail)throw Error('offline');return{ok:true,headers:{get:()=>json?'application/json':'text/html'},json:async()=>body};},
()=>1,()=>{},fn=>{check=fn;return 2;},()=>{});
await check();assert.equal(available,false,'same build has no notice');
body={app:'pathfinder',buildId:'new-release'};await check();assert.equal(available,true,'new release prompts refresh');
body={app:'pathfinder',buildId:'running-build'};await check();assert.equal(available,false,'rollback to loaded version clears notice');
json=false;await check();assert.equal(available,false,'login HTML is not an update');
json=true;fail=true;await check();assert.equal(available,false,'network errors are not updates');
assert(events.has('focus'));assert(events.has('online'));assert(events.has('visibilitychange'));cleanup();assert.equal(events.size,0);
const config=fs.readFileSync('vite.config.js','utf8').replace(/^import .*\n/gm,'').replace('export default defineConfig','return defineConfig');
const value=new Function('defineConfig','base44','react','randomUUID',config)(x=>x,()=>({}),()=>({}),()=> 'test-release');
let emitted;value.plugins.find(p=>p.name==='pathfinder-published-version').generateBundle.call({emitFile:file=>emitted=file});
assert.equal(JSON.parse(emitted.source).buildId,JSON.parse(value.define['import.meta.env.VITE_PATHFINDER_BUILD_ID']));
assert.equal(emitted.fileName,'pathfinder-version.json');
console.log('PASS: matching build marker; new-release notice; no false notice for same build, offline, or login HTML; foreground checks and cleanup.');
