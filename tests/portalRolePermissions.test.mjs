import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformSync} from 'esbuild';
const compile=(s,deps={})=>new Function(...Object.keys(deps),transformSync(s.replace(/^import .*;\n/gm,'').replaceAll('export ',''),{loader:'ts',target:'es2022'}).code)(...Object.values(deps));
const policy=fs.readFileSync('src/lib/portalAccess.js','utf8').replaceAll('export ','');
const {hasIAAccess,hasWholeAppAccess,iaRole}=new Function(policy+';return {hasIAAccess,hasWholeAppAccess,iaRole}')();
const hiers='6a72bbee2842d6338cbae513';
assert.equal(hasIAAccess({id:'admin',role:'admin',additional_roles:[]}),false);
assert.equal(hasIAAccess({id:'officer',additional_roles:['officer']}),false);
assert.equal(hasIAAccess({id:'staff',additional_roles:['ia']}),true);
assert.equal(iaRole({id:'staff',additional_roles:['ia'],ps_role:'reviewer'}),'reviewer');
assert.equal(hasIAAccess({id:'staff',additional_roles:[],ps_role:'reviewer'}),false);
assert.equal(hasIAAccess({id:'staff',additional_roles:['ia','student']}),false);
assert.equal(hasIAAccess({id:'staff',additional_roles:['ia'],disabled:true}),false);
assert.equal(hasWholeAppAccess({id:'other',additional_roles:['full_access']}),false);
assert.equal(hasWholeAppAccess({id:hiers,additional_roles:['full_access']}),true);
assert.equal(iaRole({id:hiers,additional_roles:['full_access']}),'reviewer');
let actor={id:'admin',role:'admin',additional_roles:[]},handler;
const rows=[{id:'staff',role:'user',rank:'Support Staff',additional_roles:['support'],ps_role:'none'},{id:hiers,role:'admin',rank:'Colonel',additional_roles:['full_access']}];
const db=new Proxy({}, {get(_,name){return {
 list:async()=>name==='User'?rows:[],get:async id=>structuredClone(rows.find(v=>v.id===id)),filter:async()=>[],
 update:async(id,patch)=>{Object.assign(rows.find(v=>v.id===id),patch);return rows.find(v=>v.id===id);},
 create:async v=>({...v,id:'audit'})
};}});
const sdk={auth:{me:async()=>actor},asServiceRole:{entities:db}};
compile(fs.readFileSync('base44/functions/updateUser/entry.ts','utf8'),{
 Deno:{serve:fn=>handler=fn},createClientFromRequest:()=>sdk,
 notifyPlatoonChange:async()=>{},synchronizeOfficerIdentity:async()=>[],normalizeRank:v=>v,PAY_RANGES:{},RANK_SERIES:{},nextUnitNumber:()=>1,reconcileAbsences:async()=>null,isClientIdentity:()=>false,clientOperationalPatch:()=>({}),autoReportingSelection:()=>({}),reportingFields:()=>({})
});
async function update(userId,updates){sdk.auth.me=async()=>actor;const r=await handler(new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId,updates})}));return {status:r.status,...await r.json()};}
let r=await update('staff',{additional_roles:['support','ia'],ps_role:'reviewer'});assert.equal(r.success,true,JSON.stringify(r));assert.equal(rows[0].ps_role,'reviewer');assert.ok(rows[0].additional_roles.includes('ia'));assert.equal(rows[0].portal_approved,true);
r=await update('staff',{additional_roles:['support']});assert.equal(r.success,true);assert.equal(rows[0].ps_role,'none');assert.equal(hasIAAccess(rows[0]),false);
r=await update('staff',{additional_roles:['support','full_access']});assert.equal(r.status,403);assert.match(r.error,/Colonel Hiers/);assert.equal(rows[0].additional_roles.includes('full_access'),false);
r=await update(hiers,{additional_roles:['full_access']});assert.equal(r.success,true);
actor={id:'imposter',role:'user',additional_roles:['full_access']};r=await update('staff',{additional_roles:['support','ia']});assert.equal(r.status,403);
actor={id:'hr',role:'user',additional_roles:['hr']};r=await update('staff',{additional_roles:['support','ia']});assert.equal(r.status,403);
actor={id:'admin',role:'admin',additional_roles:[]};r=await update('staff',{additional_roles:['student','ia']});assert.equal(r.status,403);
const layout=fs.readFileSync('src/Layout.jsx','utf8');
assert.match(layout,/if \(pageName === 'ProfessionalStandards'\) return hasIAAccess\(user\)/);
assert.match(layout,/if\(hasIAAccess\(user\)\)centers.push\('standards'\)/);
assert.match(layout,/if \(hasWholeAppAccess\(user\)\) return true/);
const publicPage=fs.readFileSync('src/pages/PublicProfessionalStandards.jsx','utf8');
assert.equal(publicPage.includes('Staff sign in'),false);assert.equal(publicPage.includes('BlackPoint home'),false);
assert.equal(fs.readFileSync('src/pages/ManageCompanyEmployees.jsx','utf8').includes('Corporate Internet Browser Access'),false);
console.log('PASS: IA grant/review/revoke persist through actual updateUser; non-IA/admin boundaries; stale Full Access cannot authorize; Full Access is Colonel Hiers only; public links and browser copy removed.');
