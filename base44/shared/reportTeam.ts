const norm=v=>String(v||'').trim().toLowerCase();
const site=v=>norm(v).split(' - ')[0].split(':')[0].trim();
export const teamReportEntities=new Set(['ShiftHandover','ShiftReport','DailyActivityReport','IncidentReport','ConfidentialReport','ParkingViolation','MaintenanceReport','OpenDoorReport','ExpenseReport','QRScanEvent','QRPatrolReport','TrespassingNotice','CriminalComplaint','Summons','WitnessSubpoenaRequest']);
export function easternWall(value=Date.now()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return NaN;
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=k=>parts.find(p=>p.type===k)?.value;
 return Date.parse(get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute')+':00Z');
}
export function interval(row){
 const day=String(row.shift_date||row.assignment_date||'').slice(0,10);
 const start=Date.parse(day+'T'+String(row.start_time||'00:00').slice(0,5)+':00Z');
 let end=Date.parse(day+'T'+String(row.end_time||'00:00').slice(0,5)+':00Z');
 if(end<=start)end+=86400000;
 return [start,end];
}
const realIso=wall=>{let value=wall+5*3600000;for(let i=0;i<3;i++)value+=wall-easternWall(value);return new Date(value).toISOString();};
const active=row=>!row.archived&&!row.is_open&&!['called_out','sent_home','reassigned'].includes(norm(row.attendance_status))&&!['open','unassigned',''].includes(norm(row.officer_email));
export function scheduledTeam({user,data={},schedules=[],users=[],now=Date.now()}){
 const reportDate=String(data.report_date||data.shift_date||data.incident_date||data.violation_date||data.scanned_date||'').slice(0,10);
 const when=easternWall(data.scanned_at||now);
 const location=site(data.location||data.property_site||data.linked_call_location);
 let own=schedules.filter(row=>active(row)&&norm(row.officer_email)===norm(user.email)&&(!location||site(row.location)===location));
 const clock=data.incident_time||data.shift_start||data.start_time;
 const target=reportDate&&clock?Date.parse(reportDate+'T'+String(clock).slice(0,5)+':00Z'):when;
 own=own.filter(row=>{
  const [start,end]=interval(row);
  if(reportDate&&row.shift_date!==reportDate&&!(target>=start&&target<end))return false;
  return Boolean(reportDate)||target>=start&&target<end;
 });
 own.sort((a,b)=>{
  const distance=r=>{const [start,end]=interval(r);return target>=start&&target<end?0:Math.min(Math.abs(target-start),Math.abs(target-end));};
  return distance(a)-distance(b)||String(a.id).localeCompare(String(b.id));
 });
 const shift=own[0];
 if(!shift)return {attached_officer_ids:[],attached_officer_emails:[],attached_officer_names:[],team_schedule_ids:[],team_credit_source:'schedule',location:location?'':undefined};
 const [start,end]=interval(shift);
 const peers=schedules.filter(row=>active(row)&&site(row.location)===site(shift.location)&&norm(row.officer_email)!==norm(user.email)&&interval(row)[0]<end&&interval(row)[1]>start);
 const emails=new Set(peers.map(row=>norm(row.officer_email)));
 if(shift.partner_officer_email)emails.add(norm(shift.partner_officer_email));
 const people=users.filter(person=>emails.has(norm(person.email))&&!person.disabled&&!person.termination_date&&!['terminated','suspended'].includes(norm(person.employment_status))&&[person.role,...(person.additional_roles||[])].some(role=>['officer','supervisor'].includes(norm(role))));
 return {attached_officer_ids:people.map(p=>String(p.id)),attached_officer_emails:people.map(p=>norm(p.email)),attached_officer_names:people.map(p=>[p.rank,p.first_name,p.last_name].filter(Boolean).join(' ')||p.full_name||p.email),team_schedule_ids:[shift.id,...peers.filter(r=>people.some(p=>norm(p.email)===norm(r.officer_email))).map(r=>r.id)].map(String),team_credit_source:'schedule',team_location:shift.location,team_date:shift.shift_date,team_window_start:realIso(start),team_window_end:realIso(end)};
}
async function all(entity,query){
 const rows=[];for(let skip=0;;skip+=500){const page=await entity.filter(query,'id',500,skip);rows.push(...page);if(page.length<500)return rows;}
}
export async function resolveReportTeam(sdk,user,data={}){
 const date=String(data.report_date||data.shift_date||data.incident_date||data.violation_date||data.scanned_date||new Date(easternWall()).toISOString().slice(0,10)).slice(0,10);
 const day=Date.parse(date+'T12:00:00Z');
 if(!Number.isFinite(day))throw Error('Invalid report date');
 const from=new Date(day-86400000).toISOString().slice(0,10),to=new Date(day+86400000).toISOString().slice(0,10);
 const schedules=await all(sdk.asServiceRole.entities.Schedule,{shift_date:{$gte:from,$lte:to}});
 const candidateEmails=[...new Set(schedules.flatMap(row=>[norm(row.officer_email),norm(row.partner_officer_email)]).filter(Boolean))];
 const users=candidateEmails.length?await all(sdk.asServiceRole.entities.User,{email:{$in:candidateEmails}}):[];
 return scheduledTeam({user,data,schedules,users});
}
