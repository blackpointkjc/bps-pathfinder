import { isOutOfOffice } from './absencePolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T00:00:00.000Z';
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
const lower = (x: unknown) => String(x || '').trim().toLowerCase();
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

  const me = await api.auth.me().then(__limitFullAccess);
  if (!me?.email) return Response.json({error:'Login required'}, {status:401});
  const data = await req.json();
  const email = lower(data.officer_email);
  if (!email || !data.clock_in || !data.location) return Response.json({error:'Officer, clock-in time and location required'}, {status:400});
  const privileged = me.role === 'admin' || (me.additional_roles || []).includes('full_access');
  if (!privileged && email !== lower(me.email)) return Response.json({error:'Cannot clock in another officer'}, {status:403});
  const matches=await api.asServiceRole.entities.User.filter({email},undefined,1);
  if(matches[0]&&isOutOfOffice(matches[0]))return Response.json({error:'Approved leave or out-of-office coverage is active; clock-in is blocked until return.'},{status:409});
  const recent = await api.asServiceRole.entities.CallOut.filter({officer_email:email}, '-created_date', 100);
  const restriction = (recent || []).filter((row:any) => row.call_out_type === 'sent_home' && row.voided !== true)
    .map((row:any) => new Date(row.created_date || 0).getTime()).filter((n:number)=>Number.isFinite(n)).sort((a:number,b:number)=>b-a)[0];
  const end = restriction ? restriction + 12*3600000 : 0;
  if (end > Date.now()) return Response.json({error:`Clock-in blocked until ${new Date(end).toISOString()} after sent-home event`,eligible_at:new Date(end).toISOString()}, {status:423});
  const existing = await api.asServiceRole.entities.TimeEntry.filter({officer_email:email}, '-clock_in', 40);
  const open=(existing||[]).find((row:any)=>row.clock_in&&!row.clock_out&&row.archived!==true);
  if(open){
    const oldSite=String(open.location||'').split(' - ')[0].trim().toLowerCase();
    const newSite=String(data.location||'').split(' - ')[0].trim().toLowerCase();
    if(oldSite===newSite)return Response.json({success:true,entry:open,already_clocked_in:true,message:'The existing active shift was recovered; no duplicate punch was created.'});
    return Response.json({error:`You already have an open shift at ${oldSite||'another site'}. Use Switch Site to transfer without losing hours.`,active_entry_id:open.id},{status:409});
  }
  const saved = await api.asServiceRole.entities.TimeEntry.create({...data,officer_email:email});
  return Response.json({success:true,entry:saved});
 } catch(error:any) { return Response.json({error:error?.message || 'Unable to clock in'}, {status:500}); }
});
