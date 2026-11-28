import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
const source=await readFile('src/lib/externalGpsService.js','utf8');
test('approved GPS hotplug and stream EOF recover without page reload or a new permission chooser',async()=>{
 const events=new Map(),documentEvents=new Map(),windowEvents=new Map();
 const storage=new Map([['bps:external-gps-selector',JSON.stringify({usbVendorId:1,usbProductId:2})],['bps:external-gps-locked','1'],['bps:external-gps-baud','9600'],['bps:external-gps-source-preference','external']]);
 let ports=[],opens=0,controller,choosers=0;
 const port={getInfo:()=>({usbVendorId:1,usbProductId:2}),readable:null,writable:null,async open(options){assert.equal(options.baudRate,9600);opens++;this.readable=new ReadableStream({start(c){controller=c;}});},async close(){this.readable=null;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serial:{getPorts:async()=>ports,requestPort:async()=>{choosers++;throw Error('permission prompt not expected');},addEventListener:(type,fn)=>events.set(type,fn)}}});
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.document={visibilityState:'visible',addEventListener:(type,fn)=>documentEvents.set(type,fn)};
 globalThis.window={setTimeout,clearTimeout,addEventListener:(type,fn)=>windowEvents.set(type,fn)};
 globalThis.BroadcastChannel=undefined;
 globalThis.Worker=undefined;
 globalThis.__gpsTestFixes=[];
 const code=source.replace("import { publishLiveLocation } from '@/lib/liveLocationService';","const publishLiveLocation=fix=>globalThis.__gpsTestFixes.push(fix);");
 const gps=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const waitFor=async fn=>{const deadline=Date.now()+3500;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,25));}assert.fail('receiver did not recover');};
 try{
  await gps.startExternalGpsAutoReconnect();assert.equal(gps.getExternalGpsStatus().connected,false);
  ports=[port];events.get('connect')({port});
  await waitFor(()=>gps.getExternalGpsStatus().connected);assert.equal(opens,1);
  controller.enqueue(new TextEncoder().encode('$GPGGA,123519,3728.000,N,07725.000,W,1,08,0.9,0,M,0,M,,\r\n'));
  await waitFor(()=>globalThis.__gpsTestFixes.length===1);
  controller.close();await waitFor(()=>opens===2&&gps.getExternalGpsStatus().connected);
  assert.equal(choosers,0);
  await gps.disconnectExternalGps();events.get('connect')({port});await new Promise(r=>setTimeout(r,200));
  assert.equal(opens,2,'manual device preference suppresses reconnect');
 }finally{await gps.disconnectExternalGps();}
});
