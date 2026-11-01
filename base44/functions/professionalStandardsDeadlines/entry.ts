import {createClientFromRequest} from 'npm:@base44/sdk';
import {notify,audit,psRole,manager} from '../professionalStandards/security.ts';
export default async function(req){
 try{
 const sdk=createClientFromRequest(req),u=await sdk.auth.me().catch(()=>null),db=sdk.asServiceRole.entities;
 let service=false;
 if(!u&&req.headers.get('Authorization')){try{await sdk.entities.SystemScanRun.list('-created_date',1);service=true;}catch{}}
 if(!service&&!manager(u))return Response.json({error:'Trusted workflow or main administrator access required'},{status:403});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const tomorrow=next.toISOString().slice(0,10);
 const [cases,records,users]=await Promise.all([db.PSCase.list('-created_date',1000),db.PSRecord.list('-created_date',2000),db.User.list('-created_date',1000)]);
 const eligible=new Map(users.filter(v=>psRole(v)).map(v=>[v.id,v])),open=new Map(cases.filter(v=>v.status!=='closed').map(v=>[v.id,v]));
 let delivered=0,failed=0;
 const reminders=[];
 for(const c of open.values())if(c.due_date&&c.due_date<=tomorrow&&c.investigator_id&&c.last_reminder_day!==day)reminders.push({entity:'PSCase',item:c,user_id:c.investigator_id,reference:c.reference,label:'Case deadline: '+c.due_date});
 for(const r of records)if(['task','corrective_action','interview'].includes(r.kind)&&r.status!=='completed'&&r.due_date&&r.due_date<=tomorrow&&r.assigned_to&&r.last_reminder_day!==day&&open.has(r.case_id))reminders.push({entity:'PSRecord',item:r,user_id:r.assigned_to,reference:open.get(r.case_id).reference,label:r.title+' · due '+r.due_date});
 for(const r of reminders.slice(0,100)){
  const person=eligible.get(r.user_id);if(!person)continue;
  const sent=await notify(sdk,person.email,'Professional Standards deadline · '+r.reference,r.label+'. Sign in to BPS Pathfinder and open Professional Standards to review your assignment. Do not forward case information outside authorized staff.');
  if(sent){await db[r.entity].update(r.item.id,{last_reminder_day:day});delivered++;}else failed++;
  await audit(db,u,'deadline_reminder',r.entity==='PSCase'?r.item.id:r.item.case_id,(sent?'accepted for delivery':'delivery failed')+' · '+r.item.id);
 }
 return Response.json({success:true,delivered,failed,limited:reminders.length>100,scanned_cases:cases.length,scanned_records:records.length});
 }catch{return Response.json({error:'Deadline reminders could not be completed.'},{status:500});}
}
