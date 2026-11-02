const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
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

const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

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

    const user = await base44.auth.me().then(__portalAppIdentity).catch(() => null);
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const resolveProfile = async () => {
      const direct = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
      if (direct && String(direct.email || '').toLowerCase() === String(user.email || '').toLowerCase()) return direct;
      const rows = await base44.asServiceRole.entities.User.filter({ email: user.email }, '-updated_date', 1).catch(() => []);
      return rows?.[0] || null;
    };

    if (String(body.action || '').toLowerCase() === 'get') {
      const profile = await resolveProfile();
      return Response.json({
        success: true,
        address: clean(profile?.address, 160),
        city: clean(profile?.city, 80),
        state: clean(profile?.state, 2).toUpperCase(),
        zip: clean(profile?.zip, 12),
      });
    }

    const address = clean(body.address, 160);
    const city = clean(body.city, 80);
    const state = clean(body.state, 2).toUpperCase();
    const zip = clean(body.zip, 12);

    if (!address) return Response.json({ error: 'Street address is required' }, { status: 400 });
    if (!city) return Response.json({ error: 'City is required' }, { status: 400 });
    if (!state) return Response.json({ error: 'State is required' }, { status: 400 });
    if (!zip) return Response.json({ error: 'ZIP code is required' }, { status: 400 });

    // Self-service only: the authenticated user's id is the only update target.
    const profile = await resolveProfile();
    if (!profile?.id) return Response.json({ error: 'Unable to locate your officer profile.' }, { status: 404 });
    await base44.asServiceRole.entities.User.update(profile.id, { address, city, state, zip });
    const verified = await base44.asServiceRole.entities.User.get(profile.id);
    if ([['address',address],['city',city],['state',state],['zip',zip]].some(([key,value]) => String(verified?.[key] || '').trim() !== value)) throw new Error('Address could not be verified after saving. Please retry.');

    return Response.json({
      success: true,
      address,
      city,
      state,
      zip,
    });
  } catch (error: any) {
    console.error('updateMyHomeAddress failed', error);
    return Response.json({ error: error?.message || 'Unable to update Home address' }, { status: 500 });
  }
});
