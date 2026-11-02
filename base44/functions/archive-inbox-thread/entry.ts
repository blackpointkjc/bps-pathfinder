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

    const currentUser = await base44.auth.me().then(__portalAppIdentity);
    if (!currentUser?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { thread_key } = await req.json();
    if (!thread_key || typeof thread_key !== 'string') {
      return Response.json({ error: 'thread_key is required' }, { status: 400 });
    }

    const userEmail = String(currentUser.email).trim().toLowerCase();
    const hiddenAt = new Date().toISOString();
    const allPreferences = await base44.asServiceRole.entities.InboxThreadPreference.list('-created_date', 1000);
    const existing = (allPreferences || []).filter((item) =>
      String(item.user_email || '').trim().toLowerCase() === userEmail && item.thread_key === thread_key
    );

    let preference;
    if (existing.length) {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.update(existing[0].id, {
        user_email: userEmail,
        hidden: true,
        hidden_at: hiddenAt,
      });
      for (const duplicate of existing.slice(1)) {
        await base44.asServiceRole.entities.InboxThreadPreference.delete(duplicate.id).catch(() => null);
      }
    } else {
      preference = await base44.asServiceRole.entities.InboxThreadPreference.create({
        user_email: userEmail,
        thread_key,
        hidden: true,
        hidden_at: hiddenAt,
      });
    }

    return Response.json({ success: true, preference });
  } catch (error) {
    console.error('archive-inbox-thread failed', error);
    return Response.json({ error: error?.message || 'Unable to archive conversation' }, { status: 500 });
  }
});