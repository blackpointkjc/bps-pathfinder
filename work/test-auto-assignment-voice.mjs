import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
let handler;
let user={id:'officer',email:'officer@example.com'};
const event={id:'event',event_key:'auto:event',event_type:'unit_dispatched',unit_id:'officer',call_id:'call',triggering_action:'geofenceDispatchAssignment.live',announcement_text:'Property alert. Unit 12, respond to Main Street. Fire alarm. CAD number 123.'};
const receipts=[];
const db={
 CallStatusLog:{get:async()=>event},
 DispatchCall:{get:async()=>({assigned_units:['officer','other']})},
 CallAssignment:{filter:async()=>[{unit_id:'officer'},{unit_id:'other'}]},
 Unit:{get:async()=>null},ActiveOfficer:{get:async()=>null},
 CadAnnouncementReceipt:{
  filter:async q=>receipts.filter(r=>r.event_key===q.event_key && r.user_email===q.user_email),
  create:async data=>{const row={...data,id:'r'+receipts.length};receipts.push(row);return row;},
 }
};
const source=fs.readFileSync('base44/functions/claimCadAnnouncement/entry.ts','utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 exports:{},require:()=>({createClientFromRequest:()=>({auth:{me:async()=>user},asServiceRole:{entities:db}})}),
 Deno:{serve:fn=>handler=fn},Response,Set,Date,console
});
const req=()=>({json:async()=>({event_key:event.event_key,event_id:event.id,event_type:event.event_type})});
const result=await (await handler(req())).json();
assert.equal(result.claimed,true);
assert.equal(result.announcement_text,event.announcement_text+' You have been assigned a call. Check your mobile data terminal.');
assert.equal(result.property_announcement_text,event.announcement_text);
assert.equal((await (await handler(req())).json()).claimed,false);
user={id:'other',email:'other@example.com'};
assert.equal((await (await handler(req())).json()).not_recipient,true,'backup assignment must not tell other assigned officers they were just assigned');
user={id:'officer',email:'officer@example.com'};
event.event_key='manual';event.triggering_action='manual';
assert.equal((await (await handler(req())).json()).announcement_text,'You have been assigned a call. Check your mobile data terminal.');
event.event_key='update';event.event_type='call_updated';
assert.equal((await (await handler(req())).json()).announcement_text,'Your call has been updated. Check your mobile data terminal.');

const ui=fs.readFileSync('src/components/GlobalMessageBanner.jsx','utf8');
const start=ui.indexOf("        const autoAssignment = record.triggering_action");
const end=ui.indexOf('        // Officer distress already',start);
assert.ok(start>0 && end>start);
const block=ui.slice(start,end);
async function speakCase(initial) {
 const spoken=[],finalized=[];
 await vm.runInNewContext('(async()=>{'+block+'})()',{
  record:{...event,event_type:'unit_dispatched',triggering_action:'geofenceDispatchAssignment.live',event_key:'assignment',call_id:'call'},
  claim:result,settings:{},claimAnnouncementEvent:async()=>initial,
  speakNotification:(text,options)=>{spoken.push({text,options});return true;},
  finalizeAnnouncementEvent:async(...args)=>finalized.push(args),isVoiceEnabled:()=>true
 });
 return {spoken,finalized};
}
let r=await speakCase({claimed:true});
assert.equal(r.spoken[0].text,result.announcement_text);
assert.equal(r.spoken[0].options.priority,'critical');
assert.equal(r.finalized[1][1],'call:call:initial');
r=await speakCase({claimed:false,receipt:{state:'played'}});
assert.equal(r.spoken[0].text,result.assignment_announcement_text);
r=await speakCase({claimed:false,local_duplicate:true});
assert.equal(r.spoken[0].text,result.assignment_announcement_text);
r=await speakCase({claimed:false,error:Error('temporary failure')});
assert.equal(r.spoken[0].text,result.announcement_text,'unavailable initial claim must not erase call details');
console.log('PASS: property details before assignment; initial-alert dedupe; targeted auto assignment; manual assignment and real update wording retained; transient failure keeps details.');
