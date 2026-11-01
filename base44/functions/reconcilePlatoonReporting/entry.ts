import { createClientFromRequest } from 'npm:@base44/sdk';
import { autoReportingSelection, reportingFields } from './autoReporting.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<30*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const norm=(value:any)=>String(value||'').trim().toLowerCase();
Deno.serve(async req=>{
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me().then(__limitFullAccess).catch(()=>null);
 const __portalCaller=await sdk.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,sdk,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await sdk.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||__portalCaller.termination_date||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 sdk.auth.me=async()=>__portalCaller;

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
