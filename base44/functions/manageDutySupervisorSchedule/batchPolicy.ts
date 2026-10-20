// @ts-nocheck
import { absenceWindows } from './absencePolicy.ts';
import { easternInstant } from './leaveWindow.ts';
import { intersects } from './fleetPolicy.ts';
const clean=v=>String(v||'').trim().toLowerCase();
const nextDay=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const rank=p=>clean(p.rank).replace(/\./g,'');
const eligible=p=>!p.termination_date&&(p.role==='admin'||p.is_supervisor||(p.additional_roles||[]).some(r=>['supervisor','full_access'].includes(r))||['colonel','lt colonel','lt col','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal'].includes(rank(p)));
export function validateBatch(rows,users,existing){
 const planned=[],errors=[];let skipped=0;
 for(const row of rows){
  const person=users.find(p=>clean(p.email)===clean(row.supervisor_email));
  if(!person||!eligible(person)){errors.push('An active eligible supervisor is required.');continue;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.assignment_date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start_time)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end_time)){errors.push('Valid dates, start and end times are required.');continue;}
  const from=Date.parse(easternInstant(row.assignment_date,row.start_time)),to=Date.parse(easternInstant(row.end_time<=row.start_time?nextDay(row.assignment_date):row.assignment_date,row.end_time));
  if(absenceWindows(person).some(w=>from<Date.parse(w.end)&&to>Date.parse(w.start))){errors.push([person.rank,person.last_name].filter(Boolean).join(' ')+' is out of office during '+row.assignment_date);continue;}
  const payload={assignment_date:row.assignment_date,start_time:row.start_time,end_time:row.end_time,supervisor_email:clean(person.email),supervisor_name:[person.rank,person.last_name].filter(Boolean).join(' '),supervisor_rank:person.rank,location:row.location||'ALL',notes:String(row.notes||'').slice(0,1000),status:'scheduled'};
  const others=[...existing,...planned].filter(r=>r.id!==row.id&&r.status!=='cancelled'&&clean(r.supervisor_email)===clean(person.email)&&clean(r.location||'ALL')===clean(payload.location));
  if(others.some(r=>r.assignment_date===payload.assignment_date&&r.start_time===payload.start_time&&r.end_time===payload.end_time)){skipped++;continue;}
  if(others.some(r=>intersects(r,payload))){errors.push('Overlapping duty coverage on '+payload.assignment_date+' for '+payload.supervisor_name);continue;}
  planned.push({...payload,...(row.id?{id:row.id}:{})});
 }
 return {planned,errors,skipped};
}
