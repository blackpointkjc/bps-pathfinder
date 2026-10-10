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

const h=harness();
let count=0;
h.raw.functions.invoke=async()=>{count++;if(count===1)throw {response:{status:429,headers:{'retry-after':'45'}}};return {data:{ok:true}};};
const first=h.base44.functions.invoke('getActiveDispatchCalls',{});
await h.advance(44000);assert.equal(count,1);
await h.advance(3000);assert.equal((await first).data.ok,true);assert.equal(count,2);
const order=harness();
order.storage.set('bps:base44-rate-limit-until',String(order.now()+60000));
const background=order.base44.entities.Ordinary.list();
const cad=order.base44.functions.invoke('getActiveDispatchCalls',{});
await order.advance(26000);await cad;assert.deepEqual(order.starts,['getActiveDispatchCalls']);
await order.advance(35000);await background;assert.deepEqual(order.starts,['getActiveDispatchCalls','Ordinary']);
const pace=harness();const a=pace.base44.entities.First.list(),b=pace.base44.entities.Second.list();
await pace.advance(699);assert.equal(pace.starts.length,1);
await pace.advance(1);await Promise.all([a,b]);assert.equal(pace.starts.length,2);
console.log('PASS client recovery: Retry-After, automatic retry, critical CAD before background, paced starts');
