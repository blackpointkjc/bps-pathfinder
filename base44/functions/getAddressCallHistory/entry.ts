import { addressHistoryPattern } from '../_shared/addressHistoryMatch.js';
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
  let address = clean(input.address).slice(0,200);
  const propertyId = clean(input.propertyId).slice(0,80);
  if (propertyId && !address.match(/^\s*\d+[a-z]?\s+/i)) {
    const property = await api.asServiceRole.entities.Location.get(propertyId).catch(() => null);
    address = clean(property?.address || address);
  }
  const since = new Date(Date.now()-90*86400000).toISOString();
  const pattern = addressHistoryPattern(address);
  const matcher = pattern ? new RegExp(pattern, 'i') : null;
  if (!propertyId && !pattern) return Response.json({error:'Select a numbered street address or managed property to check call history.'}, {status:400});
  const rows:any[]=[]; const errors:string[]=[]; let truncated=false;
  const read=async(entity:string,query:any,kind:string)=>{
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const batch:any = await Promise.race([
        api.asServiceRole.entities[entity].filter(query,entity==='PropertyAlert'?'-created_date':'-time_received',300),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('History source timeout')),10000);})
      ]);
      if(batch.length===300) truncated=true;
      for(const r of batch) rows.push({...r,_kind:kind});
    } catch (error) { errors.push(entity); console.warn('Address history source unavailable', entity, error instanceof Error ? error.message : 'Read failed'); }
    finally { if (timer) clearTimeout(timer); }
  };
  const reads:Promise<void>[]=[];
  if(propertyId) reads.push(read('PropertyAlert',{propertyId,created_date:{$gte:since}},'property'));
  if(pattern) {
    // Base44 can reject Mongo-style nested regex/$or query combinations
    // with HTTP 400. Read a bounded recent window and match locally.
    reads.push(read('DispatchCall',{created_date:{$gte:since}},'call'),
      read('CallHistory',{created_date:{$gte:since}},'history'));
  }
  await Promise.all(reads);
  if (errors.length === reads.length) return Response.json({error:'Call history sources are unavailable. No call count could be verified.'}, {status:503});
  const identities=new Set<string>(); const fingerprints=new Set<string>(); const calls:any[]=[];
  for(const r of rows) {
    if (r._kind !== 'property' && matcher && !matcher.test(clean(r.callLocation||r.location))) continue;
    if(r.is_test || ['test','false_alarm'].includes(String(r.lifecycle_status||'').toLowerCase())) continue;
    const time=r.callTime||r.time_received||r.created_date;
    if(!time||Date.parse(time)<Date.parse(since)) continue;
    const id=clean(r.callId||r.original_call_id||r.id);
    const incident=clean(r.callIncident||r.incident)||'Incident type unavailable';
    const location=clean(r.callLocation||r.location||address);
    const fingerprint=[time,incident.toLowerCase(),location.toLowerCase()].join('|');
    if(identities.has(id)||fingerprints.has(fingerprint))continue;
    identities.add(id);fingerprints.add(fingerprint);
    calls.push({id,incident,location,time,status:r.callStatus||r.status||'',reference:r.agency_cad_number||r.bps_reference||r.cadNumber||r.call_id||''});
  }
  calls.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  const types:any={}; for(const call of calls)types[call.incident]=(types[call.incident]||0)+1;
  return Response.json({count:calls.length,calls:calls.slice(0,30),types,since,days:90,partial:truncated||errors.length>0,errors,scope:propertyId?'Address history and property-linked alerts (alerts may include nearby calls)':'Address matches',displayed:Math.min(calls.length,30)});
 } catch {return Response.json({error:'Call history unavailable. Retry when the connection recovers.'},{status:500});}
});
