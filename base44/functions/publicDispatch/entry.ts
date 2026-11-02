import {createClientFromRequest} from 'npm:@base44/sdk';
const kinds=['Security assistance','Suspicious activity','Disturbance / noise','Trespassing','Theft / property damage','Welfare concern','Parking / access issue','Lost property','Other'];
const clean=(v:any,max=250)=>String(v||'').trim().slice(0,max);
export default async function(req:Request){
 try{
 const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities,b=await req.json();
 if(b.website)return Response.json({error:'Unable to accept this request.'},{status:400});
 const incident=clean(b.incident,80),location=clean(b.location,400),description=clean(b.description,5000),name=clean(b.caller_name,150),phone=clean(b.caller_phone,40),key=clean(b.request_id,80);
 if(!kinds.includes(incident)||location.length<8||description.length<15||!name||phone.replace(/\D/g,'').length<10||!/^[-\w]{20,80}$/.test(key)||b.acknowledged!==true)return Response.json({error:'Complete the incident, full address, description, name, callback number and acknowledgement.'},{status:400});
 const previous=await db.PublicDispatchRequest.filter({request_id:key},'-created_date',1);
 if(previous[0]?.reference)return Response.json({success:true,reference:previous[0].reference});
 if(previous.length)return Response.json({error:'This request is being processed. Please wait before retrying.'},{status:409});
 const address=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('cf-connecting-ip')||phone;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(address)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const recent=await db.PublicDispatchRequest.filter({source_hash:hash,created_date:{$gte:new Date(Date.now()-15*60*1000).toISOString()}},'-created_date',6);
 if(recent.length>=5)return Response.json({error:'Too many requests. Please call BlackPoint dispatch for assistance.'},{status:429});
 const reservation=await db.PublicDispatchRequest.create({request_id:key,source_hash:hash,status:'processing'});
 const details=[description,'Incident time: '+clean(b.incident_time,60),'Still happening: '+clean(b.ongoing,10),'People involved / descriptions: '+clean(b.people,1200),'Vehicles: '+clean(b.vehicles,1000),'Injuries / medical needs: '+clean(b.injuries,1000),'Weapons / safety hazards: '+clean(b.hazards,1000),'Safe callback: '+clean(b.safe_callback,20),'Access instructions: '+clean(b.access,1000)].join('\n\n');
 try{
 const result=await sdk.asServiceRole.functions.invoke('createDispatchCall',{data:{incident,location,cross_street:clean(b.cross_street,250),landmark:clean(b.landmark,250),description:details,caller_name:name,caller_phone:phone,hazards:clean(b.hazards,1000),agency:'BPS',source:'public_helpme',public_request_id:key,priority:b.injuries||b.hazards?'high':'medium'},selected_units:[]});
 const payload=result?.data||result;
 if(!payload?.success||!payload.call?.id)throw new Error('Dispatch did not confirm the call.');
 const reference=payload.call.bps_reference||payload.call.call_id;
 await db.PublicDispatchRequest.update(reservation.id,{status:'received',reference,call_id:payload.call.id});
 return Response.json({success:true,reference});
 }catch(error){await db.PublicDispatchRequest.update(reservation.id,{status:'needs_attention'}).catch(()=>null);return Response.json({error:'We could not confirm your request. Call BlackPoint dispatch; do not rely on this page for urgent assistance.'},{status:503});}
 }catch{return Response.json({error:'Unable to submit. Please retry or call dispatch.'},{status:500});}
}
