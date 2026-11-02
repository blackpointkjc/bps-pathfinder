const __portalAppIdentity=(user:any)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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
 }catch{return false;}
}

const terminal = new Set(['cleared','clear','cancelled','canceled','resolved','closed','complete','completed']);
const lower = (v:any) => String(v || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me().then(__portalAppIdentity);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set([me.role,...(me.additional_roles || [])].map((r:string) => lower(r)));
    // Report forms are available to internal users whose primary role may still be
    // the Base44 default "user" role. Do not require a separate officer role just
    // to populate the call-link field. Only external/client/student/pending users
    // are excluded from the operational CAD-link feed.
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending')
      || ['client', 'student', 'pending'].includes(lower(me.user_type))
      || ['client', 'student'].includes(lower(me.rank));
    if (blocked) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const search=String(body.search||'').trim().slice(0,160);
    const escaped=Array.from(search).map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
    const fullCad=/^BPS-\d{6}-\d+$/i.test(search);
    const filter=fullCad?{$or:['agency_cad_number','bps_reference','call_id'].map(field=>({[field]:search.toUpperCase()}))}:search?{$or:['agency_cad_number','bps_reference','call_id','incident','location'].map(field=>({[field]:{$regex:escaped,$options:'i'}}))}:null;
    const read=(entity:string,sort:string)=>filter?base44.asServiceRole.entities[entity].filter(filter,sort,200):base44.asServiceRole.entities[entity].list(sort,limit);
    const limit = Math.max(50, Math.min(3000, Number(body?.limit || 1500)));
    // The live call list is required; history/property metadata are enhancements.
    // Read the three bounded search sources together and report errors instead
    // of silently turning an unavailable archive into an empty dropdown.
    const [live,history,alerts]=await Promise.all([read('DispatchCall','-time_received'),read('CallHistory','-archived_date'),search?base44.asServiceRole.entities.PropertyAlert.filter({$or:['cadNumber','callIncident','callLocation'].map(field=>({[field]:{$regex:escaped,$options:'i'}}))},'-created_date',200):base44.asServiceRole.entities.PropertyAlert.list('-created_date',limit)]);

    const propertyByCall = new Map<string, any>();
    for (const alert of alerts || []) {
      const key = String(alert.callId || '');
      if (!key || propertyByCall.has(key)) continue;
      propertyByCall.set(key, {
        property_id: alert.propertyId || '',
        property_name: alert.propertyName || '',
        property_call_location: alert.callLocation || '',
        property_call_incident: alert.callIncident || '',
      });
    }

    const normalizeHistory = (h:any) => {
      const callId = h?.call_id || h?.agency_cad_number || h?.bps_reference || '';
      const id = h?.original_call_id || h?.id;
      return {
        ...h,
        id,
        original_call_id: h?.original_call_id || id,
        call_id: callId,
        bps_reference: h?.bps_reference || (/^BPS-/i.test(callId) ? callId : ''),
        agency_cad_number: h?.agency_cad_number || '',
        incident: h?.incident || h?.incident_type || h?.call_type || '',
        location: h?.location || h?.address || '',
        time_received: h?.time_received || h?.call_time || h?.created_date || '',
        status: h?.status || 'Cleared',
        updated_date: h?.archived_date || h?.updated_date || h?.created_date,
        _archived: true,
      };
    };

    const merged = [...(live || []).map((c:any) => ({...c, _archived:false})), ...(history || []).map(normalizeHistory),...(alerts||[]).map((a:any)=>({id:a.callId||a.id,original_call_id:a.callId||a.id,bps_reference:a.cadNumber,incident:a.callIncident,location:a.callLocation,time_received:a.callTime||a.created_date,status:'Cleared',_archived:true,property_name:a.propertyName}))]
      .map((call:any) => {
        const property = propertyByCall.get(String(call.id || '')) || propertyByCall.get(String(call.original_call_id || ''));
        return property ? { ...call, ...property } : call;
      });

    const deduped = new Map<string, any>();
    for (const call of merged) {
      const fallback = [call.incident, call.location, call.time_received].filter(Boolean).join('|').toLowerCase();
      const key = String(call.bps_reference || (call.agency_cad_number && `${call.agency || ''}:${call.agency_cad_number}`) || call.external_call_id || call.original_call_id || call.call_id || fallback || call.id);
      const prior = deduped.get(key);
      if (!prior) { deduped.set(key, call); continue; }
      // Prefer live row over history for the same call; otherwise newest row wins.
      if (prior._archived && !call._archived) { deduped.set(key, call); continue; }
      if (prior._archived === call._archived) {
        const a = new Date(prior.updated_date || prior.time_received || prior.created_date || 0).getTime();
        const b = new Date(call.updated_date || call.time_received || call.created_date || 0).getTime();
        if (b > a) deduped.set(key, call);
      }
    }

    const calls = [...deduped.values()].sort((a:any,b:any) => new Date(b.time_received || b.created_date || 0).getTime() - new Date(a.time_received || a.created_date || 0).getTime());
    const activeCount = calls.filter((c:any) => !c._archived && !terminal.has(lower(c.status))).length;
    return Response.json({ success:true, calls, active_count: activeCount, history_count: calls.length - activeCount });
  } catch (error:any) {
    console.error('getDispatchCallLinkFeed failed', error);
    return Response.json({ error: error?.message || 'Unable to load dispatch call link feed', calls: [] }, { status: 500 });
  }
});