import { createClientFromRequest } from 'npm:@base44/sdk';
Deno.serve(async req=>{
 try{
 const client=createClientFromRequest(req),me=await client.auth.me();
 if(!me)return Response.json({error:'Unauthorized'},{status:401});
 const roles=new Set((me.additional_roles||[]).map((r:string)=>r.toLowerCase()));
 if(me.role!=='admin'&&me.role!=='dispatch'&&me.dispatch_role!==true&&!['full_access','dispatch','dispatcher','supervisor'].some(r=>roles.has(r)))return Response.json({error:'Dispatch or command access required'},{status:403});
 const {call_id,archive_id,property_alert_id,property_id,notes=''}=await req.json();
 if((!call_id&&!archive_id&&!property_alert_id)||!property_id)return Response.json({error:'Select a call and property'},{status:400});
 const db=client.asServiceRole.entities;
 const call=call_id?await db.DispatchCall.get(call_id).catch(()=>null):null;
 const archived=!call?(archive_id?await db.CallHistory.get(archive_id).catch(()=>null):(await db.CallHistory.filter({original_call_id:call_id},'-archived_date',1))[0]):null;
 const alert=!call&&!archived&&property_alert_id?await db.PropertyAlert.get(property_alert_id).catch(()=>null):null;
 const row=call||archived||(alert?{id:alert.callId||alert.id,original_call_id:alert.callId||'',call_id:alert.cadNumber||'',incident:alert.callIncident||'',location:alert.callLocation||'',time_received:alert.callTime||alert.created_date,status:alert.callStatus||'Closed'}:null);
 if(!row)return Response.json({error:'Call record not found'},{status:404});
 const property=await db.Location.get(property_id).catch(()=>null);
 if(!property)return Response.json({error:'Property not found'},{status:404});
 const identity=String(row.original_call_id||row.id);
 const existing=await db.PropertyCallLink.filter({call_id:identity,property_id},'-created_date',1);
 if(existing.length)return Response.json({success:true,duplicate:true,link:existing[0]});
 const valid=(value:any)=>{const text=String(value||'').trim();return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);};
 let number=[row.agency_cad_number,row.bps_reference,row.call_id].find(valid);
 if(!number){
  const response=await client.asServiceRole.functions.invoke('ensure-cad-references',{records:[{entity:call?'DispatchCall':archived?'CallHistory':'PropertyAlert',id:call?.id||archived?.id||alert?.id}]});
  const data=response?.data||response||{};number=data.mappings?.[0]?.reference;
  if(!number)throw new Error(data.error||'The CAD reference could not be saved. Retry linking this call.');
 }
 const link=await db.PropertyCallLink.create({call_id:identity,archive_id:archived?.id||'',call_number:number,property_id,property_name:property.site_name||property.name||property.address||'Property',incident:row.incident||'',location:row.location||'',time_received:row.time_received||row.created_date,status:row.status||'',linked_by:me.email,linked_at:new Date().toISOString(),notes:String(notes).slice(0,1000)});
 return Response.json({success:true,link});
 }catch(error:any){return Response.json({error:error.message||'Property link failed'},{status:500});}
});
