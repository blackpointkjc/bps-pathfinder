import { createClientFromRequest } from 'npm:@base44/sdk';
Deno.serve(async req=>{
 try {
  const api=createClientFromRequest(req),user=await api.auth.me();
  if(!user||user.termination_date)return Response.json({error:'Sign in required'},{status:401});
  const body=await req.json();
  if(!/^[a-zA-Z0-9:_-]{1,160}$/.test(body.id||'')||!body.data||typeof body.data!=='object'||JSON.stringify(body.data).length>1000000)return Response.json({error:'Invalid or oversized offline draft'},{status:400});
  const deviceId='work:'+body.id;
  const existing=await api.entities.OfflineSync.filter({created_by_id:user.id,device_id:deviceId,sync_type:'offline_work'},'-last_edited',1);
  const lastEdited=new Date(Number(body.updatedAt)).toISOString();
  if(existing[0]&&Date.parse(existing[0].last_edited)>Date.parse(lastEdited))return Response.json({error:'A newer cloud draft exists. Local work was retained.'},{status:409});
  const data={sync_type:'offline_work',entity_type:String(body.title||'Field notes').slice(0,100),draft_data:{...body.data,_offline_revision:body.revision},device_id:deviceId,last_edited:lastEdited,synced:true};
  const saved=existing[0]?await api.entities.OfflineSync.update(existing[0].id,data):await api.entities.OfflineSync.create(data);
  return Response.json({success:true,id:saved.id});
 }catch(error){return Response.json({error:error?.message||'Draft sync failed'},{status:500});}
});
