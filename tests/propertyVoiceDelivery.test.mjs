import assert from 'node:assert/strict';
import fs from 'node:fs';
import {propertyAlertWasTimely,parseCadUtcTime} from '../src/lib/propertyAlertFreshness.js';
const source=fs.readFileSync('src/components/GlobalMessageBanner.jsx','utf8');
const start=source.indexOf('const showPropertyCall = async');
const end=source.indexOf('\n    try {',start);
const handler=source.slice(start,end);
const now=Date.now(),opened=now-5000;
const roles=source.slice(source.indexOf('const canHearPropertyAlerts ='),source.indexOf('export function CadAudioToggle'));
const canHear=Function('lowerRoles','normalized',roles+';return canHearPropertyAlerts;')(u=>new Set(u?.additional_roles||[]),v=>String(v||'').toLowerCase());
assert.equal(canHear({role:'admin'}),true);assert.equal(canHear({additional_roles:['officer']}),true);assert.equal(canHear({additional_roles:['student']}),false);
for(const scenario of ['normal','claim-retry','blocked-retry','history']){
 const spoken=[],finalized=[];let claims=0,banners=[];
 const env={user:{role:'admin',email:'test@example.test'},canHearPropertyAlerts:canHear,isLiveAudioEvent:r=>parseCadUtcTime(r.created_date)>=opened,
 knownIds:{current:new Set()},announcedPropertySpeech:{current:new Set()},announcedPropertyCallStatuses:{current:new Map()},parseCadUtcTime,propertyAlertWasTimely,
 normalized:v=>String(v||'').toLowerCase(),HIDDEN_EXISTING_CALL_STATUSES:new Set(['cleared','cancelled']),callStatusKey:v=>v,
 LIVE_PROPERTY_ALERT_MAX_AGE_MS:180000,audioSettings:{current:{enabled:true,volume:1,enabled_event_types:['property_alert']}},
 base44:{entities:new Proxy({}, {get:()=>{throw Error('Speech must not depend on duty/property reads for a verified realtime alert');}})},
 claimAnnouncementEvent:async()=>{claims++;return scenario==='claim-retry'&&claims===1?{claimed:false,error:Error('temporary')}:{claimed:true};},
 announceVoiceAsync:async text=>{spoken.push(text);return !(scenario==='blocked-retry'&&spoken.length===1);},
 propertyHornPrelude:()=>async()=>true,finalizeAnnouncementEvent:async(_claim,_key,state)=>finalized.push(state),
 setBanners:fn=>{banners=fn(banners);},window:{dispatchEvent(){},setTimeout(){return 1;}},CustomEvent:class{},timers:{current:new Map()}};
 const show=Function(...Object.keys(env),handler+';return showPropertyCall;')(...Object.values(env));
 const row={id:'alert',callId:'call',propertyId:'property',propertyName:'Example Property',callIncident:'Service Call',callLocation:'100 Example Street',callStatus:'new',callTime:new Date(now-30000).toISOString(),created_date:new Date(scenario==='history'?opened-1000:now-1000).toISOString()};
 await show(row,{realtimeCreate:true});await new Promise(resolve=>setImmediate(resolve));
 await show(row,{realtimeCreate:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(spoken.length,scenario==='history'?0:scenario==='blocked-retry'?2:1,scenario);
 assert.equal(banners.length,1,'recovery must not duplicate visual alerts');
 if(scenario!=='history')assert.equal(finalized.at(-1),'played');
}
console.log('PASS property voice: verified live alerts speak without duty lookups; failed/blocked attempts recover; successful delivery is not repeated; historical refresh stays silent; non-operational roles excluded');
