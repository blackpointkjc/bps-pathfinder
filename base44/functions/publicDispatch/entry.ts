import {createClientFromRequest} from 'npm:@base44/sdk';
// Shared server-only TomTom first-choice geocoder for CAD/dispatch, properties,
// and PulsePoint; never send either service key to the browser.
const bounds = { minLat: 36.0, maxLat: 39.6, minLon: -83.8, maxLon: -75.0 };
export async function tomtomGeocode(address: string, options: { strictNumber?: boolean } = {}) {
  const query = String(address || '').trim();
  if (query.length < 5 || /^(?:unknown|address unavailable|unassigned|n\/a)$/i.test(query)) return null;
  const expectedNumber = query.match(/^\s*(\d{1,6})\b/)?.[1] || '';
  const keys = [...new Set([Deno.env.get('TOMTOM_API_KEY'),Deno.env.get('TOMTOM_API_KEY_BACKUP')].filter(Boolean))];
  for (const key of keys) {
    const params = new URLSearchParams({ key: String(key), limit: '5', countrySet: 'US', language: 'en-US', typeahead: 'false' });
    const endpoint = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`;
    let response: Response;
    try { response = await fetch(endpoint, { signal: AbortSignal.timeout(4200), headers: { Accept: 'application/json' } }); }
    catch { continue; }
    if (!response.ok) {
      if ([401,403,408,429,500,502,503,504].includes(response.status)) continue;
      break;
    }
    const data = await response.json().catch(() => null);
    for (const item of data?.results || []) {
      const lat = Number(item.position?.lat), lon = Number(item.position?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < bounds.minLat || lat > bounds.maxLat || lon < bounds.minLon || lon > bounds.maxLon) continue;
      const roadAddress = String(item.address?.freeformAddress || '');
      const candidateNumber = String(item.address?.streetNumber || '');
      const candidateType = String(item.type || '').toLowerCase();
      if (expectedNumber && options.strictNumber !== false && candidateNumber !== expectedNumber) continue;
      // Reject POI/city-only results when the caller needs an exact numbered address.
      if (expectedNumber && !candidateType.includes('address') && candidateNumber !== expectedNumber) continue;
      return { latitude: lat, longitude: lon, lat, lon,
        formatted_address: roadAddress || query, geo_method:'tomtom',
        geo_confidence: expectedNumber && candidateNumber === expectedNumber ? 'high' : 'medium',
        geo_approximate: !expectedNumber || candidateNumber !== expectedNumber,
        provider:'TomTom Search' };
    }
    return null;
  }
  return null;
}
const kinds=['Security assistance','Suspicious activity','Disturbance / noise','Trespassing','Theft / property damage','Welfare concern','Parking / access issue','Lost property','Other'];
const clean=(v:any,max=250)=>String(v||'').trim().slice(0,max);
const invalid=(field:string,error:string)=>Response.json({error,field},{status:400});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function allocateReference(db:any){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const period=parts.find(p=>p.type==='year')!.value+parts.find(p=>p.type==='month')!.value;
 const key='bps_dispatch_call:'+period,entity=db.CadCounter;
 for(let attempt=0;attempt<4;attempt++){
  let row=(await entity.filter({counter_key:key},'-created_date',1))[0];
  if(!row){try{row=await entity.create({counter_key:key,last_number:0});}catch{await sleep(180);continue;}}
  const token=crypto.randomUUID(),now=new Date().toISOString();
  const claimed=await entity.updateMany({id:row.id,$or:[{ingestion_locked_until:{$exists:false}},{ingestion_locked_until:null},{ingestion_locked_until:{$lte:now}}]},{$set:{ingestion_lock_token:token,ingestion_locked_until:new Date(Date.now()+12000).toISOString()}});
  if(claimed.updated!==1){await sleep(180);continue;}
  try{
   const current=await entity.get(row.id);
   if(current?.ingestion_lock_token!==token)continue;
   const next=Number(current.last_number||0)+1;
   if(next>99999999)throw new Error('CAD reference capacity reached');
   await entity.update(row.id,{last_number:next,ingestion_lock_token:'',ingestion_locked_until:new Date(0).toISOString()});
   return `BPS-${period}-${next}`;
  }finally{
   await entity.updateMany({id:row.id,ingestion_lock_token:token},{$set:{ingestion_lock_token:'',ingestion_locked_until:new Date(0).toISOString()}}).catch(()=>null);
  }
 }
 throw new Error('CAD reference allocator is busy. Try submitting again.');
}

export default async function(req:Request){
 try{
 const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities,b=await req.json();
 if(b?.action==='request_status'){
   const requestId=clean(b.request_id,80);
   if(!/^[-\w]{20,80}$/.test(requestId))return invalid('request_id','Invalid request reference.');
   const recorded=(await db.PublicDispatchRequest.filter({request_id:requestId},'-created_date',1))[0];
   const call=(await db.DispatchCall.filter({public_request_id:requestId},'-created_date',1))[0];
   const reference=call?.bps_reference||call?.call_id||recorded?.reference||'';
   return Response.json({success:Boolean(reference),reference:reference||null,status:reference?'received':'pending'});
 }
 if(b?.action==='form_config')return Response.json({
   version:'helpme-2026-11-02-v2',service:'helpme',categories:kinds,
   fields:[
     {name:'incident',type:'select',label:'Type of assistance',required:true,options:kinds},
     {name:'incident_time',type:'datetime-local',label:'When did this happen?',required:true},
     {name:'ongoing',type:'select',label:'Is this happening now?',options:['Yes','No','Unknown']},
     {name:'description',type:'textarea',label:'Describe what happened',required:true,minLength:15,maxLength:5000},
     {name:'location',type:'text',label:'Full street address, city and state',required:true,minLength:8,maxLength:400},
     {name:'cross_street',type:'text',label:'Nearest cross street'},
     {name:'landmark',type:'text',label:'Building, apartment or landmark'},
     {name:'access',type:'textarea',label:'Entry instructions / where to meet you'},
     {name:'people',type:'textarea',label:'People and descriptions'},
     {name:'vehicles',type:'textarea',label:'Vehicles, plates and direction of travel'},
     {name:'injuries',type:'textarea',label:'Injuries or medical needs'},
     {name:'hazards',type:'textarea',label:'Weapons, threats or hazards'},
     {name:'caller_name',type:'text',label:'Your name',required:true,maxLength:150},
     {name:'caller_phone',type:'tel',label:'Callback phone number',required:true,minLength:10,maxLength:40},
     {name:'safe_callback',type:'select',label:'Is it safe to call you?',options:['Yes','No']},
     {name:'acknowledged',type:'checkbox',label:'I understand this is a security assistance request and will call 911 in an emergency.',required:true}
   ],sections:[
     {title:'01 · What is happening?',fields:['incident','incident_time','ongoing','description']},
     {title:'02 · Where should help go?',fields:['location','cross_street','landmark','access']},
     {title:'03 · Safety and people involved',fields:['people','vehicles','injuries','hazards']},
     {title:'04 · Contact details',fields:['caller_name','caller_phone','safe_callback','acknowledged']}
   ],notice:'For emergencies and immediate danger call 911. Submission does not guarantee an officer is en route.'
 });

 if(b.website)return Response.json({error:'Unable to accept this request.'},{status:400});
 const incident=clean(b.incident,80),location=clean(b.location,400),description=clean(b.description,5000),name=clean(b.caller_name,150),phone=clean(b.caller_phone,40),key=clean(b.request_id,80);
 if(!kinds.includes(incident))return invalid('incident','Select the type of assistance needed.');
 if(location.length<8)return invalid('location','Enter the full street address, city, and state (at least eight characters).');
 if(description.length<15)return invalid('description','Describe what happened in at least 15 characters.');
 if(!name)return invalid('caller_name','Enter your name so dispatch knows who is requesting assistance.');
 if(phone.replace(/\D/g,'').length<10)return invalid('caller_phone','Enter a callback number with at least 10 digits.');
 if(b.acknowledged!==true)return invalid('acknowledged','Check the emergency-services acknowledgement.');
 if(!/^[-\w]{20,80}$/.test(key))return invalid('request_id','Your form session has expired. Refresh the page and try again.');
 const previous=await db.PublicDispatchRequest.filter({request_id:key},'-created_date',1);
 if(previous[0]?.reference&&previous[0]?.status==='received')return Response.json({success:true,reference:previous[0].reference});
 if(previous.length){const call=(await db.DispatchCall.filter({public_request_id:key},'-created_date',1))[0];if(call){const reference=call.bps_reference||call.call_id;await db.PublicDispatchRequest.update(previous[0].id,{status:'received',reference,call_id:call.id});return Response.json({success:true,reference});}if(previous[0].status!=='needs_attention')return Response.json({error:'This request is being processed. Please wait before retrying.'},{status:409});}
 const address=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('cf-connecting-ip')||phone;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(address)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const recent=await db.PublicDispatchRequest.filter({source_hash:hash,created_date:{$gte:new Date(Date.now()-15*60*1000).toISOString()}},'-created_date',6);
 if(recent.length>=5)return Response.json({error:'Too many requests. Please call BlackPoint dispatch for assistance.'},{status:429});
 const reservation=previous[0]?.status==='needs_attention'?await db.PublicDispatchRequest.update(previous[0].id,{status:'processing'}):await db.PublicDispatchRequest.create({request_id:key,source_hash:hash,status:'processing'});
 const details=[description,'Incident time: '+clean(b.incident_time,60),'Still happening: '+clean(b.ongoing,10),'People involved / descriptions: '+clean(b.people,1200),'Vehicles: '+clean(b.vehicles,1000),'Injuries / medical needs: '+clean(b.injuries,1000),'Weapons / safety hazards: '+clean(b.hazards,1000),'Safe callback: '+clean(b.safe_callback,20),'Access instructions: '+clean(b.access,1000)].join('\n\n');
 try{
 // A public submission must not pass through staff-authenticated createDispatchCall.
 // Create a genuine DispatchCall under the server role, with the same CAD
 // sequence, and return success only after the call has been persisted.
 const recovered=await db.DispatchCall.filter({public_request_id:key},'-created_date',1);
 let call=recovered[0];
 if(!call){
  const now=new Date().toISOString();
  const reference=await allocateReference(db);
  const geo=await tomtomGeocode(location).catch(()=>null);
  call=await db.DispatchCall.create({
   incident,location,cross_street:clean(b.cross_street,250),landmark:clean(b.landmark,250),
   description:details,caller_name:name,caller_phone:phone,hazards:clean(b.hazards,1000),
   agency:'BPS',source:'public_helpme',public_request_id:key,
   bps_reference:reference,call_id:reference,cad_number_source:'bps_internal',
   priority:clean(b.injuries)||clean(b.hazards)?'high':'medium',status:'New',
   assigned_units:[],time_received:now,...(geo?{latitude:geo.latitude,longitude:geo.longitude,geo_method:'tomtom',geo_confidence:geo.geo_confidence,geo_approximate:geo.geo_approximate}:{})
  });
 }
 const reference=call.bps_reference||call.call_id;
 await db.PublicDispatchRequest.update(reservation.id,{status:'received',reference,call_id:call.id});
 // Persist a durable dispatch event before invoking the assignment evaluator.
 // This lets the existing monitor retry if an inner function fails or is rate-limited.
 let alert=(await db.PropertyAlert.filter({callId:call.id,propertyId:'public-helpme'},'-created_date',1))[0];
 if(!alert){
  alert=await db.PropertyAlert.create({callId:call.id,propertyId:'public-helpme',propertyName:'Public request for assistance',callIncident:call.incident,callLocation:call.location,callPriority:call.priority,callStatus:call.status,cadNumber:reference,callTime:call.time_received,time_received:call.time_received,source_key:'public-helpme:'+call.id,distanceMeters:0,acknowledged:false,lifecycle_status:'active'});
 }
 // A durable property-style announcement for Help Me calls. It shares the
 // same CAD audio transport as monitored GRAC property calls. Its unique event
 // key avoids suppressing officer speech with the generic new_call receipt.
 const eventKey=`public-helpme:${call.id}:property-alert`;
 const existingAnnouncement=await db.CallStatusLog.filter({event_key:eventKey},'-created_date',1);
 if(!existingAnnouncement.length)await db.CallStatusLog.create({
   call_id:call.id,incident_type:call.incident,location:call.location,
   old_status:'',new_status:call.status,unit_name:'Help Me website',
   notes:'Help Me website: new property call for service.',
   latitude:call.latitude,longitude:call.longitude,
   event_key:eventKey,event_type:'property_alert',
   announcement_text:`New property call for service from the Help Me website. ${call.incident}. Location ${call.location}. Priority ${call.priority}. CAD number ${reference}.`,
   announcement_priority:'high',cad_number:reference,triggering_action:'publicDispatch.property_alert',
   audio_enabled:true,sensitive:false,
 });
 // Assignment must still respect live dispatcher presence, unit eligibility,
 // verified GPS and operational safety constraints; never fabricate an officer.
 try{
  const evaluated=await sdk.asServiceRole.functions.invoke('geofenceDispatchAssignment',{call_id:call.id,property_alert_id:alert.id,public_fallback:true});
  const result=evaluated?.data||evaluated;
  if(result?.error||result?.skipped)console.error('Public CAD auto-dispatch evaluation deferred',result?.error||result?.reason);
 }catch(error:any){console.error('Public CAD auto-dispatch evaluation deferred',String(error?.message||error).slice(0,150));}
 return Response.json({success:true,reference});
 }catch(error){const saved=(await db.DispatchCall.filter({public_request_id:key},'-created_date',1).catch(()=>[]))[0];if(saved){const reference=saved.bps_reference||saved.call_id;await db.PublicDispatchRequest.update(reservation.id,{status:'received',reference,call_id:saved.id}).catch(()=>null);return Response.json({success:true,reference,dispatch_pending:true});}await db.PublicDispatchRequest.update(reservation.id,{status:'needs_attention'}).catch(()=>null);return Response.json({error:'We could not confirm your request. Call BlackPoint dispatch; do not rely on this page for urgent assistance.'},{status:503});}
 }catch{return Response.json({error:'Unable to submit. Please retry or call dispatch.'},{status:500});}
}
