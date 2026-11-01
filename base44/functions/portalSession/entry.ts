import {createClient,createClientFromRequest} from 'npm:@base44/sdk';
const __portalReauthAfter = '2026-11-01T22:38:04.000Z';
const IDLE_MS=30*60*1000;
const digest=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const inactive=user=>!user||user.disabled||user.termination_date||['denied','terminated','suspended'].includes(String(user.account_status||user.employment_status||'').toLowerCase());
const expired=()=>Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
export default async function(req){
 try{
  const sdk=createClientFromRequest(req),db=sdk.asServiceRole.entities;
  const body=await req.json().catch(()=>({}));
  if(body.action==='sign_in'){
   const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   if(!email||!password||email.length>254||password.length>1024)return Response.json({error:'Enter a valid email and password.'},{status:400});
   const client=createClient({appId:'694de31c7e0f5645fb95de52',serverUrl:'https://base44.app',requiresAuth:false});
   let result;try{result=await client.auth.loginViaEmailPassword(email,password);}catch{return Response.json({error:'Unable to sign in. Check your email and password, and verify your email if this is a new account.'},{status:401});}
   if(!result.access_token)return Response.json({error:'Sign-in could not be confirmed.'},{status:401});
   const user=await client.auth.me();
   if(inactive(user))return Response.json({error:'Your account is not active. Contact administration.'},{status:403});
   const locks=await db.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
   if(locks.length)return Response.json({error:'Your account is locked. Contact administration.'},{status:403});
   const now=new Date().toISOString(),token_hash=await digest(result.access_token);
   const existing=await db.PortalAuthSession.filter({token_hash},'-created_date',1);
   const value={user_id:user.id,token_hash,started_at:now,last_activity_at:now,revoked:false,revoked_at:''};
   if(existing[0])await db.PortalAuthSession.update(existing[0].id,value);else await db.PortalAuthSession.create(value);
   return Response.json({access_token:result.access_token,user:{id:user.id},session_started_at:now});
  }
  const user=await sdk.auth.me().catch(()=>null);
  if(inactive(user))return expired();
  const token=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return expired();
  const rows=await db.PortalAuthSession.filter({token_hash:await digest(token)},'-created_date',1),row=rows[0];
  if(!row||row.user_id!==user.id||row.revoked||Date.parse(row.started_at)<Date.parse(__portalReauthAfter)||Date.now()-Date.parse(row.last_activity_at)>=IDLE_MS)return expired();
  const locks=await db.AccountLock.filter({user_id:user.id,locked:true},'-created_date',1);
  if(locks.length)return expired();
  if(body.action==='sign_out'){
   await db.PortalAuthSession.update(row.id,{revoked:true,revoked_at:new Date().toISOString()});
   return Response.json({success:true});
  }
  if(!['check','activity'].includes(body.action))return Response.json({error:'Unknown session action.'},{status:400});
  if(body.action==='activity')await db.PortalAuthSession.update(row.id,{last_activity_at:new Date().toISOString()});
  return Response.json({success:true,session_started_at:row.started_at,inactivity_minutes:30});
 }catch{return Response.json({error:'Your session could not be verified. Please sign in again.'},{status:503});}
}
