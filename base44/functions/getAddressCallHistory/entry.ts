import { createClientFromRequest } from 'npm:@base44/sdk';
const clean = (v:any) => String(v || '').trim();
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
  const user = await api.auth.me();
  if (!user) return Response.json({error:'Sign in required'}, {status:401});
  const roles = [user.role, ...(user.additional_roles || [])].map((r:any)=>String(r).toLowerCase());
  if (roles.includes('client') || roles.includes('student') || user.user_type === 'client' || user.termination_date) return Response.json({error:'Operational access required'}, {status:403});
  const allowed = roles.some(r=>['admin','officer','dispatch','supervisor','cad_access','full_access'].includes(r)) || ['officer','senior officer','corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(String(user.rank||'').toLowerCase());
  if (!allowed) return Response.json({error:'Operational access required'}, {status:403});
  const input = await req.json();
  const address = clean(input.address).slice(0,200);
  const propertyId = clean(input.propertyId).slice(0,80);
  const locality = address.split(',')[1]?.trim().toLowerCase() || '';
  const since = new Date(Date.now()-90*86400000).toISOString();
  const number = address.match(/^\s*(\d+[a-z]?)\s+(.+)/i);
  if (!propertyId && !number) return Response.json({error:'Select a numbered street address or managed property to check call history.'}, {status:400});
  // Anchor to house number and street, allowing standard street abbreviations.
  const street = number ? number[2].split(',')[0].replace(/[^a-z0-9\s]/gi,' ').trim().split(/\s+/) : [];
  const alternatives:any = {street:'st',road:'rd',avenue:'ave',drive:'dr',lane:'ln',court:'ct',boulevard:'blvd',place:'pl',parkway:'pkwy',north:'n',south:'s',east:'e',west:'w'};
  const token = (word:string) => {
    const w=word.toLowerCase(); const pair=Object.entries(alternatives).find(([full,short])=>w===full||w===short);
    return pair ? '(?:'+pair.join('|')+')\\.?' : w;
  };
  const pattern = number ? '^\\s*'+number[1]+'\\s+'+street.map(token).join('\\s+')+'(?:\\s*(?:,|$)|\\s+(?:apt|unit|suite|#)\\b)' : '';
  const rows:any[]=[]; const errors:string[]=[]; let truncated=false;
  const read=async(entity:string,query:any,kind:string)=>{
    try {
      const batch=await api.asServiceRole.entities[entity].filter(query,'-created_date',300);
      if(batch.length===300) truncated=true;
      for(const r of batch) rows.push({...r,_kind:kind});
    } catch { errors.push(entity); }
  };
  if(propertyId) {
    await read('PropertyAlert',{propertyId,created_date:{$gte:since}},'property');
  } else {
    const query={location:{$regex:pattern,$options:'i'},created_date:{$gte:since}};
    await read('DispatchCall',query,'call');
    await read('CallHistory',query,'history');
  }
  const identities=new Set<string>(); const fingerprints=new Set<string>(); const calls:any[]=[];
  for(const r of rows) {
    if(r.is_test || ['test','false_alarm'].includes(String(r.lifecycle_status||'').toLowerCase())) continue;
    const time=r.callTime||r.time_received||r.created_date;
    if(!time||Date.parse(time)<Date.parse(since)) continue;
    const id=clean(r.callId||r.original_call_id||r.id);
    const incident=clean(r.callIncident||r.incident)||'Incident type unavailable';
    const location=clean(r.callLocation||r.location||address);
    if (!propertyId && locality && !location.toLowerCase().includes(locality)) continue;
    const fingerprint=[time,incident.toLowerCase(),location.toLowerCase()].join('|');
    if(identities.has(id)||fingerprints.has(fingerprint))continue;
    identities.add(id);fingerprints.add(fingerprint);
    calls.push({id,incident,location,time,status:r.callStatus||r.status||'',reference:r.agency_cad_number||r.bps_reference||r.cadNumber||r.call_id||''});
  }
  calls.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  const types:any={}; for(const call of calls)types[call.incident]=(types[call.incident]||0)+1;
  return Response.json({count:calls.length,calls:calls.slice(0,30),types,since,days:90,partial:truncated||errors.length>0,errors,scope:propertyId?'Property-linked alerts (may include nearby calls)':'Address matches',displayed:Math.min(calls.length,30)});
 } catch {return Response.json({error:'Call history unavailable. Retry when the connection recovers.'},{status:500});}
});
