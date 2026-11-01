import { addressHistoryPattern } from './addressHistoryMatch.js';
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
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
const clean = (v:any) => String(v || '').trim();
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

  const user = await api.auth.me().then(__limitFullAccess);
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
