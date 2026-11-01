import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
let actor=null,serial=0,deliveries=[];
const tables={};
const testHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test-current-session')))).map(v=>v.toString(16).padStart(2,'0')).join('');
tables.PortalAuthSession=[{id:'mock-session',token_hash:testHash,started_at:new Date().toISOString(),last_activity_at:new Date().toISOString(),revoked:false}];

const match=(r,q)=>Object.entries(q||{}).every(([k,v])=>r[k]===v);
const db=new Proxy({}, {get(_,name){tables[name]??=[];return {
 get:async id=>{const row=tables[name].find(v=>v.id===id);if(!row)throw Error('missing');return {...row};},
 create:async value=>{const row={...value,id:name+'-'+(++serial),created_date:new Date().toISOString()};tables[name].push(row);return {...row};},
 update:async(id,patch)=>{const row=tables[name].find(v=>v.id===id);if(!row)throw Error('missing');Object.assign(row,patch);return {...row};},
 filter:async(q,_sort,limit=1000)=>tables[name].filter(r=>match(r,q)).slice(0,limit).map(v=>({...v})),
 list:async()=>tables[name].map(v=>({...v}))
 };}});
const sdk={auth:{me:async()=>actor},asServiceRole:{entities:db,integrations:{Core:{SendEmail:async p=>{deliveries.push(p);}}}}};
function load(name){let source=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8').replace(/^import .*;\n/gm,'').replace('export default async function(req){','async function handler(req){');source=transformSync(source,{loader:'ts',target:'es2022'}).code;return new Function('createClientFromRequest','companyDelivery',source+';return handler;')(()=>sdk,async(_sdk,to,subject,body)=>{deliveries.push({to,subject,body});return true;});}
const register=load('portalRegistration'),invite=load('createPortalAccount');
async function call(fn,payload){tables.PortalAuthSession[0].user_id=actor?.id;const r=await fn(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test-current-session'},body:JSON.stringify(payload)}));return {httpStatus:r.status,...await r.json()};}
actor=await db.User.create({email:'new@example.test',role:'user',additional_roles:[]});
let r=await call(register,{action:'profile',first_name:'New',last_name:'Applicant',requested_type:'visitor',role:'admin',ps_role:'reviewer',additional_roles:['full_access']});
assert.equal(r.success,true);assert.equal(r.pending,true);
let saved=tables.User.find(v=>v.id===actor.id);assert.equal(saved.portal_approved,false);assert.deepEqual(saved.additional_roles,[]);assert.equal(saved.ps_role,undefined);assert.equal(saved.requested_account_type,'visitor');assert.equal(saved.rank,'Visitor Pending');
actor={...saved};r=await call(register,{action:'profile',requested_type:'employee'});assert.equal(r.requested_type,'visitor');assert.equal(tables.PortalRegistration.length,1);
assert.equal((await call(register,{action:'invitations'})).httpStatus,403);
actor=await db.User.create({email:'admin@example.test',role:'admin',additional_roles:[]});
r=await call(invite,{accountType:'visitor',email:'guest@example.test',first_name:'Guest',last_name:'Applicant',password:'MUST_NOT_BE_STORED'});
assert.equal(r.success,true);assert.equal(r.email_sent,true);assert.equal(tables.PortalInvitation[0].account_type,'visitor');assert.equal(JSON.stringify(tables.PortalInvitation).includes('MUST_NOT_BE_STORED'),false);
assert.ok(deliveries.at(-1).body.includes('/Login?mode=register'));
assert.equal(tables.User.some(v=>v.email==='guest@example.test'),false,'invitation must not manufacture password credentials');
assert.equal((await call(register,{action:'invitations'})).invitations.length,1);
const guest=await db.User.create({email:'guest@example.test',role:'user',additional_roles:[]});
actor=guest;r=await call(register,{action:'profile',first_name:'Imposter supplied',last_name:'Ignored',requested_type:'employee'});
assert.equal(r.success,true);saved=tables.User.find(v=>v.id===guest.id);assert.equal(saved.first_name,'Guest');assert.equal(saved.requested_account_type,'visitor');assert.equal(saved.portal_approved,false);
actor=await db.User.create({email:'trainer@example.test',role:'user',additional_roles:['trainer']});
assert.equal((await call(invite,{accountType:'employee',email:'officer@example.test',first_name:'Test',last_name:'Officer'})).httpStatus,403);
assert.equal((await call(invite,{accountType:'student_pending',email:'student@example.test',first_name:'Test',last_name:'Student'})).success,true);
const student=await db.User.create({email:'student@example.test',role:'user',additional_roles:[]});actor=student;
r=await call(register,{action:'profile'});assert.equal(r.success,true);assert.equal(r.profile.rank,'Student Registration Pending');assert.equal(tables.StudentEnrollment?.length||0,0,'do not create an invalid enrollment before collecting birth date');r=await call(register,{action:'profile',date_of_birth:'2000-02-15'});assert.equal(r.success,true);assert.equal(tables.StudentEnrollment[0].user_id,student.id);assert.equal(tables.StudentEnrollment[0].date_of_birth,'2000-02-15');assert.equal(r.profile.portal_approved,false);
actor=await db.User.create({email:'active@example.test',role:'user',additional_roles:['officer']});
r=await call(register,{action:'profile',requested_type:'visitor',first_name:'Changed',last_name:'Changed'});assert.equal(r.profile.portal_approved,true);assert.deepEqual(r.profile.additional_roles,['officer']);assert.equal(r.pending,false);
const activeId=actor.id;actor=tables.User.find(v=>v.email==='admin@example.test');
assert.equal((await call(invite,{accountType:'pending',email:'active@example.test',first_name:'Do',last_name:'Not Wipe'})).httpStatus,409);
assert.deepEqual(tables.User.find(v=>v.id===activeId).additional_roles,['officer']);
const pending=await db.User.create({email:'declined@example.test',role:'user',additional_roles:[],requested_account_type:'visitor'});
assert.equal((await call(register,{action:'review_account',user_id:pending.id,decision:'deny'})).success,true);
actor=await db.User.get(pending.id);let denied=await call(register,{action:'profile'});assert.equal(denied.httpStatus,401);assert.equal(denied.code,'SESSION_REAUTH_REQUIRED');
actor=tables.User.find(v=>v.email==='admin@example.test');assert.equal((await call(register,{action:'review_account',user_id:pending.id,decision:'restore_pending'})).success,true);assert.equal((await db.User.get(pending.id)).account_status,'pending');
actor={...actor,disabled:true};assert.equal((await call(invite,{accountType:'visitor',email:'x@example.test',first_name:'No',last_name:'Access'})).httpStatus,401);
console.log('PASS: registration cannot self-grant access; invitations retain identity without storing passwords; visitor and student accounts stay pending; trainer permissions are scoped; existing active accounts are preserved; invitation delivery is reported.');
