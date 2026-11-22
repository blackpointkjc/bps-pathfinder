import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transform} from 'esbuild';
const user={id:'officer-test',role:'user',additional_roles:['officer']};
let queries=[],reads=0,failures=0;
const row={id:'old-match',call_id:'BPS-202601-00123',incident:'Example incident',location:'Armstrong',created_date:'2026-01-01T00:00:00Z'};
const calls={list:async()=>{throw Error('CAD search must not scan the full archive');},filter:async(query,_sort,_limit,offset)=>{queries.push(query);reads++;if(failures-->0){const e=Error('Rate limit exceeded. Retry after 1s.');e.status=429;throw e;}return offset?[]:[row];}};
const entities={DispatchCall:calls,CallHistory:calls,PortalAuthSession:{filter:async()=>[{user_id:user.id,started_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}]}};
globalThis.__callSearchSdk={auth:{me:async()=>user},entities,asServiceRole:{entities}};
globalThis.Deno={serve:handler=>globalThis.__callSearchHandler=handler};
const source=fs.readFileSync('base44/functions/searchCompanyRecords/entry.ts','utf8').replace(/^import .*from ['"]npm:@base44\/sdk['"];?$/m,'const createClientFromRequest=()=>globalThis.__callSearchSdk;');
const built=await transform(source,{loader:'ts',format:'esm'});
await import('data:text/javascript;base64,'+Buffer.from(built.code).toString('base64'));
const run=async(entity)=>{const response=await globalThis.__callSearchHandler(new Request('https://test.local',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({query:'Armstrong',entities:[entity]})}));assert.equal(response.status,200);return response.json();};
for(const entity of ['DispatchCall','CallHistory']){queries=[];reads=0;failures=0;const result=await run(entity);assert.equal(result.results[0].id,'old-match');assert.equal(result.partial,false);assert.equal(reads,1);assert(queries[0].$or.some(term=>term.location?.$regex));}
queries=[];reads=0;failures=2;
const recovered=await run('CallHistory');
assert.equal(recovered.results.length,1);assert.equal(recovered.partial,false);assert.deepEqual(recovered.failed_source_labels,[]);assert.equal(recovered.next_cursor,null);assert.equal(reads,3,'retry-exhausted page must be retained for another pass');
console.log('PASS live/archive call search: database candidate filter, old matches retained, throttled pages recovered without missing-source warning');
