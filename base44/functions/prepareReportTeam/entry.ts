import {createClientFromRequest} from 'npm:@base44/sdk';
import {portalSessionState} from '../../shared/portalLoginGuard.ts';
import {resolveReportTeam,teamReportEntities} from '../../shared/reportTeam.ts';
export default async function(req){
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
  if(!user?.id||user.disabled||user.termination_date)return Response.json({error:'Officer access required'},{status:403});
  if((await portalSessionState(req,sdk,user)).state==='invalid')return Response.json({error:'Sign in again'},{status:401});
  const roles=[user.role,...(user.additional_roles||[])].map(v=>String(v).toLowerCase());
  if(!roles.some(role=>['admin','officer','supervisor','dispatch','cad_access','full_access'].includes(role)))return Response.json({error:'Officer access required'},{status:403});
  if(user.user_type==='client'||String(user.rank).toLowerCase()==='client'||roles.includes('client'))return Response.json({error:'Officer access required'},{status:403});
  const body=await req.json(),entity=String(body.entity||'');
  if(!teamReportEntities.has(entity))return Response.json({error:'Unsupported report type'},{status:400});
  const input=body.data||{};
  const db=sdk.asServiceRole.entities.TeamReportWork;
  if(body.action==='cancel'){
   const work=await db.get(String(body.work_id||''));
   if(work.officer_id!==user.id)return Response.json({error:'Not your report work'},{status:403});
   if(work.work_token!==body.work_token)return Response.json({success:true});
   if(work.status==='in_progress')await db.update(work.id,{status:'cancelled'});
   return Response.json({success:true});
  }
  // Credit comes only from the authenticated reporter's schedule; never a client-supplied attachment list.
  const team=await resolveReportTeam(sdk,user,input);
  if(body.action==='start'){
   if(!team.team_schedule_ids?.length)return Response.json({team,work_id:null});
   const date=team.team_date,location=team.team_location;
   const key=[user.id,entity,team.team_schedule_ids[0],String(input.linked_call_id||'')].join(':');
   const existing=await db.filter({work_key:key},'-created_date',1);
   const value={work_token:String(body.work_token||'').slice(0,100),work_key:key,report_entity:entity,report_date:date,incident_date:input.incident_date||date,incident_time:input.incident_time||'',location,linked_call_id:String(input.linked_call_id||''),linked_call_number:String(input.linked_call_number||''),officer_email:user.email,officer_id:user.id,...team,status:'in_progress'};
   const work=existing[0]?await db.update(existing[0].id,value):await db.create(value);
   return Response.json({team,work_id:work.id});
  }
  return Response.json({team});
 }catch(error){return Response.json({error:error.message||'Unable to resolve scheduled report partners'},{status:500});}
}
