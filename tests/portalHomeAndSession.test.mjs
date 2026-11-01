import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import {INACTIVITY_LIMIT_MS,watchInactivity,recordLoginActivity,requiresFreshLogin,REAUTHENTICATE_AFTER} from '../src/lib/sessionPolicy.js';
const require=createRequire(import.meta.url),m={exports:{}};
const output=buildSync({entryPoints:['src/lib/roleHome.js'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
new Function('require','module','exports',output)(require,m,m.exports);
const home=m.exports.getRoleHome;
for(const [user,page,label] of [
 [{role:'admin',additional_roles:['officer','supervisor','cad_access','hr','trainer']},'AdminCenter','Administration Main'],
 [{role:'user',additional_roles:['officer','supervisor','cad_access']},'SupervisorCenter','Supervisor Main'],
 [{role:'user',additional_roles:['officer','cad_access']},'OfficerCenter','Officer Main'],
 [{role:'user',additional_roles:['hr','officer']},'HRCenter','HR Main'],
 [{role:'user',additional_roles:['trainer','officer']},'TrainerCenter','Trainer Main'],
 [{role:'user',additional_roles:['cad_access']},'CADCenter','Dispatch Main'],
 [{role:'user',additional_roles:['support_staff']},'AdminSupportStaffClock','Support Main'],
 [{role:'user',additional_roles:['ia']},'ProfessionalStandards','Professional Standards Main'],
 [{role:'user',additional_roles:['student']},'StudentPortal','Student Main'],
 [{role:'user',additional_roles:['visitor']},'VisitorPortal','Visitor Main'],
 [{role:'user',additional_roles:['client']},'ClientCenter','Client Main']
]){assert.equal(home(user).page,page);assert.equal(home(user).label,label);}
let clock=1_000_000,expired=0,tick;
const target=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
const options={userId:'staff',storage,target,documentTarget:doc,now:()=>clock,onExpire:()=>expired++,setIntervalFn:fn=>{tick=fn;return 1;},clearIntervalFn:()=>{}};
recordLoginActivity('staff',storage,clock);
let cleanup=watchInactivity(options);
clock+=(13*60-1)*60*1000;tick();assert.equal(expired,0);
target.dispatchEvent(new Event('bps-background-location-tick'));
clock+=60*1000;tick();assert.equal(expired,1,'background telemetry must not extend the 13-hour inactivity window');
cleanup();
recordLoginActivity('staff',storage,clock);cleanup=watchInactivity(options);
clock+=(13*60-1)*60*1000;target.dispatchEvent(new Event('keydown'));
clock+=2*60*1000;tick();assert.equal(expired,1,'real interaction extends the idle window');
clock+=(13*60-2)*60*1000;target.dispatchEvent(new Event('pointerdown'));assert.equal(expired,2,'interaction after expiry must not resurrect a session');
cleanup();
cleanup=watchInactivity(options);assert.equal(expired,3,'reload cannot restart an expired idle timer');cleanup();
cleanup=watchInactivity({...options,issuedAt:clock});assert.equal(expired,3,'fresh login starts a new idle window');cleanup();
const cutoff=Date.parse(REAUTHENTICATE_AFTER);
assert.equal(requiresFreshLogin(new Date(cutoff-60000).toISOString()),true);
assert.equal(requiresFreshLogin(new Date(cutoff+60000).toISOString()),false);
assert.equal(requiresFreshLogin('invalid'),true);
assert.equal(INACTIVITY_LIMIT_MS,46800000);
console.log('PASS: highest-role home destinations and labels; 13-hour true inactivity; background events do not keep sessions alive; reload/resume and fresh-login behavior; release-wide token cutoff.');
