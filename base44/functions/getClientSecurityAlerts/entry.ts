const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const key=(value:any)=>String(value||'').trim().toLowerCase();
const siteKey=(value:any)=>key(String(value||'').split(/\s*(?::|\s-\s)\s*/)[0]);
Deno.serve(async req=>{
 try{
  const api=createClientFromRequest(req),actor=await api.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
 const __portalCaller=await api.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
 let __portalService=false;if(!__portalCaller&&req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
 if((!__portalCaller&&!__portalService)||(__portalCaller&&((__portalCaller.additional_roles||[]).includes('visitor')||__portalCaller.disabled||__portalCaller.termination_date||String(__portalCaller.employment_status||'').toLowerCase()==='terminated'||(!__portalCaller.is_service&&__portalCaller.role!=='admin'&&!(__portalCaller.additional_roles||[]).length&&!['investigator','reviewer'].includes(__portalCaller.ps_role)))))return Response.json({error:'Approved portal access required'},{status:403});
 api.auth.me=async()=>__portalCaller;

  if(!actor)return Response.json({error:'Sign in required'},{status:401});
  const roles=new Set((actor.additional_roles||[]).map(key)),preview=actor.role==='admin'||roles.has('full_access');
  if(!preview&&!roles.has('client')&&key(actor.rank)!=='client'&&key(actor.user_type)!=='client')return Response.json({error:'Client access required'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(body.client_id&&!preview&&String(body.client_id)!==String(actor.id))return Response.json({error:'Another client account cannot be requested'},{status:403});
  const client=body.client_id&&preview?await api.asServiceRole.entities.User.get(String(body.client_id)):actor;
  if(!client)return Response.json({error:'Client not found'},{status:404});
  if(body.client_id&&preview&&![client.rank,client.user_type,...(client.additional_roles||[])].some(v=>key(v)==='client'))return Response.json({error:'Select a client account for preview'},{status:400});
  const locations=await api.asServiceRole.entities.Location.list('site_name',1000);
  const assigned=new Set([...(client.assigned_locations||[]),...(client.assigned_sites||[]),client.assigned_location].filter(Boolean).map(siteKey));
  const visible=locations.filter((site:any)=>assigned.has(siteKey(site.site_name))||[site.assigned_client_email,site.billing_contact_email].some(v=>v&&key(v)===key(client.email)));
  const ids=new Set(visible.map((s:any)=>String(s.id)));
  visible.forEach((site:any)=>assigned.add(siteKey(site.site_name)));
  if(!assigned.size)return Response.json({success:true,alerts:[],locations:[],source_errors:[],as_of:new Date().toISOString()});
  const errors:string[]=[];
  const read=async(label:string,loader:()=>Promise<any[]>)=>{
   for(let attempt=0;attempt<2;attempt++){try{return await loader();}catch(error){if(attempt===0){await new Promise(resolve=>setTimeout(resolve,650));continue;}errors.push(label);}}
   return [];
  };
  const security=await read('security notices',()=>api.asServiceRole.entities.SecurityAlert.list('-created_date',2000));
  const property=await read('CAD property alerts',()=>api.asServiceRole.entities.PropertyAlert.filter({$or:[{propertyId:{$in:[...ids]}},{propertyName:{$in:visible.map((s:any)=>s.site_name)}}]},'-created_date',2000));
  const closed=/^(resolved|closed|cleared|cancelled|canceled|completed|false_alarm)$/i;
  const severity=(value:any)=>({urgent:'high','1':'critical','2':'high','3':'medium','4':'low'}[key(value)]||(['critical','high','medium','low'].includes(key(value))?key(value):'medium'));
  const alerts=[
   ...security.filter((row:any)=>assigned.has(siteKey(row.location))).map((row:any)=>({id:'security:'+row.id,location:row.location,alert_type:row.alert_type||'incident',severity:severity(row.severity),description:row.description||'',status:closed.test(row.status)?'resolved':'active',created_date:row.alert_time||row.created_date,resolved_time:row.resolved_time||null,resolution_notes:row.resolution_notes||'',source:'Security notice'})),
   ...property.filter((row:any)=>(ids.has(String(row.propertyId))||assigned.has(siteKey(row.propertyName)))&&!row.is_test&&!['test','false_alarm'].includes(key(row.lifecycle_status))).map((row:any)=>({id:'property:'+row.id,location:row.propertyName,alert_type:'incident',severity:severity(row.callPriority),description:[row.callIncident,row.callLocation].filter(Boolean).join(' · '),status:closed.test(row.lifecycle_status)||closed.test(row.callStatus)?'resolved':'active',created_date:row.callTime||row.time_received||row.created_date,resolved_time:row.resolved_at||null,resolution_notes:row.resolution_reason||'',reference:row.cadNumber||'',source:'CAD property alert'}))
  ].filter(row=>row.status==='active'||Date.parse(row.resolved_time||row.created_date)>=Date.now()-30*86400000).sort((a,b)=>Date.parse(b.created_date)-Date.parse(a.created_date));
  return Response.json({success:true,alerts,locations:visible.map((s:any)=>({id:s.id,site_name:s.site_name,time_zone:s.time_zone||'America/New_York'})),source_errors:errors,as_of:new Date().toISOString()});
 }catch(error:any){return Response.json({error:error?.message||'Security alerts unavailable'},{status:500});}
});
