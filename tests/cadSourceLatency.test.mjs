import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('base44/functions/ingestGractivecalls/entry.ts','utf8');
const mergeSource = source.slice(source.indexOf('function liveMergeKey('), source.indexOf('async function fastGeocodeWebsiteCall('));
const js = ts.transpileModule(mergeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const context = {Date,Map,Set,Math,Number,String,cleanMatchText:value=>String(value||'').trim().toUpperCase()};
vm.createContext(context);vm.runInContext(js,context);
const merge = context.mergeLiveWebsiteAndApi;
const now=Date.now(), iso=minutes=>new Date(now-minutes*60000).toISOString();
const row=(id,minutes,incident='Service Call')=>({external_call_id:id,agency:'RFD',incident,location:id==='fire'?'1300 COALTER ST':'10 MAIN ST',time_received:iso(minutes),status:'Dispatched'});
const web=row('web',8), fire=row('fire',6,'# STRUCTURE FIRE , BUILDING FIRE');
let merged=merge([web],[fire]);
assert(merged.some(call=>call.external_call_id==='fire')); // Regression: stale website used to discard it.
assert(!merge([web],[row('stale',12)]).some(call=>call.external_call_id==='stale'));
assert(merge([row('newer-web',1)],[fire],208).some(call=>call.external_call_id==='fire')); // Cached HTML is not authoritative.
assert(!merge([web],[row('ancient',90)],208).some(call=>call.external_call_id==='ancient'));
assert(!merge([web],[{...fire,status:'Cleared'}],208).some(call=>call.external_call_id==='fire'));
assert(!merge([web],[row('future',-10)],208).some(call=>call.external_call_id==='future'));
merged=merge([fire],[{...fire,latitude:37.5,longitude:-77.4}]);
assert.equal(merged.length,1);
assert.equal(merged[0].latitude,37.5);
assert.equal(merged[0].source_channel,'grac_website_live+api');
assert.equal(merge([], [fire]).length,1);

// Real source-fetch helper, with injected network failures: one bounded retry.
const fetchSource=ts.transpileModule(await readFile('base44/functions/ingestGractivecalls/sourceFetch.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {fetchCadSource}=await import('data:text/javascript;base64,'+Buffer.from(fetchSource).toString('base64'));
const originalFetch=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url,options)=>{
 calls.push({url,options});
 if(calls.length===1)throw new DOMException('timed out','TimeoutError');
 return new Response('[]',{headers:{Age:'208'}});
};
let response=await fetchCadSource('fresh-url','canonical-url','application/json');
assert.equal(calls.length,2);
assert.equal(calls[1].url,'canonical-url');
assert.equal(response.cacheAgeSeconds,208);
assert(calls.every(call=>call.options.cache==='no-store'));
calls.length=0;
globalThis.fetch=async()=>{calls.push(1);return new Response('',{status:503});};
await assert.rejects(fetchCadSource('primary','fallback','text/html'));
assert.equal(calls.length,2);
calls.length=0;
globalThis.fetch=async()=>{calls.push(1);return new Response('',{status:403});};
await assert.rejects(fetchCadSource('primary','fallback','text/html'));
assert.equal(calls.length,1);
globalThis.fetch=originalFetch;
if(process.argv.includes('--live')){
 const began=Date.now();
 response=await fetchCadSource('https://gractivecalls.com/api/active','https://gractivecalls.com/api/active','application/json');
 const rows=JSON.parse(response.text);
 assert(Array.isArray(rows)&&rows.length>0);
 console.log('LIVE SOURCE OK:',rows.length,'calls;',Date.now()-began,'ms;', 'cache age',response.cacheAgeSeconds);
}
console.log('PASS: newer API calls bypass stale HTML, cached-page fallback, duplicate merge, stale/closed/future exclusions, timeout retry, failed-source bounds.');
