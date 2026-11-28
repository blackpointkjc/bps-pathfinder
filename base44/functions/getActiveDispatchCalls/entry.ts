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
  const retained = call.pathfinder_property_alert===true || (Array.isArray(call.pathfinder_assignment_unit_ids)&&call.pathfinder_assignment_unit_ids.length>0) || ['public_helpme','dispatch_manual','field_initiated','CAD clone'].includes(call.source) || (call.agency==='BPS' && call.cad_number_source==='bps_internal' && !call.external_call_id) || (Array.isArray(call.assigned_units) && call.assigned_units.some(id=>String(id||'').trim()));
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

const readCache = new Map<string, { at:number; rows:any[]; source?:any; pending?:Promise<any> }>();
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
    if (!cached || Date.now() - cached.at >= 3000) {
      if (!cached?.pending) {
        cached = { at:0, rows:[], pending:(async () => {
          // Keep unresolved verified property calls and active assignments in
          // the feed even when the original agency timestamp is over an hour old.
          const db=base44.asServiceRole.entities;
          const [alerts,assignments,counters]=await Promise.all([
            db.PropertyAlert.filter({lifecycle_status:{$nin:['resolved','false_alarm','test','inactive','closed']},is_test:{$ne:true}},'-created_date',1000),
            db.CallAssignment.filter({status:{$nin:['cleared','cancelled','canceled','closed','completed','resolved']}},'-assigned_at',1000),
            db.CadCounter.filter({counter_key:'dispatch_call'},'-updated_date',1).catch(()=>null),
          ]);
          const propertyIds=new Set((alerts||[]).filter(a=>a.callId&&a.propertyId&&a.propertyId!=='public-helpme'&&!TERMINAL.has(lower(a.callStatus))).map(a=>String(a.callId)));
          const assignmentUnits=new Map<string,Set<string>>();
          for(const row of assignments||[]){if(!row.call_id||!row.unit_id||TERMINAL.has(lower(row.status)))continue;const key=String(row.call_id);if(!assignmentUnits.has(key))assignmentUnits.set(key,new Set());assignmentUnits.get(key)!.add(String(row.unit_id));}
          const retainedIds=[...new Set([...propertyIds,...assignmentUnits.keys()])];
          const rows = await base44.asServiceRole.entities.DispatchCall.filter({
            $or: [
              ...(retainedIds.length?[{id:{$in:retainedIds}}]:[]),
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
          const retainedRows=retainedIds.length?await db.DispatchCall.filter({id:{$in:retainedIds},manual_dismissed:{$ne:true},status:{$nin:[...TERMINAL,'Cleared','Cancelled','Canceled','Closed','Completed','Resolved']}},'-created_date',1000):[];
          const counter=counters?.[0];
          const source=counter?{poll_at:counter.last_source_poll_at||null,poll_status:counter.last_source_poll_status||'',last_server_poll_at:counter.last_server_poll_at||null,last_success_at:counter.last_source_success_at||(String(counter.last_source_poll_status||'').startsWith('success')?counter.last_source_poll_at:null),website_rows:counter.last_website_row_count??null,api_rows:counter.last_api_row_count??null,latest_received:counter.last_website_latest_received||null,duration_ms:counter.last_source_poll_duration_ms??null}:null;
          return {source,rows:[...new Map([...rows||[],...retainedRows||[]].map((row:any)=>[String(row.id),row])).values()].map((row:any)=>({...row,pathfinder_property_alert:propertyIds.has(String(row.id)),pathfinder_assignment_unit_ids:[...(assignmentUnits.get(String(row.id))||[])]})).filter((row:any)=>isVisibleActiveCall(row))};
        })() };
        readCache.set(cacheKey, cached);
      }
      try { const result=await cached.pending!; cached.rows=result.rows; cached.source=result.source; cached.at = Date.now(); cached.pending = undefined; }
      catch (error) { readCache.delete(cacheKey); throw error; }
    }
    const rows = cached.rows;
    const calls = (Array.isArray(rows) ? rows : [])
      .filter(call => isVisibleActiveCall(call))
      .sort((a, b) => Number(Boolean(b.pathfinder_property_alert||b.pathfinder_assignment_unit_ids?.length||b.assigned_units?.length))-Number(Boolean(a.pathfinder_property_alert||a.pathfinder_assignment_unit_ids?.length||a.assigned_units?.length))||callTimestamp(b)-callTimestamp(a))
      .slice(0, limit);

    return Response.json({
      success: true,
      calls,
      filtered_out: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - calls.length),
      status_based: true,
      source_health:cached.source||null,
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