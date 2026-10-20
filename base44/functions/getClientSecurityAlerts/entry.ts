import { createClientFromRequest } from 'npm:@base44/sdk';
const key=(value:any)=>String(value||'').trim().toLowerCase();
const siteKey=(value:any)=>key(String(value||'').split(/\s*(?::|\s-\s)\s*/)[0]);
Deno.serve(async req=>{
 try{
  const api=createClientFromRequest(req),actor=await api.auth.me().catch(()=>null);
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
