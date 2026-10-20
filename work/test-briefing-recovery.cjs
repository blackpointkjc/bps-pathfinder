const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
let now=100000,waits=[];
class FakeDate extends Date {static now(){return now;}}
const module_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('base44/functions/getWelcomeBriefingData/sourceRead.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module_,Date:FakeDate,Map,setTimeout:(fn,ms)=>{waits.push(ms);now+=ms;fn();}});
const {readBriefingSource}=module_;
(async()=>{
 let tries=0;
 const value=await readBriefingSource('alerts',async()=>{if(++tries===1)throw {status:429,response:{headers:{'retry-after':'3'}}};return ['alert'];});
 assert.equal(tries,2);assert.equal(value[0],'alert');assert(waits.includes(3000));
 let companyCalls=0;await readBriefingSource('users',async()=>{companyCalls++;return ['officer'];});assert.equal(companyCalls,1,'a throttled alerts call must not fabricate a company-users failure');
 await readBriefingSource('users',async()=>{throw Error('cache should prevent call');});
 let coalesced=0;await Promise.all([readBriefingSource('units',async()=>{coalesced++;return ['unit'];}),readBriefingSource('units',async()=>{coalesced++;return ['unit'];})]);assert.equal(coalesced,1);
 now+=91000;const stale=await readBriefingSource('users',async()=>{throw {status:429};});assert.equal(stale[0],'officer','verified stale data remains available');
 let retrySourceCalls=0;await readBriefingSource('new-source',async()=>{retrySourceCalls++;return ['new'];});assert.equal(retrySourceCalls,1);
 await assert.rejects(()=>readBriefingSource('long',async()=>{throw {status:429,response:{headers:{'retry-after':'30'}}};},now+1000));
 assert.equal(module_.briefingRetryAt()>now,true);
 console.log('PASS: actual briefing source throttle recovery, unrelated sources read, cache reuse/coalescing, stale snapshot retention and bounded server-retry windows.');
})().catch(error=>{console.error(error);process.exit(1);});
