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
const norm=(v:any)=>String(v||'').trim().toLowerCase();
Deno.serve(async req=>{try{const base44=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;
const me=await base44.auth.me();if(!me)return Response.json({error:'Unauthorized'},{status:401});const body=await req.json().catch(()=>({}));const requested=(Array.isArray(body.emails)?body.emails:[body.email]).map(norm).filter(Boolean);if(!requested.length)return Response.json({emails:[]});const [users,creds,prefs]=await Promise.all([base44.asServiceRole.entities.User.list(undefined,5000),base44.asServiceRole.entities.MicrosoftOAuthCredential.list('-last_refreshed_at',5000).catch(()=>[]),base44.asServiceRole.entities.EmailRecipientPreference.list('-updated_date',5000).catch(()=>[])]);const byLogin=new Map((users||[]).filter((u:any)=>u?.email).map((u:any)=>[norm(u.email),u]));const credByUser=new Map();for(const c of creds||[]){if(c?.active===false||!c?.user_id||!c?.microsoft_email)continue;if(!credByUser.has(String(c.user_id)))credByUser.set(String(c.user_id),norm(c.microsoft_email));}const prefByLogin=new Map((prefs||[]).filter((p:any)=>p?.active!==false&&p?.login_email&&p?.work_email).map((p:any)=>[norm(p.login_email),norm(p.work_email)]));const emails=requested.map((address:string)=>{const u=byLogin.get(address);return prefByLogin.get(address)|| (u?.id?credByUser.get(String(u.id)):null)||address;});return Response.json({emails,mapping:Object.fromEntries(requested.map((x:string,i:number)=>[x,emails[i]]))});}catch(e){return Response.json({error:e?.message||String(e)},{status:500});}});