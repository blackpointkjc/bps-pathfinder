const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { isOutOfOffice } from './absencePolicy.ts';
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
const lower = (v: unknown) => String(v || '').trim().toLowerCase();
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
    if (!me?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const officer=await base44.asServiceRole.entities.User.get(me.id);
    if(isOutOfOffice(officer))return Response.json({success:true,allowed:false,out_of_office:true,error:'Approved leave or out-of-office coverage is active.'});
    const rows = await base44.asServiceRole.entities.CallOut.filter({ officer_email: lower(me.email) }, '-created_date', 100);
    const latest = (rows || []).filter((row: any) => row.call_out_type === 'sent_home' && row.voided !== true)
      .map((row: any) => new Date(row.created_date || 0).getTime()).filter((stamp: number) => Number.isFinite(stamp)).sort((a:number,b:number) => b-a)[0];
    const remaining = latest ? Math.max(0, 12 * 3600000 - (Date.now() - latest)) : 0;
    return Response.json({ success:true, allowed:remaining === 0, remaining_minutes:Math.ceil(remaining/60000), eligible_at:remaining ? new Date(latest + 12*3600000).toISOString() : null });
  } catch (error: any) {
    return Response.json({error:error?.message || 'Unable to check clock-in eligibility'}, {status:500});
  }
});
