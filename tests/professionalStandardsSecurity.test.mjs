import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
let actor=null,counter=0,mail=[];
const tables={};
const match=(row,q)=>Object.entries(q||{}).every(([k,v])=>k==='$or'?v.some(c=>match(row,c)):row[k]===v);
const db=new Proxy({}, {get(_t,name){tables[name]??=[];return {
 create:async data=>{const row={...data,id:name+'-'+(++counter),created_date:new Date().toISOString(),updated_date:new Date().toISOString()};tables[name].push(row);return {...row};},
 get:async id=>{const r=tables[name].find(r=>r.id===id);if(!r)throw Error('missing');return {...r};},
 filter:async(q,sort,limit=1000,skip=0)=>tables[name].filter(r=>match(r,q)).slice(skip,skip+limit).map(r=>({...r})),
 list:async(sort,limit=1000,skip=0)=>tables[name].slice(skip,skip+limit).map(r=>({...r})),
 update:async(id,patch)=>{const r=tables[name].find(r=>r.id===id);Object.assign(r,patch);return {...r};}
 };}});
const sdk={auth:{me:async()=>actor},asServiceRole:{entities:db,integrations:{Core:{SendEmail:async p=>{mail.push(p);return{};},UploadPrivateFile:async()=>({file_uri:'private/mock/evidence'}),CreateFileSignedUrl:async()=>({signed_url:'https://example.test/private-signed'})}}}};
const security=fs.readFileSync('base44/functions/professionalStandards/security.ts','utf8').replace(/^import .*;\n/m,'').replace(/^export \{.*\};?\n?/gm,'').replaceAll('export ','');
const source=fs.readFileSync('base44/functions/professionalStandards/entry.ts','utf8').replace(/^import .*;\n/m,'').replace('export default async function(req){','return async function(req){');
const handler=new Function('createClientFromRequest',security+'\n'+source)(()=>sdk);
let reqNo=0;
async function call(payload,files=[]){
 let body,headers={'cf-connecting-ip':'test-'+(++reqNo)};
 if(files.length){body=new FormData();body.set('payload',JSON.stringify(payload));files.forEach((f,i)=>body.set('file_'+i,f));}
 else{body=JSON.stringify(payload);headers['content-type']='application/json';}
 const res=await handler(new Request('https://example.test/functions/professionalStandards',{method:'POST',headers,body}));return {httpStatus:res.status,...await res.json()};
}
const digest=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
assert.equal((await call({action:'list'})).httpStatus,401);
assert.equal((await call({action:'contact'})).httpStatus,200);
const receipt=await call({action:'submit',kind:'complaint',anonymous:true,complainant_name:'DO NOT STORE',contact_email:'private@example.test',description:'A synthetic test description without real allegations.',location:'Test-only location',incident_date:'2026-01-01T12:00',officers:'Unknown'},[new File(['evidence'],'test.txt',{type:'text/plain'})]);
assert.equal(receipt.httpStatus,200);assert.match(receipt.tracking_code,/^[0-9]{4}$/);
const c=tables.PSCase[0];assert.equal(c.complainant_name,'Anonymous');assert.equal(c.contact_email,'');assert.notEqual(c.tracking_hash,receipt.tracking_code);
assert.equal(tables.PSRecord[0].file_uri,'private/mock/evidence');
assert.equal(tables.PSRecord[0].file_hash,await digest('evidence'));
const tracking=await call({action:'track',reference:receipt.reference,tracking_code:receipt.tracking_code});
assert.equal(tracking.httpStatus,200);for(const k of ['description','complainant_name','investigator_id','tracking_hash','records'])assert.equal(tracking[k],undefined);
assert.equal((await call({action:'track',reference:receipt.reference,tracking_code:'incorrect'})).httpStatus,404);
assert.equal((await call({action:'public_evidence',reference:receipt.reference,tracking_code:'incorrect'},[new File(['bad'],'bad.txt',{type:'text/plain'})])).httpStatus,404);
actor={id:'officer',role:'user',additional_roles:['officer'],email:'officer@example.test'};
assert.equal((await call({action:'list'})).httpStatus,403);
const investigator={id:'investigator',role:'user',additional_roles:['ia'],ps_role:'investigator',email:'investigator@example.test',last_name:'Test'};
const reviewer={id:'reviewer',role:'user',additional_roles:['ia'],ps_role:'reviewer',email:'reviewer@example.test',last_name:'Review'};
tables.User=[investigator,reviewer];
actor=reviewer;
assert.equal((await call({action:'list'})).httpStatus,200,'IA role opens the staff workspace without a second email code');
const reviewToken='';
let result=await call({action:'list',ps_access:reviewToken});assert.equal(result.httpStatus,200);assert.equal(result.cases[0].tracking_hash,undefined);
result=await call({action:'update',case_id:c.id,version:1,patch:{investigator_id:investigator.id,status:'investigating'},ps_access:reviewToken});assert.equal(result.httpStatus,200);
actor=investigator;
const invToken='investigator-secret';
await db.PSAccess.create({user_id:actor.id,session_hash:await digest(invToken),verified:true,session_expires_at:new Date(Date.now()+60000).toISOString()});
assert.equal((await call({action:'get',case_id:c.id,ps_access:invToken})).httpStatus,200);
assert.equal((await call({action:'get',case_id:c.id})).httpStatus,200);
assert.equal((await call({action:'update',case_id:c.id,version:c.version,patch:{status:'approved'},ps_access:invToken})).httpStatus,403);
assert.equal((await call({action:'update',case_id:c.id,version:c.version,patch:{public_message:'not authorized'},ps_access:invToken})).httpStatus,403);
assert.equal((await call({action:'export',ps_access:invToken})).httpStatus,403);
assert.equal((await call({action:'add_record',case_id:c.id,record:{kind:'allegation',title:'Test allegation',body:'Test only',finding:'pending'},ps_access:invToken})).httpStatus,200);
await call({action:'update',case_id:c.id,version:c.version,patch:{status:'pending_review'},ps_access:invToken});
actor=reviewer;
assert.equal((await call({action:'update',case_id:c.id,version:c.version,patch:{status:'approved'},ps_access:reviewToken})).httpStatus,400);
actor=investigator;
const allegation=tables.PSRecord.find(r=>r.kind==='allegation');
assert.equal((await call({action:'finding',case_id:c.id,record_id:allegation.id,finding:'unfounded',ps_access:invToken})).httpStatus,200);
await call({action:'add_record',case_id:c.id,record:{kind:'corrective_action',title:'Test follow-up',body:'Test only'},ps_access:invToken});
actor=reviewer;
assert.equal((await call({action:'update',case_id:c.id,version:c.version,patch:{status:'closed'},ps_access:reviewToken})).httpStatus,400);
assert.equal((await call({action:'update',case_id:c.id,version:c.version,patch:{status:'approved'},ps_access:reviewToken})).httpStatus,200);
assert.ok(tables.PSAudit.some(r=>r.action==='case_view'));assert.ok(tables.PSAudit.some(r=>r.action==='finding'));
assert.equal((await call({action:'export',ps_access:reviewToken})).httpStatus,200);assert.ok(tables.PSAudit.some(r=>r.action==='restricted_export'));
actor={...investigator,id:'other-investigator'};
await db.PSAccess.create({user_id:actor.id,session_hash:await digest('other-secret'),verified:true,session_expires_at:new Date(Date.now()+60000).toISOString()});
assert.equal((await call({action:'get',case_id:c.id,ps_access:'other-secret'})).httpStatus,403);
actor=null;c.tracking_failures=0;c.tracking_locked_until='';
for(let i=0;i<5;i++)assert.equal((await call({action:'track',reference:receipt.reference,tracking_code:receipt.tracking_code==='9999'?'9998':'9999'})).httpStatus,404);
assert.equal((await call({action:'track',reference:receipt.reference,tracking_code:receipt.tracking_code})).httpStatus,429,'four-digit codes must have persistent case-level attempt locks');
c.tracking_locked_until=new Date(Date.now()-1000).toISOString();
assert.equal((await call({action:'track',reference:receipt.reference,tracking_code:receipt.tracking_code})).httpStatus,200);
assert.equal(c.tracking_failures,0);
actor=reviewer;
let opened=await call({action:'create_case',ps_access:reviewToken,case:{description:'A staff-opened investigation for a synthetic test.',location:'Test office',incident_date:'2026-01-01T12:00',investigator_id:investigator.id}});assert.equal(opened.httpStatus,200);assert.ok(opened.case_id);assert.equal(tables.PSCase.find(v=>v.id===opened.case_id).investigator_id,investigator.id);
const linkedSource=await db.Complaint.create({description:'An existing synthetic complaint to link into an investigation.',officer_name:'Test Officer',incident_date:'2026-01-01T12:00',location:'Test site'});
const linkedPayload={action:'create_case',ps_access:reviewToken,case:{source_entity:'Complaint',source_record_id:linkedSource.id}};let linked=await call(linkedPayload);assert.equal(linked.httpStatus,200);assert.equal(tables.PSCase.find(v=>v.id===linked.case_id).source_record_id,linkedSource.id);assert.equal((await call(linkedPayload)).existing,true);
actor=investigator;assert.equal((await call({...linkedPayload,ps_access:invToken})).httpStatus,403);
actor=null;assert.equal((await call({action:'public_followup',reference:receipt.reference,tracking_code:receipt.tracking_code,message:'Additional synthetic incident information.'})).httpStatus,200);assert.ok(tables.PSRecord.some(v=>v.case_id===c.id&&v.kind==='public_followup'));
actor={...reviewer,termination_date:'2026-01-01'};
assert.equal((await call({action:'list',ps_access:reviewToken})).httpStatus,401);
for(const name of ['PSCase','PSRecord','PSAudit','PSAccess','PortalInvitation','PortalRegistration']){
 const model=JSON.parse(fs.readFileSync('base44/entities/'+name+'.jsonc'));assert.deepEqual(model.rls,{create:false,read:false,update:false,delete:false});
}
const user=JSON.parse(fs.readFileSync('base44/entities/User.jsonc'));
for(const key of ['portal_approved','ps_role','additional_roles'])assert.equal(user.properties[key].rls.write,false);
console.log('PASS: public intake, anonymous-field stripping, private evidence hashing, secret tracking, normal staff sign-in, role and assignment boundaries, findings approval, corrective action closure checks, audit logging, restricted exports, and privilege field protection.');
