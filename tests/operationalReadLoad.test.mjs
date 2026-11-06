import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
 const source=await readFile(path,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const {readRosterCalls}=await load('base44/functions/getOnDutyUnits/callLookup.ts');
let reads=0;
const ids=Array.from({length:32},(_,i)=>'call-'+i);
const lookup=await readRosterCalls({DispatchCall:{filter:async(q,sort,limit)=>{
 reads++;assert.deepEqual(q.id.$in,ids);assert.equal(limit,32);
 return ids.slice(0,31).map(id=>({id,status:'Dispatched'}));
}}},[...ids,ids[0],null,'']);
assert.equal(reads,1,'32 references must use one database read');
assert.equal(lookup.size,31);
assert.equal(lookup.get('call-31'),undefined,'missing call remains absent');
await readRosterCalls({DispatchCall:{filter:()=>assert.fail('empty lookup queried database')}},[]);
await assert.rejects(readRosterCalls({DispatchCall:{filter:async()=>{throw new Error('429');}}},['call']),/429/);

const {releaseClosedCall}=await load('base44/functions/ingestGractivecalls/releaseClosedCall.ts');
const source=await readFile('base44/functions/ingestGractivecalls/releaseClosedCall.ts','utf8');
for(const name of ['ingestPulsePoint','updateCadCallStatus','manageAutoDispatchOversight']){
 assert.equal(await readFile('base44/functions/'+name+'/releaseClosedCall.ts','utf8'),source);
}
for(const initialStatus of ['Enroute','Out of Service']){
 const data={User:[{id:'officer',email:'field@example.test',status:initialStatus}],
 ActiveOfficer:[{id:'session',officer_email:'field@example.test',current_call_id:'closed',status:initialStatus,session_active:true,latitude:37.5,last_update:'unchanged'}],
 Unit:[],CallAssignment:[],DispatchCall:[]};
 const entities=new Proxy({},{get:(_,name)=>({
  filter:async q=>{
   if(name==='User')assert(!('current_call_id'in q),'unsupported User field queried');
   return data[name].filter(row=>Object.entries(q).every(([key,value])=>value&&typeof value==='object'&&'$in'in value
    ?(Array.isArray(row[key])?row[key]:[row[key]]).some(v=>value.$in.includes(v)):row[key]===value));
  },
  get:async id=>data[name].find(row=>row.id===id),
  update:async(id,patch)=>Object.assign(data[name].find(row=>row.id===id),patch),
 })});
 const result=await releaseClosedCall(entities,{id:'closed',status:'Cleared',assigned_units:[]});
 assert.deepEqual(result.released_officer_ids,['officer'],'session-only legacy reference resolved');
 assert.equal(data.User[0].status,initialStatus==='Out of Service'?'Out of Service':'Available');
 assert.equal(data.ActiveOfficer[0].current_call_id,'');
 assert.equal(data.ActiveOfficer[0].session_active,true);
 assert.equal(data.ActiveOfficer[0].latitude,37.5);
 assert.equal(data.ActiveOfficer[0].last_update,'unchanged');
}
console.log('PASS: 32 call lookups use one query; missing/error behavior preserved; all closure paths resolve persisted pointers and preserve OOS/GPS/presence.');
