import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
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

function easternPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function validBpsReference(value: unknown) {
  return /^BPS-\d{6}-\d{1,8}$/i.test(String(value || '').trim());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('cad_access') && !roles.has('full_access')) {
      return Response.json({ error: 'CAD access required' }, { status: 403 });
    }

    const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
    const groups = new Map<string, any[]>();
    for (const call of calls || []) {
      if (validBpsReference(call.bps_reference)) continue;
      const date = new Date(call.time_received || call.created_date || Date.now());
      const period = easternPeriod(Number.isNaN(date.getTime()) ? new Date() : date);
      groups.set(period, [...(groups.get(period) || []), call]);
    }

    let updated = 0;
    for (const [period, records] of groups) {
      const counterKey = `bps_dispatch_call:${period}`;
      let counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
      const highest = (calls || []).reduce((max: number, call: any) => {
        const match = String(call.bps_reference || call.call_id || '').match(/^BPS-(\d{6})-(\d{1,8})$/i);
        return Math.max(max, match && match[1] === period ? Number(match[2]) : 0);
      }, Number(counter?.last_number || 0));
      if (!counter) counter = await base44.asServiceRole.entities.CadCounter.create({ counter_key: counterKey, last_number: highest });

      let next = Math.max(highest, Number(counter.last_number || 0));
      records.sort((a, b) => new Date(a.time_received || a.created_date || 0).getTime() - new Date(b.time_received || b.created_date || 0).getTime());
      for (const call of records) {
        next += 1;
        if (next > 99_999_999) throw new Error(`The ${period} BPS sequence has reached its eight-digit limit.`);
        const bpsReference = `BPS-${period}-${next}`;
        const officialCad = String(call.agency_cad_number || '').trim();
        const legacyCallId = String(call.call_id || '').trim();
        const legacyLooksInternal = /^B\d+$/i.test(legacyCallId) || /^[A-L]\d{1,8}$/i.test(legacyCallId) || legacyCallId.startsWith('grac-');
        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
          bps_reference: bpsReference,
          call_id: officialCad || (!legacyLooksInternal && legacyCallId ? legacyCallId : bpsReference),
          cad_number_source: officialCad ? 'official_government_feed' : 'bps_internal',
          official_cad_verified: Boolean(officialCad),
        });
        updated += 1;
      }
      await base44.asServiceRole.entities.CadCounter.update(counter.id, { last_number: next });
    }

    return Response.json({ success: true, updated });
  } catch (error) {
    console.error('ensureCadNumbers failed', error);
    return Response.json({ error: error?.message || 'Unable to repair call references' }, { status: 500 });
  }
});