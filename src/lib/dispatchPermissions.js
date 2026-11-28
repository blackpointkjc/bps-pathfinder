// Dispatch Center is a distinct privileged workstation, not a generic CAD permission.
export function canAccessDispatchCenter(user) {
 if(!user||user.disabled===true||user.portal_approved===false)return false;
 const roles=new Set([user.role,...(Array.isArray(user.additional_roles)?user.additional_roles:[])].filter(Boolean).map(r=>String(r).trim().toLowerCase()));
 if(['client','student','visitor'].some(r=>roles.has(r)||String(user.user_type||'').toLowerCase()===r||String(user.rank||'').trim().toLowerCase()===r))return false;
 if([user.account_status,user.employment_status].some(v=>['denied','suspended','terminated','disabled','inactive'].includes(String(v||'').trim().toLowerCase())))return false;
 const termination=Date.parse(user.termination_date||'');
 if(Number.isFinite(termination)&&termination<=Date.now())return false;
 return roles.has('dispatch')||roles.has('dispatcher')||user.dispatch_role===true;
}
export const canEditIncidentPriority=canAccessDispatchCenter;

export const canAccessCadAdminPages=user=>!!user&&user.role==='admin'&&!user.disabled&&!user.termination_date&&user.portal_approved!==false&&!['suspended','denied','terminated','disabled','inactive'].includes(String(user.account_status||'').toLowerCase())&&!['terminated','suspended'].includes(String(user.employment_status||'').toLowerCase())&&!['client','student','visitor'].some(r=>String(user.user_type||'').toLowerCase()===r||(user.additional_roles||[]).map(x=>String(x).toLowerCase()).includes(r));
