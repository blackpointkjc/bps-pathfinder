const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { addressHistoryPattern } from './addressHistoryMatch.js';
import { callTimestamp, isValidCallRecord } from './callFeedPolicy.js';
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
 }catch(error){if(Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message)))throw error;return false;}
}
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const validCad = (value:any) => {const text=String(value||'').trim();return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&!/^property-alert-|^web-|^https?:|^[a-f0-9]{48,}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);};
const cadRef = (row:any) => [row?.agency_cad_number,row?.bps_reference,row?.cadNumber,row?.call_number,row?.call_id].find(validCad)||'';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readWithRetry<T>(label: string, loader: () => Promise<T>, fallback: T, maxAttempts = 1): Promise<{ data: T; error: string }> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return { data: await loader(), error: '' };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await wait(250 * (attempt + 1));
    }
  }
  const message = `${label} unavailable: ${lastError?.message || lastError || 'unknown error'}`;
  console.warn(message);
  return { data: fallback, error: message };
}

// Fixed, read-only operational window. Never expose arbitrary history or
// caller contact details to officers through this action.
const PROPERTY_MONITORING_EDGE_TOLERANCE_METERS=100;
function pointInPolygon(lat, lng, polygon = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const latI = Number(Array.isArray(a) ? a[0] : a?.lat);
    const lngI = Number(Array.isArray(a) ? a[1] : a?.lng);
    const latJ = Number(Array.isArray(b) ? b[0] : b?.lat);
    const lngJ = Number(Array.isArray(b) ? b[1] : b?.lng);
    if (![latI, lngI, latJ, lngJ].every(Number.isFinite)) continue;
    const intersects = lngI > lng !== lngJ > lng && lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI || Number.EPSILON) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function pointToSegmentMeters(lat, lng, a, b) {
  const aLat = Number(Array.isArray(a) ? a[0] : a?.lat);
  const aLng = Number(Array.isArray(a) ? a[1] : a?.lng);
  const bLat = Number(Array.isArray(b) ? b[0] : b?.lat);
  const bLng = Number(Array.isArray(b) ? b[1] : b?.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(lat * Math.PI / 180);
  const ax = (aLng - lng) * metersPerLng;
  const ay = (aLat - lat) * metersPerLat;
  const bx = (bLng - lng) * metersPerLng;
  const by = (bLat - lat) * metersPerLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, (-ax * dx + -ay * dy) / lengthSq)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}
function normalizedStreet(value) {
  const cleaned = String(value || "").toUpperCase().replace(/\bNORTH\b/g, "N").replace(/\bSOUTH\b/g, "S").replace(/\bEAST\b/g, "E").replace(/\bWEST\b/g, "W").replace(/\bSTREET\b/g, "ST").replace(/\bAVENUE\b/g, "AVE").replace(/\bROAD\b/g, "RD").replace(/\bBOULEVARD\b/g, "BLVD").replace(/\bLANE\b/g, "LN").replace(/\bDRIVE\b/g, "DR").replace(/\b(\d+)(ST|ND|RD|TH)\b/g, "$1").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const number = Number(cleaned.match(/^\d+/)?.[0]);
  const street = cleaned.replace(/^\d+\s*/, "").replace(/\b(?:RICHMOND|VA|VIRGINIA)\b.*$/, "").trim();
  return { number, street };
}
function sameStreetBlock(callLocation, propertyAddress) {
  const call = normalizedStreet(callLocation);
  const property = normalizedStreet(propertyAddress);
  if (!Number.isFinite(call.number) || !Number.isFinite(property.number) || !call.street || !property.street) return false;
  const callStreet = call.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, "").trim();
  const propertyStreet = property.street.replace(/\b(?:ST|AVE|RD|BLVD|LN|DR)\b$/, "").trim();
  return callStreet === propertyStreet && Math.floor(call.number / 100) === Math.floor(property.number / 100);
}
function propertyMatch(call, location) {
  const emergencyFour = /\bOFFICER\b|(?:^|[^A-Z0-9])D\.?\s*O\.?\s*A\.?(?=$|[^A-Z0-9])/i.test(String(call?.incident || ""));
  if (location?.active === false || !emergencyFour && location?.property_monitoring_enabled !== true) return null;
  const lat = Number(call?.latitude);
  const lng = Number(call?.longitude);
  const hasCoordinates = call?.latitude!=null&&call?.longitude!=null&&String(call.latitude).trim()!==""&&String(call.longitude).trim()!==""&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);
  if (!hasCoordinates) {
    return sameStreetBlock(call?.location, location?.address) ? { relation: "nearby", distanceMeters: 0, addressFallback: true } : null;
  }
  const polygon = Array.isArray(location.property_monitoring_polygon) ? location.property_monitoring_polygon : [];
  const boundaryType = String(location.property_monitoring_boundary_type || (polygon.length >= 3 ? "polygon" : "circle")).toLowerCase();
  if (boundaryType === "polygon" && polygon.length >= 3) {
    if (pointInPolygon(lat, lng, polygon)) return { relation: "inside", distanceMeters: 0 };
    let edgeDistance = Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      edgeDistance = Math.min(
        edgeDistance,
        pointToSegmentMeters(lat, lng, polygon[i], polygon[(i + 1) % polygon.length])
      );
    }
    return edgeDistance <= PROPERTY_MONITORING_EDGE_TOLERANCE_METERS ? { relation: "nearby", distanceMeters: edgeDistance } : null;
  }
  const centerLat = Number(location.latitude);
  const centerLng = Number(location.longitude);
  const radiusMeters = Number(location.property_monitoring_radius_meters || 0);
  if (![centerLat, centerLng, radiusMeters].every(Number.isFinite) || radiusMeters <= 0) return null;
  const centerDistance = distanceMeters(lat, lng, centerLat, centerLng);
  return centerDistance <= radiusMeters ? { relation: "inside", distanceMeters: 0 } : null;
}

const PROPERTY_WINDOW_MS=12*60*60*1000;
const propertyHistoryCache=new Map<string,{at:number,rows:any[],pending?:Promise<any[]>}>();
const terminalPropertyStatus=(status:any)=>['cleared','cancelled','canceled','closed','completed','resolved'].includes(lower(status));
async function recentPropertyIncidents(db:any,now=Date.now()){

 const pages=async(entity:any,query:any,sort:string)=>{
   const all:any[]=[];
   for(let skip=0;skip<10000;skip+=200){
     const page=await entity.filter(query,sort,200,skip);
     if(!Array.isArray(page))throw Error('Invalid property log response');
     all.push(...page);if(page.length<200)return all;
   }
   throw Error('Property incident log exceeded its safe retrieval limit');
 };
 const stamp=(value:any)=>{const raw=String(value||'').trim();return raw?Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:raw+'Z'):NaN;};
 // Date fields sometimes arrive as UTC without a suffix. Widen only the
 // database candidate query by a minute; the exact UTC window is enforced below.
 const candidateRange={$gte:new Date(now-PROPERTY_WINDOW_MS-60000).toISOString().slice(0,19),$lte:new Date(now+60000).toISOString().slice(0,19)};
 const dateQuery=(field:string,legacy:string)=>({$or:[{[field]:candidateRange},{$and:[{$or:[{[field]:{$exists:false}},{[field]:null},{[field]:''}]},{[legacy]:candidateRange}]}]});
 const [alerts,links,recentLive,recentArchive,locations]=await Promise.all([
   pages(db.PropertyAlert,{$and:[{is_test:{$ne:true}},{lifecycle_status:{$ne:'test'}},{$or:[{callTime:candidateRange},{time_received:candidateRange},{created_date:candidateRange}]}]},'-created_date'),
   pages(db.PropertyCallLink,dateQuery('time_received','linked_at'),'-linked_at'),
   pages(db.DispatchCall,dateQuery('time_received','created_date'),'-time_received'),
   pages(db.CallHistory,dateQuery('time_received','created_date'),'-time_received'),
   pages(db.Location,{active:{$ne:false},property_monitoring_enabled:true},'site_name')
 ]);
 const grouped=new Map<string,any[]>();
 const add=(id:string,a:any)=>{if(!id)return;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id)!.push(a);};
 for(const a of alerts){if(!a.callId||!a.propertyId||a.propertyId==='public-helpme'||a.is_test===true||lower(a.lifecycle_status)==='test')continue;add(String(a.callId),a);}
 const batch=async(entity:any,field:string,ids:string[],sort:string)=>{
   if(field==='id')ids=ids.filter(id=>/^[a-f0-9]{24}$/i.test(String(id||'')));
   const all:any[]=[];for(let i=0;i<ids.length;i+=100)all.push(...await pages(entity,{[field]:{$in:ids.slice(i,i+100)}},sort));return all;
 };
 const explicitArchiveIds=[...new Set(links.filter(l=>lower(l.status)!=='detached').map(l=>String(l.archive_id||'')).filter(Boolean))];
 const explicitIds=[...new Set([...grouped.keys(),...links.filter(l=>lower(l.status)!=='detached').map(l=>String(l.call_id||'')).filter(Boolean)])];
 const [linkedLive,linkedArchive,linkedArchiveById]=await Promise.all([batch(db.DispatchCall,'id',explicitIds,'-created_date'),batch(db.CallHistory,'original_call_id',explicitIds,'-archived_date'),batch(db.CallHistory,'id',[...new Set([...explicitArchiveIds,...explicitIds])],'-archived_date')]);
 const live=[...new Map([...recentLive,...linkedLive].map(c=>[String(c.id),c])).values()];
 const archives=[...new Map([...recentArchive,...linkedArchive,...linkedArchiveById].map(c=>[String(c.id),c])).values()].sort((a,b)=>(stamp(b.archived_date)||0)-(stamp(a.archived_date)||0));
 const liveById=new Map(live.map(c=>[String(c.id),c]));
 const archiveById=new Map<string,any>();
 const canonicalByArchive=new Map<string,string>();
 for(const c of archives){const key=String(c.original_call_id||c.id);canonicalByArchive.set(String(c.id),key);if(!archiveById.has(key))archiveById.set(key,c);}
 // Legacy links may reference the archive row ID instead of the original ID.
 for(const [id,rows] of [...grouped]){const canonical=canonicalByArchive.get(id);if(canonical&&canonical!==id){grouped.delete(id);for(const a of rows)add(canonical,a);}}
 for(const l of links){if(!l.property_id||l.property_id==='public-helpme'||lower(l.status)==='detached')continue;const id=canonicalByArchive.get(String(l.archive_id||''))||canonicalByArchive.get(String(l.call_id||''))||String(l.call_id||'');add(id,{propertyId:l.property_id,propertyName:l.property_name,callTime:l.time_received||l.linked_at,callIncident:l.incident,callLocation:l.location,cadNumber:l.call_number,callStatus:'Status unavailable',property_evidence:'manual_link'});}
 // Recovery is read-only. It never creates a live alert, assignment or voice
 // event for a historical call. Match against today's configured boundaries.
 for(const [id,c] of new Map([...archiveById,...liveById])){
   if(!isValidCallRecord(c))continue;
   const at=stamp(c.time_received||c.created_date);
   if(!Number.isFinite(at)||at<now-PROPERTY_WINDOW_MS||at>now)continue;
   for(const location of locations){
     if(location.active===false||location.property_monitoring_enabled!==true||!propertyMatch(c,location))continue;
     if(grouped.get(id)?.some(a=>String(a.propertyId)===String(location.id)))continue;
     add(id,{propertyId:location.id,propertyName:location.site_name||location.address,callTime:c.time_received||c.created_date,callIncident:c.incident,callLocation:c.location,callStatus:c.status,cadNumber:cadRef(c),property_evidence:'boundary_match'});
   }
 }
 if(!grouped.size)return [];
 const ids=[...grouped.keys()];
 const assignmentIds=[...new Set([...ids,...archives.filter(c=>grouped.has(String(c.original_call_id||c.id))).map(c=>String(c.id))])];
 const assignments=await batch(db.CallAssignment,'call_id',assignmentIds,'-assigned_at');
 const actorIds=[...new Set([...assignments.map(a=>a.unit_id),...live.filter(c=>grouped.has(String(c.id))).flatMap(c=>c.assigned_units||[]),...archives.filter(c=>grouped.has(String(c.original_call_id||c.id))).flatMap(c=>c.assigned_units||[])].filter(Boolean).map(String))];
 const [units,sessions]=await Promise.all([batch(db.Unit,'id',actorIds,'-last_update_at'),batch(db.ActiveOfficer,'id',actorIds,'-created_date')]);
 const personIds=[...new Set([...actorIds,...units.map(u=>u.user_id)].filter(Boolean).map(String))];
 const emails=[...new Set([...actorIds.filter(id=>id.includes('@')),...sessions.map(s=>s.officer_email)].filter(Boolean).map(String))];
 const [peopleById,peopleByEmail]=await Promise.all([batch(db.User,'id',personIds,'-updated_date'),batch(db.User,'email',emails,'-updated_date')]);
 const people=[...peopleById,...peopleByEmail];
 const actor=(key:string)=>{const unit=units.find(u=>String(u.id)===key),session=sessions.find(u=>String(u.id)===key);
   const person=people.find(u=>String(u.id)===String(unit?.user_id||key)||lower(u.email)===lower(session?.officer_email||key));
   return {key:String(person?.id||key),label:[person?.unit_number?'Unit '+person.unit_number:'',person?.rank,person?.last_name||person?.full_name].filter(Boolean).join(' ')||unit?.label||session?.officer_name||'Unidentified officer'};
 };
 const result:any[]=[];
 for(const [id,linked] of grouped){
   const a=linked[0],l=liveById.get(id),archive=archiveById.get(id),c=l||archive;
   if(c&&!isValidCallRecord({...c,incident:c.incident||a.callIncident,location:c.location||a.callLocation}))continue;
   const received=[c?.time_received,a.callTime,a.time_received,c?.created_date,a.created_date].map(stamp).find(Number.isFinite);
   if(received===undefined||received<now-PROPERTY_WINDOW_MS||received>now)continue;
   // Preserve actual incident disposition. A resolved alert alone is not
   // proof that the agency incident closed if its live record still exists.
   const resolved=!l&&linked.every(a=>lower(a.lifecycle_status)==='resolved');
   const closed=Boolean(c?.manual_dismissed||c?.time_cleared||c?.time_closed||terminalPropertyStatus(c?.status)||(!c&&(resolved||terminalPropertyStatus(a.callStatus))));
   const status=closed?(terminalPropertyStatus(c?.status)?c.status:'Closed'):c?.status||a.callStatus||'Status unavailable';
   const unitRows=new Map<string,any>();
   const validIds=new Set([id,archive?.id].filter(Boolean).map(String));
   for(const row of assignments.filter(row=>validIds.has(String(row.call_id)))){
     if(!row.unit_id)continue;
     const person=actor(String(row.unit_id)),active=!closed&&!row.cleared_at&&!terminalPropertyStatus(row.status);
     if(!unitRows.has(person.key)||active&&!unitRows.get(person.key).active)unitRows.set(person.key,{unit_id:person.key,label:person.label,role:row.role||'',status:row.status||'Status unavailable',active,assigned_at:row.assigned_at||null,cleared_at:row.cleared_at||null});
   }
   for(const raw of [...(l?.assigned_units||[]),...(archive?.assigned_units||[])]){
     const person=actor(String(raw));
     if(!unitRows.has(person.key))unitRows.set(person.key,{unit_id:person.key,label:person.label,role:'',status:closed?'Previously attached':'Attached',active:!closed});
   }
   result.push({id,incident:c?.incident||a.callIncident||'Call for service',location:c?.location||a.callLocation||'',agency:c?.agency||'',status,priority:c?.priority||a.callPriority||'medium',priority_override:c?.priority_override||false,agency_cad_number:c?.agency_cad_number||'',bps_reference:c?.bps_reference||'',call_id:cadRef(c)||cadRef(a),official_cad_verified:Boolean(c?.agency_cad_number||cadRef(a)),time_received:new Date(received).toISOString(),time_cleared:c?.time_cleared||c?.time_closed||null,property_names:[...new Set(linked.map(a=>a.propertyName).filter(Boolean))],property_log:true,property_boundary_recovered:linked.every(a=>a.property_evidence==='boundary_match'),property_closed:closed,property_read_only:closed||!l,property_record_available:Boolean(c),pathfinder_property_alert:!closed,assigned_units:[...unitRows.values()].filter(a=>a.active).map(a=>a.unit_id),property_assignments:[...unitRows.values()],property_disposition:c?.disposition||''});
 }
 return result.sort((a,b)=>stamp(b.time_received)-stamp(a.time_received)||a.id.localeCompare(b.id));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((user.additional_roles || []).map((role: unknown) => lower(role)));
    const allowed = roles.has('officer') || user.role === 'admin' || user.role === 'dispatch' || Boolean(user.dispatch_role) || roles.has('cad_access') || roles.has('full_access') || roles.has('dispatch') || roles.has('supervisor') || (user.is_supervisor === true || ['corporal','first sergeant','sergeant','sgt','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(String(user.rank || '').toLowerCase().replace(/[.]/g, '').trim()));
    if (!allowed || ['client','student','visitor'].some(role=>roles.has(role)||lower(user.user_type)===role||lower(user.role)===role)) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const input=await req.json().catch(()=>({}));
    if(input.action==='recent_property_incidents'){if(user.portal_approved===false||['pending','support','support_staff'].some(r=>lower(user.user_type)===r||lower(user.role)===r))return Response.json({error:'Approved CAD access required'},{status:403});const cacheKey=(req.headers.get('Base44-App-Id')||'')+':'+(req.headers.get('X-Data-Env')||'prod');
      let entry=propertyHistoryCache.get(cacheKey);
      // Explicit cached mode is used by the command board. Existing admin
      // historical queries and their access checks are unchanged.
      if(input.cached!==true)return Response.json({success:true,calls:await recentPropertyIncidents(base44.asServiceRole.entities),window_hours:12,fetched_at:new Date().toISOString()});
      if(!entry||Date.now()-entry.at>=90000){
        if(!entry?.pending){entry={at:entry?.at||0,rows:entry?.rows||[],pending:recentPropertyIncidents(base44.asServiceRole.entities)};propertyHistoryCache.set(cacheKey,entry);}
        try{const rows=await entry.pending!;entry.rows=rows;entry.at=Date.now();entry.pending=undefined;}
        catch(error){entry.pending=undefined;if(!entry.at)throw error;return Response.json({success:true,calls:entry.rows,window_hours:12,fetched_at:new Date(entry.at).toISOString(),warning:'Historical property log delayed; showing last confirmed records'});}
      }
      return Response.json({success:true,calls:entry.rows,window_hours:12,fetched_at:new Date(entry.at).toISOString()});}
    if(user.role!=='admin'&&input.action!=='call_details')return Response.json({error:'Administrator access required for full CAD history'},{status:403});
    // Fetch optional linked reports and assignments only for an expanded call.
    // The history table itself no longer needs six expensive enrichment reads.
    if(input.action==='call_details'){
      const id=String(input.call_id||'').trim().slice(0,100);
      const number=String(input.call_number||'').trim().slice(0,100);
      if(!id)return Response.json({error:'Call id required'},{status:400});
      const db=base44.asServiceRole.entities;
      if(roles.has('client')||roles.has('student')||['client','student'].includes(lower(user.user_type)))return Response.json({error:'CAD access required'},{status:403});
      const [live,archives,archiveById]=await Promise.all([
        readWithRetry('Original call',()=>db.DispatchCall.get(id),null),
        readWithRetry('Archived call',()=>db.CallHistory.filter({original_call_id:id},'-archived_date',10),[]),
        readWithRetry('Archive record',()=>db.CallHistory.get(id),null)
      ]);
      const archived=(archives.data||[])[0]||archiveById.data;
      if(user.role!=='admin'&&(!live.data||['cleared','cancelled','canceled','closed','completed','resolved'].includes(lower(live.data.status))||live.data.manual_dismissed))return Response.json({error:'Administrator access required for historical incident records'},{status:403});
      let call=live.data||archived;
      let propertyFallback=false;
      if(!call){
        const alert=await readWithRetry('Property alert reference',()=>db.PropertyAlert.filter({callId:id},'-created_date',1),[]);
        if(alert.data?.length){const a=alert.data[0];call={id:a.callId,incident:a.callIncident,location:a.callLocation,time_received:a.callTime||a.time_received,description:a.description,status:a.callStatus};propertyFallback=true;}
      }
      if(!call)return Response.json({error:'Original or archived CAD record unavailable'},{status:404});
      const ids=[...new Set([live.data?.id,archived?.original_call_id,archived?.id,propertyFallback?id:null].filter(Boolean).map(String))];
      const filter={call_id:{$in:ids}};
      const readPages=async(entity:any,sort:string)=>{
        const out:any[]=[];
        for(let skip=0;skip<2000;skip+=200){
          const page=await entity.filter(filter,sort,200,skip);
          if(!Array.isArray(page))throw Error('Invalid record response');
          out.push(...page);if(page.length<200)return out;
        }
        throw Error('Activity exceeds 2000 records; contact administrator for full export');
      };
      const [links,assignments,notes,logs]=await Promise.all([
        readWithRetry('Linked reports',()=>readPages(db.ReportCallLink,'-linked_at'),[]),
        readWithRetry('Assigned units',()=>readPages(db.CallAssignment,'-assigned_at'),[]),
        readWithRetry('Officer and dispatch notes',()=>readPages(db.CallNote,'-created_date'),[]),
        readWithRetry('CAD status activity',()=>readPages(db.CallStatusLog,'-created_date'),[])
      ]);
      const actorIds=[...new Set([...assignments.data.map(a=>a.unit_id),...notes.data.map(n=>n.author_id),...logs.data.map(l=>l.unit_id)].filter(Boolean).map(String))];
      const [units,sessions]=await Promise.all([
        readWithRetry('Unit names',()=>actorIds.length?db.Unit.filter({id:{$in:actorIds}},'-last_update_at',500):Promise.resolve([]),[]),
        readWithRetry('Session names',()=>actorIds.length?db.ActiveOfficer.filter({id:{$in:actorIds}},'-created_date',500):Promise.resolve([]),[])
      ]);
      const peopleIds=[...new Set([...actorIds,...units.data.map(u=>u.user_id)].filter(Boolean).map(String))];
      const emails=[...new Set([...actorIds.filter(id=>id.includes('@')),...sessions.data.map(u=>u.officer_email)].filter(Boolean))];
      const people=await readWithRetry('Officer names',()=>peopleIds.length?db.User.filter({$or:[{id:{$in:peopleIds}},{email:{$in:emails}}]},'-updated_date',500):Promise.resolve([]),[]);
      const label=(key:any,fallback='')=>{
        const unit=units.data.find(u=>String(u.id)===String(key)),session=sessions.data.find(u=>String(u.id)===String(key));
        const person=people.data.find(u=>String(u.id)===String(unit?.user_id||key)||lower(u.email)===lower(session?.officer_email||key));
        return fallback||[person?.unit_number?'Unit '+person.unit_number:'',person?.rank,person?.last_name||person?.full_name].filter(Boolean).join(' ')||unit?.label||session?.officer_name||'Officer not identified';
      };
      const timestamp=(v:any)=>{const raw=String(v||'');return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:raw+'Z');};
      const timeline=[
        ...notes.data.map(n=>({id:'note-'+n.id,kind:'note',title:n.note_type==='clear'?'Clearance note':'Officer / dispatch note',actor:label(n.author_id,n.author_name),text:n.note,at:n.created_date})),
        ...logs.data.map(l=>({id:'log-'+l.id,kind:'activity',title:String(l.event_type||l.new_status||'CAD update').replace(/_/g,' '),actor:label(l.unit_id,l.unit_name||(!l.unit_id?'CAD / Dispatch':'')),text:[l.old_status&&l.new_status&&l.old_status!==l.new_status?l.old_status+' → '+l.new_status:'',l.notes,l.announcement_text].filter(Boolean).join(' · '),at:l.created_date})),
        ...assignments.data.flatMap(a=>[['assigned_at','Assigned'],['accepted_at','Acknowledged'],['cleared_at','Unit cleared']].filter(([field])=>a[field]).map(([field,title])=>({id:'assignment-'+a.id+'-'+field,kind:'assignment',title,actor:label(a.unit_id),text:field==='cleared_at'?a.description||'':a.role||'',at:a[field]}))),
        ...[['time_received','Call received'],['time_dispatched','Dispatched'],['time_enroute','En route'],['time_on_scene','On scene'],['time_cleared','Call cleared'],['time_closed','Call closed']].filter(([field])=>call[field]).map(([field,title])=>({id:'call-'+field,kind:'record',title,actor:'CAD record',text:'',at:call[field]}))
      ].sort((a,b)=>(timestamp(a.at)||0)-(timestamp(b.at)||0));
      const linked=links.data.filter(row=>lower(row.status||'active')!=='detached').map(row=>({id:row.id,report_id:row.report_id,report_type:row.report_type,report_number:row.report_number||row.report_id,call_number:row.call_number||cadRef(call)||number,linked_at:row.linked_at}));
      return Response.json({success:true,linked_reports:linked,assignments:assignments.data.map(row=>({unit_id:row.unit_id,label:label(row.unit_id),role:row.role,status:row.status,assigned_at:row.assigned_at,accepted_at:row.accepted_at,cleared_at:row.cleared_at,description:row.description})),timeline,disposition:call.disposition||'',narrative:call.description||'',note_count:notes.data.length,log_count:logs.data.length,warnings:[propertyFallback?'Original CAD record unavailable; showing retained property alert and saved activity.':'',links.error,assignments.error,notes.error,logs.error,units.error,sessions.error,people.error].filter(Boolean)});
    }
    const search=String(input.search||'').trim().slice(0,160);
    const addressPattern=addressHistoryPattern(search);
    const pageSize=Math.max(25,Math.min(100,Math.floor(Number(input.page_size)||75)));
    const cursor=input.cursor||{};
    const snapshotMs=Math.min(Date.now(),Date.parse(cursor.snapshot_at||'')||Date.now());
    const snapshot=new Date(snapshotMs).toISOString();
    const since=new Date(Math.max(snapshotMs-90*86400000,Math.min(snapshotMs,Date.parse(input.since||'')||0))).toISOString();
    const until=new Date(Math.min(snapshotMs,Date.parse(input.until||'')||snapshotMs)).toISOString();
    const db=base44.asServiceRole.entities;
    const dateRange={$gte:since,$lte:until};
    const propertyOnly=input.call_class==='PROPERTY';
    const states:any={
      active:{entity:db.DispatchCall,field:'time_received',offset:Math.max(0,Math.floor(Number(cursor.active)||0)),buffer:[],done:cursor.active_done===true,error:''},
      archived:{entity:db.CallHistory,field:'time_received',offset:Math.max(0,Math.floor(Number(cursor.archived)||0)),buffer:[],done:cursor.archived_done===true,error:''},
      property:{entity:db.PropertyAlert,field:'callTime',offset:Math.max(0,Math.floor(Number(cursor.property)||0)),buffer:[],done:cursor.property_done===true,error:''}
    };
    for(const [key,entity,missingField,field] of [
      ['active_legacy',db.DispatchCall,'time_received','created_date'],
      ['archived_legacy',db.CallHistory,'time_received','created_date'],
      ['property_legacy',db.PropertyAlert,'callTime','time_received']
    ] as any[]){
      states[key]={entity,field,missingField,offset:Math.max(0,Math.floor(Number(cursor[key])||0)),buffer:[],done:cursor[key+'_done']===true,error:''};
    }
    if(propertyOnly){
      for(const key of ['active','archived','active_legacy','archived_legacy'])states[key].done=true;
      states.manual={entity:db.PropertyCallLink,field:'time_received',offset:Math.max(0,Math.floor(Number(cursor.manual)||0)),buffer:[],done:cursor.manual_done===true,error:''};
      states.manual_legacy={entity:db.PropertyCallLink,field:'linked_at',missingField:'time_received',offset:Math.max(0,Math.floor(Number(cursor.manual_legacy)||0)),buffer:[],done:cursor.manual_legacy_done===true,error:''};
    }
    const family=(key:string)=>key.replace('_legacy','');
    // A raw cursor advances for every database row examined, including rows
    // rejected by search, date/status filters, validation or deduplication.
    // Buffered, unconsumed rows are fetched again from their exact offset.
    const asProperty=(alert:any)=>({
      id:'property-alert:'+alert.id,original_call_id:String(alert.callId||''),call_id:alert.cadNumber||'',
      bps_reference:/^BPS-/i.test(String(alert.cadNumber||''))?alert.cadNumber:'',
      incident:alert.callIncident||'Property alert',location:alert.callLocation||'',
      time_received:alert.callTime||alert.time_received||alert.created_date,agency:'BPS',
      status:alert.callStatus||alert.lifecycle_status||'Recorded',is_test:alert.is_test,
      _source:'property',_propertyCall:true,_propertyAlert:alert,_propertyName:alert.propertyName||'',
      _propertyId:alert.propertyId||'',_propertyLifecycle:alert.lifecycle_status||'',
      _referenceEntity:'PropertyAlert',_referenceId:String(alert.id)
    });
    const matchesFilters=(row:any)=>{
      const timestamp=callTimestamp(row);
      if(timestamp<Date.parse(since)||timestamp>Date.parse(until))return false;
      if(input.agency&&input.agency!=='ALL'&&row.agency!==input.agency)return false;
      const status=row.time_cleared?'Cleared':row.time_on_scene&&!['cleared','closed','cancelled','canceled','completed','resolved'].includes(lower(row.status))?'On Scene':row.status;
      if(input.status&&input.status!=='ALL'&&status!==input.status)return false;
      if(!search)return true;
      return ['call_id','bps_reference','agency_cad_number','incident','location','original_call_id','agency','_propertyName'].some(field=>lower(row[field]).includes(lower(search)))||Boolean(addressPattern&&new RegExp(addressPattern,'i').test(String(row.location||'')));
    };
    const selected:any[]=[];
    const seen=new Set<string>();
    let boundaryStamp=Number(cursor.boundary_stamp)||0;
    let boundaryIds=new Set<string>((Array.isArray(cursor.boundary_ids)?cursor.boundary_ids:[]).slice(0,2000).map(String));
    let scanned=0,reads=0;
    const batchSize=pageSize+1;
    const scanLimit=Math.max(1000,batchSize*12);
    const warnings:string[]=[];
    const fill=async(key:string)=>{
      const state=states[key];
      if(state.done||state.error||state.buffer.length)return;
      if(state.end){state.done=true;return;}
      const result=await readWithRetry(key+' call history',()=>state.entity.filter({...{[state.field]:dateRange},...(state.missingField?{$or:[{[state.missingField]:{$exists:false}},{[state.missingField]:null},{[state.missingField]:''}]}:{})},'-'+state.field,batchSize,state.offset),[]);
      reads++;
      if(result.error){state.error=result.error;return;}
      const raw=result.data||[];
      state.end=raw.length<batchSize;
      // Only use a property-alert row as history when neither the live nor
      // archived original exists anywhere, not merely outside this page.
      if((family(key)==='property'||family(key)==='manual')&&raw.length){
        const manual=family(key)==='manual';
        const refs=[...new Set(raw.map((r:any)=>String(manual?r.call_id||'':r.callId||'')).filter(Boolean))];
        const [live,archived]=await Promise.all([
          readWithRetry('Property original calls',()=>refs.length?db.DispatchCall.filter({id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[]),
          readWithRetry('Property archived calls',()=>refs.length?db.CallHistory.filter({original_call_id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[])
        ]);
        if(live.error||archived.error){
          if(!propertyOnly){state.error=live.error||archived.error;return;}
          warnings.push(...[live.error,archived.error].filter(Boolean));
        }
        const liveById=new Map(live.data.map(r=>[String(r.id),r]));
        const archiveById=new Map(archived.data.map(r=>[String(r.original_call_id),r]));
        state.buffer=raw.map((r:any)=>{
          const id=String(manual?r.call_id||'':r.callId||'');
          const current=liveById.get(id),prior=archiveById.get(id),original=current||prior;
          if(!propertyOnly)return {row:asProperty(r),skip:!!original};
          const fallback=manual?{id:'property-link:'+r.id,original_call_id:id,call_id:r.call_number||'',incident:r.incident||'Property call',location:r.location||'',time_received:r.time_received||r.linked_at,agency:'BPS',status:'Recorded',_source:'property',_referenceEntity:'PropertyCallLink',_referenceId:r.id}:asProperty(r);
          const row={...fallback,...(original||{}),original_call_id:id||fallback.original_call_id,_source:current?'active':prior?'archived':'property',_propertyCall:true,_propertyName:manual?r.property_name:r.propertyName,_propertyId:manual?r.property_id:r.propertyId,_propertyAlert:manual?null:r,_propertyLinks:manual?[r]:[],_propertyLifecycle:manual?'':r.lifecycle_status||'',_referenceEntity:original?(current?'DispatchCall':'CallHistory'):fallback._referenceEntity,_referenceId:original?.id||fallback._referenceId};
          return {row,skip:manual?lower(r.status)==='detached':r.is_test===true||lower(r.lifecycle_status)==='test'};
        });
      }else if(family(key)==='archived'&&raw.length){
        const refs=[...new Set(raw.map((r:any)=>String(r.original_call_id||'')).filter(Boolean))];
        const live=await readWithRetry('Archive duplicate check',()=>refs.length?db.DispatchCall.filter({id:{$in:refs}},'-time_received',batchSize):Promise.resolve([]),[]);
        if(live.error)warnings.push(live.error);
        const linked=new Set(live.data.map(r=>String(r.id)));
        state.buffer=raw.map((r:any)=>({row:r,skip:linked.has(String(r.original_call_id||''))}));
      }else state.buffer=raw.map((row:any)=>({row,skip:false}));
      if(!state.buffer.length)state.done=true;
    };
    while(selected.length<pageSize&&scanned<scanLimit&&reads<42){
      await Promise.all(Object.keys(states).map(fill));
      if(!propertyOnly&&states.active.error&&states.archived.error)throw Error('Both active and archived call sources are temporarily unavailable.');
      const heads=Object.entries(states).filter(([,v]:any)=>v.buffer.length).map(([source,v]:any)=>({source,...v.buffer[0]}));
      if(!heads.length)break;
      heads.sort((a,b)=>callTimestamp(b.row)-callTimestamp(a.row)||['active','archived','property'].indexOf(family(a.source))-['active','archived','property'].indexOf(family(b.source)));
      const item=heads[0],state=states[item.source];
      state.buffer.shift();state.offset++;scanned++;
      if(!state.buffer.length&&state.end)state.done=true;
      const row=item.row;
      if(item.skip||!isValidCallRecord(row)||!matchesFilters(row))continue;
      const identity=String(row.original_call_id||row.id);
      const stamp=callTimestamp(row);
      if(stamp!==boundaryStamp){boundaryStamp=stamp;boundaryIds=new Set();}
      if(seen.has(identity)||boundaryIds.has(identity))continue;
      seen.add(identity);boundaryIds.add(identity);selected.push({...item,source:family(item.source)==='manual'?'property':family(item.source)});
    }
    if(propertyOnly&&!selected.length&&states.property.error&&states.property_legacy.error&&states.manual.error&&states.manual_legacy.error)throw Error('Property history temporarily unavailable. Retry.');
    const propertyRows=selected.filter(item=>item.source==='property').map(item=>item.row);
    const active:any[] = selected.filter(item=>item.source==='active').map(item=>item.row);
    const archived:any[] = selected.filter(item=>item.source==='archived').map(item=>item.row);
    const ids = [...new Set(selected.flatMap(({row})=>[String(row.id||''),String(row.original_call_id||'')]).filter(Boolean))];
    const numbers = [...new Set(selected.map(({row})=>String(cadRef(row)||'')).filter(Boolean))];
    const callFilter = { call_id: { $in: ids } };
    // Only enrich this page. The former global reads fetched 8,000+ unrelated rows.
    // Live CAD / Call History must paint quickly under Base44 API limits.
    // Extra joins are optional. The full audit/enrichment path remains
    // available with include_details:true, but default history returns the
    // authoritative core records using no extra cross-entity roundtrips.
    const includeDetails=input.include_details===true;
    const emptyRead={data:[],error:''};
    // Property history is core CAD data, not an optional detail join.
    // The old normal list path set alertRead to [] when include_details=false,
    // making every property call disappear from the Property tab.
    const [alertRead,propertyLinksRead] = await Promise.all([
      readWithRetry('Property alerts',()=>ids.length?db.PropertyAlert.filter({callId:{$in:ids}},'-created_date',500):Promise.resolve([]),[]),
      readWithRetry('Manual property links',()=>ids.length?db.PropertyCallLink.filter({$or:[{call_id:{$in:ids}},{archive_id:{$in:ids}}]},'-linked_at',500):Promise.resolve([]),[])
    ]);
    const [assignmentRead,linkedRead] = includeDetails ? await Promise.all([
      readWithRetry('Call assignments',()=>ids.length?base44.asServiceRole.entities.CallAssignment.filter(callFilter,'-assigned_at',300):Promise.resolve([]),[]),
      readWithRetry('Linked reports',()=>ids.length?base44.asServiceRole.entities.ReportCallLink.filter({$or:[callFilter,{call_number:{$in:numbers}}]},'-linked_at',300):Promise.resolve([]),[])
    ]) : [emptyRead,emptyRead];
    const alerts:any[] = alertRead.data || [];
    const unitIds = [...new Set([
      ...(assignmentRead.data||[]).map((row:any)=>String(row.unit_id||'')),
      ...selected.flatMap(({row})=>Array.isArray(row.assigned_units)?row.assigned_units.map(String):[]),
    ].filter(Boolean))];
    const unitRead = includeDetails ? await readWithRetry('CAD units',()=>unitIds.length?base44.asServiceRole.entities.Unit.filter({id:{$in:unitIds}},'-last_update_at',300):Promise.resolve([]),[]) : emptyRead;
    const userIds = [...new Set([...unitIds,...(unitRead.data||[]).map((row:any)=>String(row.user_id||''))].filter(Boolean))];
    const emails = (unitRead.data||[]).map((row:any)=>String(row.user_email||row.email||'')).filter(Boolean);
    const userRead = includeDetails ? await readWithRetry('Assigned officers',()=>userIds.length?base44.asServiceRole.entities.User.filter({$or:[{id:{$in:userIds}},{email:{$in:emails}}]},'-updated_date',300):Promise.resolve([]),[]) : emptyRead;
    const hasMore=Object.values(states).some((state:any)=>!state.done&&!state.error);
    const nextCursor=hasMore?{snapshot_at:snapshot,boundary_stamp:boundaryStamp,boundary_ids:[...boundaryIds],...Object.fromEntries(Object.entries(states).flatMap(([key,state]:any)=>[[key,state.offset],[key+'_done',state.done||!!state.error]]))}:null;
    const linksByCall=new Map<string,any[]>();
    for(const link of linkedRead.data||[]){
      if(String(link.status||'active').toLowerCase()==='detached')continue;
      for(const key of [String(link.call_id||''),String(link.call_number||'')]){
        if(!key)continue;
        if(!linksByCall.has(key))linksByCall.set(key,[]);
        if(!linksByCall.get(key)!.some((row:any)=>row.id===link.id))linksByCall.get(key)!.push(link);
      }
    }
    const linkedReports=(id:string,number:string)=>{
      const combined=[...(linksByCall.get(String(id||''))||[]),...(linksByCall.get(String(number||''))||[])];
      return [...new Map(combined.map((row:any)=>[String(row.id),{id:row.id,report_id:row.report_id,report_type:row.report_type,report_number:row.report_number||row.report_id,call_number:row.call_number,linked_at:row.linked_at}])).values()];
    };

    const usersById = new Map((userRead.data || []).map((person: any) => [String(person.id), person]));
    const officersByEmail=new Map((userRead.data||[]).map((person:any)=>[String(person.email||'').toLowerCase(),person]));
    const officersByNumber=new Map((userRead.data||[]).filter((p:any)=>p.unit_number).map((person:any)=>[String(person.unit_number||'').replace(/^0+/,''),person]));
    const unitsById = new Map((unitRead.data || []).map((unit: any) => [String(unit.id), unit]));
    const assignmentsByCall = new Map<string, any[]>();
    for (const assignment of assignmentRead.data || []) {
      const id = String(assignment.call_id || '');
      if (!id) continue;
      if (!assignmentsByCall.has(id)) assignmentsByCall.set(id, []);
      assignmentsByCall.get(id)!.push(assignment);
    }
    const assignmentDetails = (callId: string, existing: any[] = []) => {
      const records = assignmentsByCall.get(callId) || [];
      const ids = [...new Set([...existing.map(String), ...records.map((item: any) => String(item.unit_id || ''))].filter(Boolean))];
      return ids.map(id => {
        const unit = unitsById.get(id);
        const officer = usersById.get(String(unit?.user_id || id))
          ||officersByEmail.get(String(unit?.user_email||unit?.email||'').toLowerCase())
          ||officersByNumber.get(String(unit?.unit_number||'').replace(/^0+/,''))
          ||(userRead.data||[]).find((u:any)=>String(u.username||'').toLowerCase()===String(unit?.officer_name||'').toLowerCase());
        const number = officer?.unit_number || unit?.unit_number || '';
        const name = [officer?.rank||'Officer', officer?.last_name||String(officer?.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' ');
        const label = [number ? 'Unit ' + number : '', name||'Officer not identified'].filter(Boolean).join(' — ');
        const assignment = records.find((item: any) => String(item.unit_id) === id);
        return { unit_id: id, label, officer_name: name || '', unit_number: number, role: assignment?.role || '', assigned_at: assignment?.assigned_at || '', status: assignment?.status || '' };
      });
    };
    const propertyFingerprint = (time: any, incident: any, location: any) => [
      String(time || ''),
      String(incident || '').trim().toUpperCase(),
      String(location || '').trim().toUpperCase(),
    ].join('|');

    const alertByCallId = new Map<string, any>();
    const alertByFingerprint = new Map<string, any>();
    for (const alert of alerts || []) {
      if (!alert?.callId) continue;
      const key = String(alert.callId);
      const prior = alertByCallId.get(key);
      const currentStamp = new Date(alert.created_date || 0).getTime();
      const priorStamp = new Date(prior?.created_date || 0).getTime();
      const hasTime = Boolean(alert.callTime || alert.time_received);
      const priorHasTime = Boolean(prior?.callTime || prior?.time_received);
      if (!prior || (hasTime && !priorHasTime) || (hasTime === priorHasTime && currentStamp > priorStamp)) alertByCallId.set(key, alert);
      const fp = propertyFingerprint(alert.callTime || alert.time_received, alert.callIncident, alert.callLocation);
      if (fp && !fp.startsWith('|')) {
        const priorFp = alertByFingerprint.get(fp);
        const priorFpStamp = new Date(priorFp?.created_date || 0).getTime();
        if (!priorFp || currentStamp > priorFpStamp) alertByFingerprint.set(fp, alert);
      }
    }

    const decorate = (row: any, source: 'active' | 'archived') => {
      const directOriginalId = source === 'archived' ? String(row.original_call_id || '') : String(row.id || '');
      const fingerprintAlert = source === 'archived'
        ? alertByFingerprint.get(propertyFingerprint(row.time_received || row.created_date, row.incident, row.location))
        : null;
      const alert = (directOriginalId ? alertByCallId.get(directOriginalId) : null) || fingerprintAlert;
      const originalId = directOriginalId || String(fingerprintAlert?.callId || '');
      return {
        ...row,
        original_call_id: source === 'archived' ? (originalId || row.original_call_id || '') : row.original_call_id,
        call_id: cadRef(row) || cadRef(alert),
        bps_reference: row.bps_reference || (/^BPS-/i.test(cadRef(alert)) ? cadRef(alert) : ''),
        _referenceEntity:source==='archived'?'CallHistory':'DispatchCall',_referenceId:String(row.id),
        _source: source,
        _assignedUnitDetails: assignmentDetails(originalId, Array.isArray(row.assigned_units) ? row.assigned_units : []),
        _linkedReports:linkedReports(originalId||String(row.id||''),String(row.call_id||row.agency_cad_number||row.bps_reference||'')),
        _propertyCall: Boolean(alert),
        _propertyAlert: alert || null,
        _propertyName: alert?.propertyName || '',
        _propertyId: alert?.propertyId || '',
        _propertyLifecycle: alert?.lifecycle_status || '',
        _propertyDistanceMeters: Number.isFinite(Number(alert?.distanceMeters)) ? Number(alert.distanceMeters) : null,
      };
    };

    const activeRows = (active || []).map((row: any) => decorate(row, 'active'));
    const archivedRowsRaw = (archived || []).map((row: any) => decorate(row, 'archived'));

    // Do not collapse different calls merely because their timestamp, incident
    // and street match. Only the canonical original ID is a duplicate key.
    const archivedRows=archivedRowsRaw;
    const manualLinks:any[]=propertyLinksRead.data||[];
    const allRows=[...activeRows,...archivedRows,...propertyRows];
    const decorated=allRows.map(row=>{
      const ids=[String(row.id||''),String(row.original_call_id||'')];
      const links=manualLinks.filter(link=>lower(link.status)!=='detached'&&(ids.includes(String(link.call_id))||ids.includes(String(link.archive_id||''))));
      const matchingAlerts=alerts.filter(a=>a.is_test!==true&&lower(a.lifecycle_status)!=='test'&&ids.includes(String(a.callId)));
      const names=[...new Set([row._propertyName,...matchingAlerts.map(a=>a.propertyName),...links.map(l=>l.property_name)].filter(Boolean))];
      return {...row,_propertyLinks:links.length?links:row._propertyLinks,_propertyCall:!!(row._propertyCall||matchingAlerts.length||links.length),_propertyName:names.join(' / '),_propertyId:row._propertyId||matchingAlerts[0]?.propertyId||links[0]?.property_id||''};

    });
    return Response.json({
      success: true,
      property_history_version: 2,
      call_class: propertyOnly?'PROPERTY':'ALL',
      rows: decorated.sort((a,b)=>callTimestamp(b)-callTimestamp(a)),
      next_cursor: nextCursor,
      has_more: hasMore,
      days:90, since, snapshot_at:snapshot, scan_incomplete:hasMore&&selected.length<pageSize,
      counts: {
        active: activeRows.length,
        archived: archivedRows.length,
        propertyAlerts: decorated.filter(row=>row._propertyCall).length,
        loaded: decorated.length,
      },
      warnings: [...new Set([...warnings,...Object.values(states).map((state:any)=>state.error)]) , alertRead.error, assignmentRead.error, userRead.error, unitRead.error,linkedRead.error,propertyLinksRead.error].filter(Boolean),
    });
  } catch (error:any) {
    console.error('getCallHistoryFeed failed:', error);
    return Response.json({ error: error?.message || 'Unable to load call history' }, { status: Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message))?429:500 });
  }
});
