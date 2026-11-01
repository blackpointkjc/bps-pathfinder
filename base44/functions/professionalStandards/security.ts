import { createClientFromRequest } from 'npm:@base44/sdk';

export const text = (v, max=500) => String(v ?? '').trim().slice(0,max);
export const roles = u => new Set([u?.role,...(u?.additional_roles||[])].map(v=>String(v).toLowerCase()));
export const terminated = u => !u || u.disabled || u.termination_date || ['terminated','suspended','denied'].includes(String(u.account_status||u.employment_status||'').toLowerCase());
export const manager = u => !terminated(u) && (u.role==='admin'||roles(u).has('full_access'));
export const psRole = u => terminated(u) || ['visitor','student','client'].some(r=>roles(u).has(r)) ? '' : manager(u) ? 'reviewer' : ['investigator','reviewer'].includes(u.ps_role) ? u.ps_role : '';
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof Uint8Array ? value : new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const random = (n=24) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
export async function identity(base44) {
  const u=await base44.auth.me().catch(()=>null);
  if(!u?.id||terminated(u))fail('Sign in with an active account.',401);
  const locks=await base44.asServiceRole.entities.AccountLock.filter({user_id:u.id,locked:true},'-created_date',1);
  if(locks.length)fail('Your account is locked.',403);
  return u;
}
export const actorName = u => [u?.rank,u?.last_name].filter(Boolean).join(' ')||u?.full_name||u?.email||'Public submitter';
export async function audit(db,u,action,caseId='',details='') {
  await db.PSAudit.create({case_id:caseId,actor_id:u?.id||'',actor_name:actorName(u),action,details:text(details,2000)});
}
export async function notify(base44,to,subject,body) {
  if(!to)return false;
  try{await base44.asServiceRole.integrations.Core.SendEmail({to,subject,body});return true;}catch{try{const {companyDelivery}=await import('./delivery.ts');return await companyDelivery(base44,to,subject,body);}catch{return false;}}
}
export {createClientFromRequest};
