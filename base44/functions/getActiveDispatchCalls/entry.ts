const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;

import { createClientFromRequest } from 'npm:@base44/sdk';

// Shared by the backend feed and every browser live-call consumer.
const ACTIVE_WINDOW_MS = 60 * 60 * 1000;
const TERMINAL = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
function callTimestamp(call) {
  const value = call?.time_received || call?.created_date;
  if (!value) return 0;
  const raw = String(value).trim();
  const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + 'Z');
  return Number.isFinite(stamp) ? stamp : 0;
}
function isValidCallRecord(call) {
  if (!call || call.is_test === true || call.is_demo === true || call.is_sample === true) return false;
  const incident = String(call.incident || '').trim();
  const location = String(call.location || '').trim();
  if (!incident || !location || /<\/?(?:html|body|table|script|div)\b/i.test(incident + location)) return false;
  if (/^(?:incident(?: type)?|call type|time received|loading\.{0,3}|no (?:active )?calls(?: found)?)$/i.test(incident)) return false;
  return !['test', 'demo', 'sample'].includes(String(call.lifecycle_status || '').toLowerCase());
}
function isVisibleActiveCall(call, now = Date.now()) {
  if (!isValidCallRecord(call) || call.manual_dismissed === true || call.time_cleared
    || TERMINAL.has(String(call.status || '').trim().toLowerCase())) return false;
  const stamp = callTimestamp(call);
  // Public requests remain visible until a real disposition, even if
  // waiting on a dispatcher or eligible unit for more than an hour.
  const retained = call.pathfinder_source_active===true || call.pathfinder_property_alert===true || (Array.isArray(call.pathfinder_assignment_unit_ids)&&call.pathfinder_assignment_unit_ids.length>0) || ['public_helpme','dispatch_manual','field_initiated','CAD clone'].includes(call.source) || (call.agency==='BPS' && call.cad_number_source==='bps_internal' && !call.external_call_id) || (Array.isArray(call.assigned_units) && call.assigned_units.some(id=>String(id||'').trim()));
  return stamp > 0 && stamp <= now + 120000 && (retained || now - stamp <= ACTIVE_WINDOW_MS);
}
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

// All authorized viewers share bounded server reads within this worker.
const metadataCache=new Map<string,{at:number,value:any,pending?:Promise<any>}>();
async function cachedMetadata(key:string,ttl:number,load:()=>Promise<any>,warnings:string[],label:string){
 let entry=metadataCache.get(key);
 if(entry&&Date.now()-entry.at<ttl)return entry.value;
 if(!entry?.pending){
  entry={at:entry?.at||0,value:entry?.value??null,pending:load()};
  metadataCache.set(key,entry);
 }
 try{const value=await entry.pending;entry.value=value;entry.at=Date.now();entry.pending=undefined;return value;}
 catch(error:any){entry.pending=undefined;warnings.push(label+' temporarily unavailable');console.warn(label,error?.message||error);return entry.value;}
}
const readCache = new Map<string, { at:number; rows:any[]; source?:any; warnings?:string[]; pending?:Promise<any> }>();
// Only Base44 record IDs belong in an id query. Legacy CAD numbers and officer aliases are not record IDs.
const validRecordId=(value:any)=>/^[a-f0-9]{24}$/i.test(String(value||''));
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !['dispatch','dispatcher','officer','supervisor'].includes(lower(__portalCaller.role)) && __portalCaller.dispatch_role!==true && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me().then(__portalAppIdentity);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((me.additional_roles || []).map((role: string) => lower(role)));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending')
      || ['client', 'student', 'pending'].includes(lower(me.user_type))
      || ['client', 'student'].includes(lower(me.rank));
    if (blocked) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(50, Math.min(500, Number(body?.limit || 100)));
    const cacheKey = (req.headers.get('Base44-App-Id') || '') + ':' + (req.headers.get('X-Data-Env') || 'prod');
    let cached = readCache.get(cacheKey);
    if (!cached || Date.now() - cached.at >= 10000) {
      if (!cached?.pending) {
        cached = { at:cached?.at||0, rows:cached?.rows||[], source:cached?.source, warnings:cached?.warnings, pending:(async () => {
          // Keep unresolved verified property calls and active assignments in
          // the feed even when the original agency timestamp is over an hour old.
          const db=base44.asServiceRole.entities;
          const warnings:string[]=[];
          const optional=async(label:string,read:()=>Promise<any>)=>{try{return await read();}catch(error:any){warnings.push(label+' temporarily unavailable');console.warn(label,error?.message||error);return null;}};
          const [alerts,assignments,counters]=await Promise.all([
            cachedMetadata(cacheKey+':properties',25000,()=>db.PropertyAlert.filter({lifecycle_status:{$nin:['resolved','false_alarm','test','inactive','closed']},is_test:{$ne:true}},'-created_date',1000),warnings,'Property alert links'),
            cachedMetadata(cacheKey+':assignments',15000,()=>db.CallAssignment.filter({status:{$nin:['cleared','cancelled','canceled','closed','completed','resolved']}},'-assigned_at',1000),warnings,'Officer attachment links'),
            cachedMetadata(cacheKey+':source',10000,()=>db.CadCounter.filter({counter_key:'dispatch_call'},'-updated_date',1),warnings,'GRAC heartbeat'),
          ]);
          const propertyIds=new Set((alerts||[]).filter(a=>a.callId&&a.propertyId&&a.propertyId!=='public-helpme'&&!TERMINAL.has(lower(a.callStatus))).map(a=>String(a.callId)));
          const assignmentUnits=new Map<string,Set<string>>();
          for(const row of assignments||[]){if(!row.call_id||!row.unit_id||TERMINAL.has(lower(row.status)))continue;const key=String(row.call_id);if(!assignmentUnits.has(key))assignmentUnits.set(key,new Set());assignmentUnits.get(key)!.add(String(row.unit_id));}
          const retainedIds=[...new Set([...propertyIds,...assignmentUnits.keys()])].filter(validRecordId);
          const counter=counters?.[0];
          const sourceIds=new Set<string>((Array.isArray(counter?.active_source_snapshot)?counter.active_source_snapshot:[]).map((r:any)=>String(r.external_call_id||'')).filter(Boolean));
          const sourceRows:any[]=[];
          // Read by upstream identity, including incidents opened days ago.
          // This query does not use record IDs and cannot trigger the legacy-ID error.
          const sourceKeys=[...sourceIds];
          for(let i=0;i<sourceKeys.length;i+=100){
            const batch=await optional('Current GRAC snapshot',()=>db.DispatchCall.filter({external_call_id:{$in:sourceKeys.slice(i,i+100)},manual_dismissed:{$ne:true}},'-updated_date',500));
            if(Array.isArray(batch))sourceRows.push(...batch);
          }
          const rows = await base44.asServiceRole.entities.DispatchCall.filter({
            $or: [
              { time_received: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString(), $lte: new Date(Date.now() + 120000).toISOString() } },
              { $and: [{ $or: [{ time_received: null }, { time_received: '' }, { time_received: { $exists: false } }] }, { created_date: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString() } }] },
              {source:{$in:['public_helpme','dispatch_manual','field_initiated','CAD clone']}},
              {$and:[{agency:'BPS'},{cad_number_source:'bps_internal'}]},
              {status:{$in:['Dispatched','Enroute','On Scene']}},
              {'assigned_units.0':{$exists:true}},
            ],
            manual_dismissed: {$ne:true},
            status: {$nin:['Cleared','Cancelled','Canceled','Closed','Completed','Resolved','cleared','cancelled','canceled','closed','completed','resolved']},
          }, '-created_date', 500);
                    // A separate retained-record query avoids a busy agency feed crowding
          // unresolved property incidents out of the ordinary 500-row window.
          const retainedRows:any[]=[];
          // Bound the ID query size, and never fail the ordinary feed due to an optional historical attachment lookup.
          for(let i=0;i<retainedIds.length;i+=100){const batch=await optional('Retained CAD records',()=>db.DispatchCall.filter({id:{$in:retainedIds.slice(i,i+100)},manual_dismissed:{$ne:true},status:{$nin:[...TERMINAL,'Cleared','Cancelled','Canceled','Closed','Completed','Resolved']}},'-created_date',100));if(Array.isArray(batch))retainedRows.push(...batch);}
          const source=counter?{poll_at:counter.last_source_poll_at||null,poll_status:counter.last_source_poll_status||'',last_server_poll_at:counter.last_server_poll_at||null,last_success_at:counter.last_source_success_at||(String(counter.last_source_poll_status||'').startsWith('success')?counter.last_source_poll_at:null),website_rows:counter.last_website_row_count??null,api_rows:counter.last_api_row_count??null,latest_received:counter.last_website_latest_received||null,duration_ms:counter.last_source_poll_duration_ms??null,snapshot_count:sourceIds.size}:null;
          const all=[...new Map([...rows||[],...retainedRows||[],...sourceRows].map((row:any)=>[String(row.id),row])).values()].map((row:any)=>({...row,pathfinder_source_active:sourceIds.has(String(row.external_call_id||''))&&['richmond','henrico','chesterfield'].includes(lower(row.source)),pathfinder_property_alert:propertyIds.has(String(row.id)),pathfinder_assignment_unit_ids:[...(assignmentUnits.get(String(row.id))||[])]})).filter((row:any)=>isVisibleActiveCall(row));
          // Duplicate saved records of one source incident must not crowd out
          // other source incidents. Preserve the row with local attachments;
          // otherwise prefer the most recently updated record.
          const unique=new Map<string,any>();
          const rank=(row:any)=>Number(Boolean(row.pathfinder_assignment_unit_ids?.length||row.assigned_units?.length))*4+Number(row.pathfinder_property_alert)*2+Number(Boolean(row.official_cad_verified));
          for(const row of all){
            const key=row.pathfinder_source_active?'source:'+row.external_call_id:'local:'+row.id;
            const prior=unique.get(key);
            if(!prior||rank(row)>rank(prior)||rank(row)===rank(prior)&&Date.parse(row.updated_date||row.created_date||0)>Date.parse(prior.updated_date||prior.created_date||0))unique.set(key,row);
          }
          const result=[...unique.values()];
          if(source){source.visible_source_count=result.filter(r=>r.pathfinder_source_active).length;source.missing_source_count=Math.max(0,sourceIds.size-source.visible_source_count);}
          return {source,warnings,rows:result};
        })() };
        readCache.set(cacheKey, cached);
      }
      try { const result=await cached.pending!; if(cached.at&&result.warnings.some((w:string)=>/Current GRAC snapshot|Retained CAD records|GRAC heartbeat/.test(w))){cached.warnings=result.warnings;cached.pending=undefined;}else{cached.rows=result.rows; cached.source=result.source; cached.warnings=result.warnings; cached.at = Date.now(); cached.pending = undefined;} }
      catch (error:any) { cached.pending=undefined;if(!cached.at){readCache.delete(cacheKey);throw error;}cached.warnings=[...new Set([...(cached.warnings||[]),'CAD refresh delayed; showing last confirmed records'])];console.warn('CAD refresh delayed',error?.message||error); }
    }
    const rows = cached.rows;
    const calls = (Array.isArray(rows) ? rows : [])
      .filter(call => isVisibleActiveCall(call))
      .sort((a, b) => Number(Boolean(b.pathfinder_source_active||b.pathfinder_property_alert||b.pathfinder_assignment_unit_ids?.length||b.assigned_units?.length))-Number(Boolean(a.pathfinder_source_active||a.pathfinder_property_alert||a.pathfinder_assignment_unit_ids?.length||a.assigned_units?.length))||callTimestamp(b)-callTimestamp(a))
      .slice(0, limit);

    return Response.json({
      success: true,
      calls,
      filtered_out: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - calls.length),
      status_based: true,
      source_health:cached.source||null,
      warnings:cached.warnings||[],
      fetched_at: new Date(cached.at || Date.now()).toISOString(),
    });
  } catch (error: any) {
    console.error('getActiveDispatchCalls failed', error);
    return Response.json(
      { error: error?.message || 'Unable to load active dispatch calls' },
      { status: Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(String(error?.message)) ? 429 : 500 },
    );
  }
});