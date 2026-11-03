const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';

export const text = (v, max=500) => String(v ?? '').trim().slice(0,max);
export const roles = u => new Set([u?.role,...(u?.additional_roles||[])].map(v=>String(v).toLowerCase()));
export const terminated = u => !u || u.disabled || (u.termination_date && Number.isFinite(Date.parse(u.termination_date)) && Date.parse(u.termination_date)<=Date.now()) || ['terminated','suspended','denied'].includes(String(u.account_status||u.employment_status||'').toLowerCase());
export const manager = u => !terminated(u) && (u.role==='admin'||String(u.id)==='6ae7d733d4b1a647cd3e6f38'&&roles(u).has('full_access'));
export const psRole = u => terminated(u) || ['visitor','student','client'].some(r=>roles(u).has(r)||u.user_type===r) ? '' : (roles(u).has('ia') || String(u.id)==='6ae7d733d4b1a647cd3e6f38'&&roles(u).has('full_access')) ? u.ps_role==='reviewer'?'reviewer':'investigator' : '';
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof Uint8Array ? value : new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const random = (n=24) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
export async function identity(base44) {
  const u=await base44.auth.me().then(__portalAppIdentity).catch(()=>null);
  if(!u?.id||terminated(u))fail('Sign in with an active account.',401);
  const locks=await base44.asServiceRole.entities.AccountLock.filter({user_id:u.id,locked:true},'-created_date',1);
  if(locks.length)fail('Your account is locked.',403);
  return u;
}
export const actorName = u => [u?.rank,u?.last_name].filter(Boolean).join(' ')||u?.full_name||u?.email||'Public submitter';
export async function audit(db,u,action,caseId='',details='') {
  await db.PSAudit.create({case_id:caseId,actor_id:u?.id||'',actor_name:actorName(u),action,details:text(details,2000)});
}
export async function notify(base44,to,subject,body,actor=null,existingId='',html=false) {
 if(!to)return false;
 const db=base44.asServiceRole.entities;
 let item;
 try{
  const prior=existingId?await db.PSNotification.get(existingId):null;
  const value={to,subject,body,status:'sending',last_error:'',last_attempt_at:new Date().toISOString(),attempts:Number(prior?.attempts||0)+1};
  item=prior?await db.PSNotification.update(prior.id,value):await db.PSNotification.create(value);
 }catch{}
 let delivered=false,lastError='';
 try{const {companyDelivery}=await import('./delivery.ts');delivered=await companyDelivery(base44,to,subject,body,actor,html);}catch(error){lastError=String(error?.message||'The IA shared mailbox could not send the message. Reconnect Microsoft from Colonel Hiers’ Mail settings.').slice(0,600);}
 if(item)await db.PSNotification.update(item.id,{status:delivered?'sent':'failed',last_error:delivered?'':lastError,...(delivered?{sent_at:new Date().toISOString()}:{})});
 return delivered;
}
export {createClientFromRequest};
