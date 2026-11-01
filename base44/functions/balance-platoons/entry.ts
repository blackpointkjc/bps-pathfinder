import { createClientFromRequest } from 'npm:@base44/sdk';
import { balancePlan,rosterVersion } from './plan.ts';
import { notifyPlatoonChange } from './notifyPlatoonChange.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  if(!user||user.disabled||user.termination_date||['suspended','denied','terminated'].includes(String(user.account_status||'').toLowerCase())||['suspended','terminated'].includes(String(user.employment_status||'').toLowerCase()))return false;
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
Deno.serve(async req=>{
 try {
 const client=createClientFromRequest(req),me=await client.auth.me().then(__limitFullAccess);
 const __portalCaller=await client.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,client,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await client.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||__portalCaller.termination_date||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 client.auth.me=async()=>__portalCaller;

 if(!me)return Response.json({error:'Unauthorized'},{status:401});
 if(me.role!=='admin'&&!(me.additional_roles||[]).includes('full_access'))return Response.json({error:'Administrator access required'},{status:403});
 const {action='preview',version}=await req.json();
 if(!['preview','apply'].includes(action))return Response.json({error:'Invalid action'},{status:400});
 const entities=client.asServiceRole.entities;
 const users=await entities.User.list('id',5000);
 if(users.length>=5000)return Response.json({error:'Roster too large for safe balancing'},{status:409});
 const plan=balancePlan(users),currentVersion=await rosterVersion(users);
 if(action==='preview')return Response.json({...plan,version:currentVersion});
 if(!version||version!==currentVersion)return Response.json({error:'Roster changed since preview. Generate a fresh preview.'},{status:409});
 if(plan.warnings.length)return Response.json({error:'Resolve missing command coverage before applying.',warnings:plan.warnings},{status:409});
 const applied=[],failed=[];
 for(const change of plan.changes){
  let saved=false;
  try {
   const before=await entities.User.get(change.id);
   const original=users.find(p=>p.id===change.id);
   if(!original || before.updated_date!==original.updated_date)throw new Error('Officer changed during apply. Preview again.');
   await entities.User.update(change.id,change.updates);saved=true;
   const after=await entities.User.get(change.id);
   if(Object.entries(change.updates).some(([k,v])=>String(after[k]||'')!==String(v)))throw new Error('Assignment persistence could not be verified');
   await notifyPlatoonChange(entities,before,after);
   applied.push(change.id);
  }catch(error:any){failed.push({id:change.id,assignment_saved:saved,error:error.message});break;}
 }
 return Response.json({success:!failed.length,applied,failed,remaining:plan.changes.length-applied.length-failed.length,...(failed.length?{error:'Balance stopped after a failure. Review saved assignments and notification status before generating another preview.'}:{})});
 }catch(error:any){return Response.json({error:error.message||'Balance failed'},{status:500});}
});
