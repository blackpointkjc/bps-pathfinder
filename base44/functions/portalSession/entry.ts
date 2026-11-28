const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import {createClient,createClientFromRequest} from 'npm:@base44/sdk';
import {portalSessionState} from '../../shared/portalLoginGuard.ts';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
const IDLE_MS=13*60*60*1000;
const digest=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const inactive=user=>!user||user.disabled||(user.termination_date&&Date.parse(user.termination_date)<=Date.now())||['denied','terminated','suspended'].includes(String(user.account_status||user.employment_status||'').toLowerCase());
const temporarilyUnavailable=()=>Response.json({error:'Secure session service is temporarily unavailable. Retry connection.',code:'SESSION_STORE_UNAVAILABLE'},{status:503,headers:{'Retry-After':'2'}});
const expired=()=>Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
export default async function(req){
 try{
  const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities;
  const body=await req.json().catch(()=>({}));
  if(body.action==='sign_in'){
   const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   if(!email||!password||email.length>254||password.length>1024)return Response.json({error:'Enter a valid email and password.'},{status:400});
   const client=createClient({appId:'694de31c7e0f5645fb95de52',serverUrl:'https://base44.app',requiresAuth:false});
   let result;try{result=await client.auth.loginViaEmailPassword(email,password);}catch(error){const status=Number(error?.status||error?.response?.status)||503;console.error('Native sign-in rejected',{status,code:String(error?.data?.error_type||error?.response?.data?.error_type||'provider_error')});return Response.json({error:status===429?'Too many sign-in attempts. Please wait and retry.':status>=500?'The sign-in provider is unavailable. Your password was not checked; please retry.':'The account provider did not accept this email and password. If you previously used Microsoft sign-in, use Forgot password to create your Pathfinder password.',code:status>=500?'AUTH_PROVIDER_UNAVAILABLE':'AUTH_PROVIDER_REJECTED'},{status:status>=500?503:status===429?429:401});}
   if(!result.access_token)return Response.json({error:'Sign-in could not be confirmed.'},{status:401});
   client.auth.setToken(result.access_token);
   const user=await client.auth.me().then(__portalAppIdentity);
   if(inactive(user))return Response.json({error:'Your account is not active. Contact administration.'},{status:403});
   const locks=await db.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
   if(locks.length)return Response.json({error:'Your account is locked. Contact administration.'},{status:403});
   const now=new Date().toISOString(),token_hash=await digest(result.access_token);
   const existing=await db.PortalAuthSession.filter({token_hash},'-created_date',1);
   const value={user_id:user.id,token_hash,started_at:now,last_activity_at:now,revoked:false,revoked_at:''};
   if(existing[0])await db.PortalAuthSession.update(existing[0].id,value);else await db.PortalAuthSession.create(value);
   return Response.json({access_token:result.access_token,user:{id:user.id},session_started_at:now});
  }
  const user=await sdk.auth.me().then(__portalAppIdentity).catch(error=>{if([401,403].includes(Number(error?.status||error?.response?.status)))return null;throw error;});
  if(inactive(user))return expired();
  const token=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return expired();
  // A platform token rotation must never end a live portal session. The shared
  // guard re-binds the newest token to the account's active session row.
  const sessionState=await portalSessionState(req,sdk,user);
  if(sessionState.state==='invalid')return expired();
  if(sessionState.state==='unknown')return temporarilyUnavailable();
  const row=sessionState.row||{};
  const locks=await db.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
  if(locks.length)return expired();
  if(body.action==='sign_out'){
   if(row.id)await db.PortalAuthSession.update(row.id,{revoked:true,revoked_at:new Date().toISOString()});
   return Response.json({success:true});
  }
  if(!['check','activity','bootstrap'].includes(body.action))return Response.json({error:'Unknown session action.'},{status:400});
  if(body.action==='activity'&&row.id)await db.PortalAuthSession.update(row.id,{last_activity_at:new Date().toISOString()});
  if(body.action==='bootstrap'){
   const saved=await db.User.get(user.id);
   if(!saved||String(saved.id)!==String(user.id))return temporarilyUnavailable();
   if(inactive(saved))return expired();
   const profile=__portalAppIdentity({...user,...saved});
   profile.additional_roles=(profile.additional_roles||[]).filter(role=>String(role).toLowerCase()!=='full_access'||String(profile.id)==='6ae7d733d4b1a647cd3e6f38');
   const assigned=profile.role==='admin'||profile.additional_roles.length>0||['investigator','reviewer'].includes(profile.ps_role);
   // Approved users need no invitation search, role cleanup scan or extra
   // profile round-trip. Pending/mismatched accounts retain onboarding flow.
   return Response.json({success:true,session_started_at:row.started_at,profile,needs_registration:!assigned||profile.portal_approved!==assigned,inactivity_minutes:780});
  }
  return Response.json({success:true,session_started_at:row.started_at||'',inactivity_minutes:780});
 }catch(error){const status=Number(error?.status||error?.response?.status);if(status===429){const seconds=String(error?.message||'').match(/retry after\s+(\d+(?:\.\d+)?)\s*s/i)?.[1]||'2';return Response.json({error:'Secure session verification is temporarily rate limited.',code:'SESSION_STORE_UNAVAILABLE'},{status:429,headers:{'Retry-After':seconds}});}console.warn('Portal verification temporarily unavailable',status||'network');return temporarilyUnavailable();}
}