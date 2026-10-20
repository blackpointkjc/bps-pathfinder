// @ts-nocheck
const clean=v=>String(v||'').trim().toLowerCase();
export function interval(row){
 const day=row.assignment_date||row.shift_date;
 const start=Date.parse(day+'T'+String(row.start_time||'00:00').slice(0,5)+':00Z');
 let end=Date.parse(day+'T'+String(row.end_time||'00:00').slice(0,5)+':00Z');
 if(end<=start)end+=86400000;
 return [start,end];
}
export function intersects(a,b){const [as,ae]=interval(a),[bs,be]=interval(b);return as<be&&bs<ae;}
const name=p=>[p?.rank,p?.last_name].filter(Boolean).join(' ')||p?.email||'Officer';
async function all(entity,query={}){
 const rows=[];for(let skip=0;;skip+=1000){const page=await entity.filter(query,'id',1000,skip);rows.push(...page);if(page.length<1000)break;}return rows;
}
export async function syncFleet(entities,now=Date.now()){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(new Date(now));
 const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const [vehicles,users,shifts,assignments]=await Promise.all([
 all(entities.Vehicle),all(entities.User),all(entities.Schedule,{shift_date:{$gte:yesterday}}),all(entities.VehicleAssignment,{assignment_date:{$gte:yesterday}})
 ]);
 const result={created:0,updated:0,cancelled:0,conflicts:[]};
 const validShifts=shifts.filter(s=>!s.archived&&!s.is_open&&s.officer_email&&!['open','unassigned'].includes(clean(s.officer_email)));
 const desired=new Map();
 for(const shift of validShifts.sort((a,b)=>interval(a)[0]-interval(b)[0]||String(a.id).localeCompare(String(b.id)))){
  const officer=users.find(p=>clean(p.email)===clean(shift.officer_email));
  if(!officer||officer.termination_date)continue;
  const defaults=vehicles.filter(v=>v.assigned_to===officer.id);
  if(defaults.length!==1){if(defaults.length>1)result.conflicts.push({shift_id:shift.id,officer_name:name(officer),shift_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,reason:'Multiple default vehicles are assigned to this officer.'});continue;}
  const vehicle=defaults[0];
  if(clean(vehicle.status||'Active')!=='active'){result.conflicts.push({shift_id:shift.id,officer_name:name(officer),shift_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,reason:(vehicle.vehicle_id||'Vehicle')+' is unavailable for service.'});continue;}
  desired.set(shift.id,{shift,officer,vehicle});
 }
 // Cancel obsolete automatic reservations first, including reassigned/open/removed shifts.
 for(const row of assignments.filter(a=>a.assignment_source==='officer_default'&&a.status==='scheduled')){
  const next=desired.get(row.source_schedule_id);
  if(!next||next.vehicle.id!==row.vehicle_id){
   await entities.VehicleAssignment.update(row.id,{status:'cancelled'});row.status='cancelled';result.cancelled++;
  }
 }
 for(const {shift,officer,vehicle} of desired.values()){
  const existing=assignments.find(a=>a.source_schedule_id===shift.id&&a.assignment_source==='officer_default'&&a.status==='scheduled');
  const manual=assignments.find(a=>a.assignment_source!=='officer_default'&&a.status!=='cancelled'&&clean(a.primary_officer_email)===clean(shift.officer_email)&&a.assignment_date===shift.shift_date&&a.start_time===shift.start_time&&a.end_time===shift.end_time);
  if(manual){if(existing){await entities.VehicleAssignment.update(existing.id,{status:'cancelled'});existing.status='cancelled';result.cancelled++;}continue;}
  const conflict=assignments.find(a=>a.id!==existing?.id&&a.vehicle_id===vehicle.id&&a.status!=='cancelled'&&intersects(a,shift));
  if(conflict){
   if(existing){await entities.VehicleAssignment.update(existing.id,{status:'cancelled'});existing.status='cancelled';result.cancelled++;}
   result.conflicts.push({shift_id:shift.id,officer_name:name(officer),shift_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,reason:vehicle.vehicle_id+' is already reserved for an overlapping shift.'});continue;
  }
  const payload={assignment_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,vehicle_id:vehicle.id,vehicle_label:vehicle.vehicle_id,
   primary_officer_email:clean(officer.email),primary_officer_name:name(officer),partner_officer_email:shift.partner_officer_email||'',location:shift.location||'',
   status:'scheduled',assignment_source:'officer_default',source_schedule_id:shift.id,notes:'Automatically reserved from the officer default vehicle.'};
  if(existing){
   if(Object.entries(payload).some(([k,v])=>existing[k]!==v)){await entities.VehicleAssignment.update(existing.id,payload);Object.assign(existing,payload);result.updated++;}
  }else{const row=await entities.VehicleAssignment.create(payload);assignments.push({...payload,...row});result.created++;}
 }
 return result;
}
