import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness(clientSource = fs.readFileSync('src/api/base44Client.js', 'utf8'), timeoutSource = fs.readFileSync('src/lib/requestTimeout.js', 'utf8')) {
  let now = 1000000, id = 0;
  const timers = new Map(), storage = new Map(), starts = [];
  class Clock extends Date { static now() { return now; } }
  const set = (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id; };
  const clear = key => timers.delete(key);
  const raw = { entities: new Proxy({}, { get: (_, name) => ({ list: async () => { starts.push(name); return [{ id: name }]; } }) }), functions: { invoke: async name => { starts.push(name); return { data: { calls: [{ id:'call' }] } }; } }, auth: { me: async () => { starts.push('auth'); return { id:'user' }; } } };
  const context = { Date: Clock, Map, Set, console, Promise, setTimeout:set, clearTimeout:clear, window: { setTimeout:set, clearTimeout:clear, location:{pathname:'/'}, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, dispatchEvent:()=>{} }, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, CustomEvent: class {} };
  const timeoutExports = {};
  vm.runInNewContext(compile(timeoutSource), { ...context, exports:timeoutExports });
  const exports = {};
  vm.runInNewContext(compile(clientSource), { ...context, exports, require: name => name === '@base44/sdk' ? {createClient:()=>raw} : name.includes('requestTimeout') ? timeoutExports : {appParams:{appId:'app'}} });
  const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
  const advance = async ms => {
    const target = now + ms;
    while (true) {
      await flush();
      const next = [...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      now=next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now=target; await flush();
  };
  return { ...exports, ...timeoutExports, raw, storage, starts, advance, delay: ms => new Promise(resolve => set(resolve, ms)), now:()=>now };
}

const parallel = harness();
let resolveFirst;
parallel.raw.entities.First = {};
parallel.raw.functions.invoke = async name => {
 parallel.starts.push(name);
 if(name==='getSlowPage') return new Promise(resolve=>resolveFirst=resolve);
 return {data:{ok:true}};
};
const slow=parallel.base44.functions.invoke('getSlowPage',{});
const fast=parallel.base44.functions.invoke('getFastPage',{});
await parallel.advance(126);
assert.deepEqual(parallel.starts,['getSlowPage','getFastPage'],'second slot must serve page data while first request is pending');
await fast;
resolveFirst({data:{ok:true}}); await slow;
const dedupe=harness();
const a=dedupe.base44.functions.invoke('getClientBillingData',{client_id:'one'});
const b=dedupe.base44.functions.invoke('getClientBillingData',{client_id:'one'});
await dedupe.advance(126); await Promise.all([a,b]);
assert.equal(dedupe.starts.length,1);
const cooldown=harness();
let count=0;
cooldown.raw.functions.invoke=async()=>{count++;if(count===1)throw {response:{status:429,headers:{'retry-after':'45'}}};return {data:{ok:true}}};
await cooldown.base44.functions.invoke('getPage',{}).catch(()=>{});
const retry=cooldown.base44.functions.invoke('getPage',{});
await cooldown.advance(44000);assert.equal(count,1);
await cooldown.advance(1100);await retry;assert.equal(count,2);
console.log('PASS: concurrent page reads, request deduplication, and Retry-After protection');
