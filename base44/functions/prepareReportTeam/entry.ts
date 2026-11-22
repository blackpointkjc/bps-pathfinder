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
  const body=await req.json(),entity=String(body.entity||'');
  if(!teamReportEntities.has(entity))return Response.json({error:'Unsupported report type'},{status:400});
  const input=body.data||{};
  // Credit comes only from the authenticated reporter's schedule; never a client-supplied attachment list.
  const team=await resolveReportTeam(sdk,user,input);
  return Response.json({team});
 }catch(error){return Response.json({error:error.message||'Unable to resolve scheduled report partners'},{status:500});}
}
