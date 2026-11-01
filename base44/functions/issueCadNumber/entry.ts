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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function easternDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string, fallback: string) => parts.find(part => part.type === type)?.value || fallback;
  return {
    year: get('year', String(date.getUTCFullYear())),
    month: get('month', String(date.getUTCMonth() + 1).padStart(2, '0')),
    day: get('day', String(date.getUTCDate()).padStart(2, '0')),
  };
}

function parseBpsSequence(value: unknown, period: string) {
  const match = String(value || '').trim().match(/^BPS-(\d{6})-(\d{1,8})$/i);
  return match && match[1] === period ? Number(match[2]) : 0;
}

async function acquireCounterLease(base44: any, counterKey: string, period: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let counter = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
    if (!counter) {
      const calls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 5000);
      const highest = (calls || []).reduce((max: number, call: any) =>
        Math.max(max, parseBpsSequence(call.bps_reference || call.call_id, period)), 0);
      counter = await base44.asServiceRole.entities.CadCounter.create({
        counter_key: counterKey,
        last_number: highest,
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      });
    }

    const now = Date.now();
    if (new Date(counter.ingestion_locked_until || 0).getTime() > now) {
      await wait(120 + attempt * 80);
      continue;
    }

    const token = crypto.randomUUID();
    await base44.asServiceRole.entities.CadCounter.update(counter.id, {
      ingestion_lock_token: token,
      ingestion_locked_until: new Date(now + 10_000).toISOString(),
    });
    await wait(120);
    const verified = (await base44.asServiceRole.entities.CadCounter.filter({ counter_key: counterKey }))?.[0];
    if (verified?.id === counter.id && verified?.ingestion_lock_token === token) return verified;
  }
  throw new Error('BPS reference generator is busy. Please try again.');
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
    const authorized = user.role === 'admin' || user.role === 'dispatch' || roles.has('cad_access') || roles.has('full_access');
    if (!authorized) return Response.json({ error: 'CAD access required' }, { status: 403 });

    const { year, month } = easternDateParts(new Date());
    const period = `${year}${month}`;
    const counterKey = `bps_dispatch_call:${period}`;
    const counter = await acquireCounterLease(base44, counterKey, period);

    try {
      const next = Number(counter.last_number || 0) + 1;
      if (next > 99_999_999) throw new Error(`The ${period} BPS sequence has reached its eight-digit limit.`);
      const bpsReference = `BPS-${period}-${next}`;
      await base44.asServiceRole.entities.CadCounter.update(counter.id, {
        last_number: next,
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      });
      return Response.json({
        success: true,
        bps_reference: bpsReference,
        cad_number: bpsReference,
        sequence: next,
        period,
        official: false,
      });
    } catch (error) {
      await base44.asServiceRole.entities.CadCounter.update(counter.id, {
        ingestion_lock_token: '',
        ingestion_locked_until: new Date(0).toISOString(),
      }).catch(() => null);
      throw error;
    }
  } catch (error) {
    console.error('issueCadNumber failed', error);
    return Response.json({ error: error?.message || 'Unable to issue BPS reference' }, { status: 500 });
  }
});