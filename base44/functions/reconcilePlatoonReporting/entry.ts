import { createClientFromRequest } from 'npm:@base44/sdk';
import { autoReportingSelection, reportingFields } from './autoReporting.ts';
const norm=(value:any)=>String(value||'').trim().toLowerCase();
Deno.serve(async req=>{
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
  if(!user)return Response.json({error:'Authentication required'},{status:401});
  const roles=new Set([user.role,...(user.additional_roles||[])].map(norm));
  if(!roles.has('admin')&&!roles.has('full_access'))return Response.json({error:'Only administrators may reconcile reporting links'},{status:403});
  const body=await req.json().catch(()=>({}));
  const region=norm(body.region),platoon=norm(body.platoon);
  if(!region||!platoon||platoon==='command')return Response.json({error:'Choose an operating Region and Platoon'},{status:400});
  const roster=await sdk.asServiceRole.entities.User.list('-updated_date',1000);
  const order=['captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'];
  const members=(roster||[]).filter((person:any)=>norm(person.division)===region&&norm(person.platoon)===platoon
    &&!person.termination_date&&norm(person.employment_status)!=='terminated'
    &&order.includes(norm(person.rank))).sort((a:any,b:any)=>order.indexOf(norm(a.rank))-order.indexOf(norm(b.rank))
      ||Number(a.badge_number||99999)-Number(b.badge_number||99999)||String(a.id).localeCompare(String(b.id)));
  let changed=0,unchanged=0;
  for(const person of members){
    const next=reportingFields(autoReportingSelection(person,roster));
    const dirty=Object.entries(next).some(([field,value])=>String(person[field]||'')!==String(value||''));
    if(!dirty){unchanged++;continue;}
    if(changed>=25)break; // avoid burdening CAD and the live API limiter
    await sdk.asServiceRole.entities.User.update(person.id,next);
    Object.assign(person,next);
    changed++;
  }
  const remaining=members.length-unchanged-changed;
  return Response.json({success:true,region:body.region,platoon:body.platoon,changed,unchanged,remaining,complete:remaining===0});
 }catch(error:any){console.error('reconcilePlatoonReporting failed',error);return Response.json({error:'Reporting reconciliation could not finish. Retry when the service limit clears.'},{status:503});}
});
