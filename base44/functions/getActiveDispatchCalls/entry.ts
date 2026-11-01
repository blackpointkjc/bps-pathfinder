import { isVisibleActiveCall, callTimestamp, ACTIVE_WINDOW_MS } from './callFeedPolicy.js';
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
async function __portalLoginIsCurrent(request,sdk,user){
 try{
  const token=String(request.headers.get('authorization')||request.headers.get('on-behalf-of')||'').replace(/^Bearer\s+/i,'');
  if(!token)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const rows=await sdk.asServiceRole.entities.PortalAuthSession.filter({token_hash:hash},'-created_date',1),session=rows[0];
  return !!session&&session.user_id===user.id&&!session.revoked&&Date.parse(session.started_at)>=Date.parse(__portalReauthAfter)&&Date.now()-Date.parse(session.last_activity_at)<13*60*60*1000;
 }catch{return false;}
}

const readCache = new Map<string, { at:number; rows:any[]; pending?:Promise<any[]> }>();
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me();
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
    if (!cached || Date.now() - cached.at >= 12000) {
      if (!cached?.pending) {
        cached = { at:0, rows:[], pending:(async () => {
          // The board is defined by recency, not by matching the last source poll.
          // Gating rows on that poll dropped current calls whose source had already
          // moved on, which left the board empty while calls were still running.
          const rows = await base44.asServiceRole.entities.DispatchCall.filter({
            $or: [
              { time_received: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString(), $lte: new Date(Date.now() + 120000).toISOString() } },
              { $and: [{ $or: [{ time_received: null }, { time_received: '' }, { time_received: { $exists: false } }] }, { created_date: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString() } }] },
            ],
            manual_dismissed: {$ne:true},
            status: {$nin:['Cleared','Cancelled','Canceled','Closed','Completed','Resolved','cleared','cancelled','canceled','closed','completed','resolved']},
          }, '-created_date', 500);
          return (rows || []).filter((row:any) => isVisibleActiveCall(row));
        })() };
        readCache.set(cacheKey, cached);
      }
      try { cached.rows = await cached.pending!; cached.at = Date.now(); cached.pending = undefined; }
      catch (error) { readCache.delete(cacheKey); throw error; }
    }
    const rows = cached.rows;
    const calls = (Array.isArray(rows) ? rows : [])
      .filter(call => isVisibleActiveCall(call))
      .sort((a, b) => callTimestamp(b) - callTimestamp(a))
      .slice(0, limit);

    return Response.json({
      success: true,
      calls,
      filtered_out: Math.max(0, (Array.isArray(rows) ? rows.length : 0) - calls.length),
      status_based: true,
      fetched_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('getActiveDispatchCalls failed', error);
    return Response.json(
      { error: error?.message || 'Unable to load active dispatch calls' },
      { status: Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(String(error?.message)) ? 429 : 500 },
    );
  }
});