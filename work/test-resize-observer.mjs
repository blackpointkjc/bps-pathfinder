import assert from 'node:assert/strict';
import {observeElementSize} from '../src/lib/observeElementSize.js';
let next=0, observer, writes=0, width=500,height=300;
const frames=new Map();
globalThis.requestAnimationFrame=callback=>{frames.set(++next,callback);return next;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
globalThis.ResizeObserver=class {
 constructor(callback){this.callback=callback;observer=this;}
 observe(){}
 disconnect(){this.disconnected=true;}
};
const element={isConnected:true,getBoundingClientRect:()=>({width,height})};
const flush=()=>{const work=[...frames.values()];frames.clear();work.forEach(callback=>callback());};
const size=observeElementSize(element,()=>{writes++;observer.callback();});
assert.equal(writes,0,'no layout write during observer delivery');
assert.equal(frames.size,1);
observer.callback();observer.callback();assert.equal(frames.size,1,'coalesce notifications');
flush();assert.equal(writes,1);
flush();assert.equal(writes,1,'observer feedback with same dimensions must settle');
assert.equal(frames.size,0);
width=600;observer.callback();flush();assert.equal(writes,2,'real resize still updates');
height=400;observer.callback();size.disconnect();flush();assert.equal(writes,2,'unmount cancels pending updates');
assert.equal(observer.disconnected,true);
const detached=observeElementSize({...element,isConnected:false},()=>writes++);flush();assert.equal(writes,2);detached.disconnect();
delete globalThis.ResizeObserver;
const fallback=observeElementSize(element,()=>writes++);flush();assert.equal(writes,3);fallback.disconnect();
console.log('PASS: no synchronous resize writes, frame coalescing, feedback settles, real resizing works, detached/unmounted cleanup, unsupported-browser fallback');
