import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
const str=(v:any)=>String(v??'').trim();
const num=(v:any)=>Number(v);
const lower=(v:any)=>str(v).toLowerCase();
const own=(o:any,k:string)=>Object.prototype.hasOwnProperty.call(o||{},k);
const asRows=(v:any)=>Array.isArray(v)?v:Array.isArray(v?.items)?v.items:[];
const safeDate=(value:any)=>{const t=Date.parse(str(value));return Number.isFinite(t)?t:null;};
function supervisorQualified(u:any){
  const roles=new Set((u?.additional_roles||[]).map(lower));
  return u?.role==='admin'||u?.is_supervisor===true||roles.has('supervisor')||roles.has('full_access');
}
const label=(u:any)=>[u.rank,u.last_name].filter(Boolean).join(' ')||u.full_name||u.email||'Officer';
function taskDescription(row:any,officer:any,supervisor:any){
  const start=new Date(row.started_at).toLocaleString('en-US',{timeZone:'America/New_York'});
  const end=row.ended_at?new Date(row.ended_at).toLocaleString('en-US',{timeZone:'America/New_York'}):'Still active';
  return [
    'AUTOMATIC GPS SPEED MONITORING — REQUIRES SUPERVISOR REVIEW',
    'GPS-observed behavior only. Road matching and GPS readings may have errors; do not treat this record alone as a verified traffic offense or disciplinary finding.',
    'Officer: '+label(officer),
    'Assigned supervisor: '+(supervisor?label(supervisor):'Command review queue (unassigned)'),
    'Road: '+(row.road_name||'Road not identified'),
    'Mapped posted limit: '+row.speed_limit_mph+' mph ('+row.speed_limit_source+')',
    'Highest recorded vehicle speed: '+row.max_speed_mph.toFixed(1)+' mph',
    'Maximum recorded overage: '+row.max_over_mph.toFixed(1)+' mph',
    'GPS-reported duration above 5 mph over: '+Math.round(row.duration_seconds)+' seconds',
    'Time over 10 mph above limit (consecutive samples): '+Math.round(row.critical_duration_seconds)+' seconds',
    'Distance measured from accepted GPS fixes during event: '+row.distance_miles.toFixed(3)+' miles',
    'Started: '+start+' Eastern; Ended: '+end,
    'GPS source: '+(row.gps_source||'Device location')+'; GPS accuracy: '+row.gps_accuracy_m+' meters; Samples: '+row.samples,
    'Status: '+row.status,
    'Review camera, vehicle telematics, road signs and any emergency response exemptions before concluding misconduct.',
    'Event reference: '+row.event_id
  ].join('\n');
}
export default async function(req:Request):Promise<Response>{
  try{
    const api=createClientFromRequest(req);
    const signed=await api.auth.me().catch(()=>null);
    if(!signed?.id)return Response.json({error:'Sign-in required'},{status:401});
    const payload=await req.json().catch(()=>({}));
    const eventId=str(payload.event_id);
    const started=safeDate(payload.started_at),ended=safeDate(payload.ended_at);
    if(!/^[a-zA-Z0-9-]{10,90}$/.test(eventId)||!started||started>Date.now()+10000||started<Date.now()-48*3600000)
      return Response.json({error:'Invalid event identifier or timestamp'},{status:400});
    const duration=num(payload.duration_seconds),criticalSeconds=num(payload.critical_duration_seconds),distance=num(payload.distance_miles);
    const maxSpeed=num(payload.max_speed_mph),limit=num(payload.speed_limit_mph),maxOver=num(payload.max_over_mph);
    const accuracy=num(payload.gps_accuracy_m),samples=num(payload.samples);
    const source=str(payload.speed_limit_source).slice(0,110);
    if(![duration,criticalSeconds,distance,maxSpeed,limit,maxOver,accuracy,samples].every(Number.isFinite)
      ||duration<10||duration>24*3600||criticalSeconds<10||criticalSeconds>duration
      ||distance<0||distance>duration/3600*135*1.15||maxSpeed<limit+10
      ||maxSpeed>135||limit<10||limit>90||maxOver<10||maxOver>135
      ||accuracy<0||accuracy>50||samples<2||samples>100000
      ||!/(virginia dot|tomtom|openstreetmap posted)/i.test(source))
      return Response.json({error:'Speed telemetry does not meet the verified reporting thresholds'},{status:400});
    if(ended && (ended<started||ended>Date.now()+10000))return Response.json({error:'Invalid event end time'},{status:400});
    const officer=await api.asServiceRole.entities.User.get(signed.id);
    if(!officer||lower(officer.email)!==lower(signed.email))return Response.json({error:'Employee account not verified'},{status:403});
    if(officer.user_type==='client'||lower(officer.employment_status)==='terminated')return Response.json({error:'No active patrol permissions'},{status:403});
    const existing=asRows(await api.asServiceRole.entities.PatrolSpeedingEvent.filter({event_id:eventId,officer_id:officer.id},'-created_date',1));
    let supervisor=null;
    if(officer.supervisor_id && String(officer.supervisor_id)!==String(officer.id))
      supervisor=await api.asServiceRole.entities.User.get(officer.supervisor_id).catch(()=>null);
    if(!supervisorQualified(supervisor)||supervisor?.termination_date||supervisor?.id===officer.id)supervisor=null;
    if(!supervisor&&officer.next_level_supervisor_id&&officer.next_level_supervisor_id!==officer.id)
      supervisor=await api.asServiceRole.entities.User.get(officer.next_level_supervisor_id).catch(()=>null);
    if(!supervisorQualified(supervisor)||supervisor?.termination_date||supervisor?.id===officer.id)supervisor=null;
    if(!supervisor){
      const roster=asRows(await api.asServiceRole.entities.User.list('-updated_date',300)).filter((u:any)=>
        u?.id!==officer.id && supervisorQualified(u) && !u.termination_date && u.email);
      const samePlatoon=roster.filter((u:any)=>officer.platoon && lower(u.platoon)===lower(officer.platoon));
      supervisor=samePlatoon.find((u:any)=>u.role==='admin'||u.is_supervisor===true)||
        roster.find((u:any)=>u.role==='admin')||null;
    }
    // Use current HR command before fallback. Never assign an officer to review themselves.
    const state=payload.completed===true?'completed':'active';
    const fields={
      status:state,started_at:new Date(started).toISOString(),
      ended_at:state==='completed'?new Date(ended||Date.now()).toISOString():'',
      duration_seconds:Math.round(duration),
      critical_duration_seconds:Math.round(criticalSeconds),
      distance_miles:Math.round(distance*10000)/10000,
      max_speed_mph:Math.round(maxSpeed*10)/10,speed_limit_mph:Math.round(limit),
      max_over_mph:Math.round(maxOver*10)/10,
      road_name:str(payload.road_name).slice(0,140),speed_limit_source:source,
      gps_source:str(payload.gps_source).slice(0,55),gps_accuracy_m:Math.round(accuracy),
      samples:Math.round(samples),review_required:true,last_reported_at:new Date().toISOString(),
    };
    let record=existing[0]||null;
    if(record){
      // Keep monotone event metrics across retries and out-of-order requests.
      const update={
        ...fields,
        status:record.status==='completed'?'completed':state,
        duration_seconds:Math.max(num(record.duration_seconds)||0,fields.duration_seconds),
        critical_duration_seconds:Math.max(num(record.critical_duration_seconds)||0,fields.critical_duration_seconds),
        distance_miles:Math.max(num(record.distance_miles)||0,fields.distance_miles),
        max_speed_mph:Math.max(num(record.max_speed_mph)||0,fields.max_speed_mph),
        max_over_mph:Math.max(num(record.max_over_mph)||0,fields.max_over_mph),
        samples:Math.max(num(record.samples)||0,fields.samples),
      };
      record=await api.asServiceRole.entities.PatrolSpeedingEvent.update(record.id,update);
    }else{
      record=await api.asServiceRole.entities.PatrolSpeedingEvent.create({
        event_id:eventId,officer_id:officer.id,officer_email:officer.email,
        officer_name:label(officer),supervisor_id:supervisor?.id||'',
        supervisor_email:supervisor?.email||'',supervisor_name:supervisor?label(supervisor):'',
        ...fields
      });
    }
    let taskId=str(record.task_id);
    const description=taskDescription(record,officer,supervisor);
    const task={
      title:'GPS speeding review · '+label(officer)+' · '+record.max_speed_mph+' mph / '+record.speed_limit_mph+' mph limit',
      description,status:'open',priority:'high',
      assigned_to:supervisor?.id||'',assigned_name:supervisor?label(supervisor):'Command review needed',
      related_type:'general',related_id:record.id,related_name:label(officer),
      notes:'Automatically generated GPS speed exception; supervisor must verify evidence before any action.'
    };
    if(taskId){
      await api.asServiceRole.entities.Task.update(taskId,{
        title:task.title,description:task.description,priority:'high',
        related_id:record.id,related_name:task.related_name
      });
    }else{
      const made=await api.asServiceRole.entities.Task.create(task);taskId=made.id;
      await api.asServiceRole.entities.PatrolSpeedingEvent.update(record.id,{task_id:taskId});
      const notify=supervisor?.email||officer.next_level_supervisor_email;
      if(notify)await api.asServiceRole.entities.Notification.create({
        recipient_email:notify,type:'supervisor_task',title:'GPS patrol-speed review assigned',
        message:label(officer)+' GPS report: '+record.max_speed_mph+' mph in mapped '+record.speed_limit_mph+
          ' mph zone, '+Math.round(record.duration_seconds)+' seconds and '+record.distance_miles.toFixed(3)+
          ' miles recorded. Verify GPS and posted-limit evidence; task auto-assigned.',
        is_read:false,related_id:taskId,priority:'high',
        event_key:'patrol_speeding:'+eventId,task_key:'patrol_speeding:'+eventId,
        source_name:'Patrol GPS Safety'
      }).catch(()=>null);
    }
    return Response.json({success:true,event_id:eventId,task_id:taskId,assigned_to:supervisor?.id||null,completed:state==='completed'});
  }catch(error:any){
    return Response.json({error:'Could not record patrol-speed exception for supervisor review',detail:str(error?.message).slice(0,120)},{status:500});
  }
}