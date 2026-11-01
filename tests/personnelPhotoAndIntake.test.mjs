import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
const load=(path,name)=>new Function(transformSync(fs.readFileSync(path,'utf8').replaceAll('export ',''),{loader:'ts'}).code+';return '+name+';')();
const sync=load('base44/functions/updateUser/synchronizeOfficerIdentity.ts','synchronizeOfficerIdentity');
const rows={OfficerRoster:[{id:'roster',rank:'Officer',unit_number:'1'}],ActiveOfficer:[{id:'active',profile_photo_url:'old'}],Unit:[{id:'unit'}],OfficerChatMessage:[{id:'chat',sender_photo_url:'old'}],SupervisorChatMessage:[{id:'supervisor-chat',sender_photo_url:'old'}]};
const entities=new Proxy({}, {get:(_,name)=>({filter:async()=>rows[name]||[],update:async(id,patch)=>Object.assign(rows[name].find(r=>r.id===id),patch)})});
const user={id:'person',email:'person@example.invalid',rank:'Officer',unit_number:'1',profile_photo_url:'new'};
assert.deepEqual(await sync(entities,user,{profile_photo_url:'old'}),[]);
assert.equal(rows.ActiveOfficer[0].profile_photo_url,'new');assert.equal(rows.OfficerChatMessage[0].sender_photo_url,'new');assert.equal(rows.SupervisorChatMessage[0].sender_photo_url,'new');
await sync(entities,{...user,profile_photo_url:''},user);assert.equal(rows.ActiveOfficer[0].profile_photo_url,'');assert.equal(rows.OfficerChatMessage[0].sender_photo_url,'');
const directory=fs.readFileSync('src/lib/appDirectory.js','utf8');const start=directory.indexOf('function preferOriginalPersonnelPhoto');const stop=directory.indexOf('\n}',start)+2;const choose=new Function(directory.slice(start,stop)+';return preferOriginalPersonnelPhoto;')();
assert.equal(choose({profile_photo_url:'new',profile_photo_original_url:'old'}).profile_photo_url,'new');
const link=load('base44/functions/professionalStandards/reportLink.ts','linkSubmittedReport');let all=[],counter=0;
const db={User:{filter:async()=>[{id:'subject'}]},PSCase:{filter:async q=>all.filter(r=>r.source_entity===q.source_entity&&r.source_record_id===q.source_record_id),create:async value=>{const r={...value,id:'case-'+(++counter)};all.push(r);return r;}},PSRecord:{create:async()=>({})},PSAudit:{create:async()=>({})}};
for(const name of ['Complaint','ConfidentialReport','UseOfForceReport','WriteUpReport','InspectionReport','PerformanceReview','ClientFeedback']){
 const report={id:'test-'+name,officer_email:'subject@example.invalid',description:'Synthetic report for isolated regression verification.',commendation:name==='ClientFeedback'};
 const receipt=await link(db,user,name,report);assert.match(receipt.tracking_code,/^\d{4}$/);assert.ok(receipt.reference.startsWith('IA-'));const c=all.at(-1);assert.notEqual(c.tracking_hash,receipt.tracking_code);assert.deepEqual(c.officer_ids,['subject']);assert.equal(c.kind,name==='ClientFeedback'?'commendation':'complaint');
 const repeated=await link(db,user,name,report);assert.equal(repeated.existing,true);assert.equal(repeated.reference,receipt.reference);
}
assert.equal(all.length,7);
const failed=await link({...db,PSCase:{filter:async()=>[],create:async()=>{throw Error('temporary failure');}}},user,'Complaint',{id:'saved-source'});assert.equal(failed.pending,true);assert.equal(failed.source_record_id,'saved-source');
console.log('PASS: photo replacement and removal synchronize active identities and chat portraits; a stale original never overrides the portrait; each native report type creates one linked IA case with a hashed four-digit receipt; case-link failures preserve source recovery.');
