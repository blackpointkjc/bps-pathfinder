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

const h=harness();let finishSlow;
h.raw.functions.invoke=async name=>{h.starts.push(name);if(name==='getWelcomeBriefingData')return new Promise(r=>finishSlow=r);return {data:{calls:[]}};};
const slow=h.base44.functions.invoke('getWelcomeBriefingData',{});
await h.advance(1);
const background=h.base44.entities.Ordinary.list();await h.advance(1000);
assert.equal(h.starts.length,1,'second background cannot consume reserved slot');
const cad=h.base44.functions.invoke('getActiveDispatchCalls',{});
await h.advance(1);await cad;assert.ok(h.starts.includes('getActiveDispatchCalls'),'CAD starts while briefing is unresolved');
finishSlow({data:{}});await h.advance(1000);await Promise.all([slow,background]);
console.log('PASS scheduling: stalled briefing leaves immediate capacity for active calls');
