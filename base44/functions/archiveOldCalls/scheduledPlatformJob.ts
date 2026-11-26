// Workflow requests are authenticated by the Base44 SDK. A scheduled flag is
// only a job selector; it never authenticates a public or ordinary user.
export function isScheduledPlatformJob(user:any,body:any){
 if(body?.scheduled!==true||!user||user.disabled||user.termination_date)return false;
 if(['terminated','suspended','denied','locked'].some(s=>[user.account_status,user.employment_status].map(v=>String(v||'').toLowerCase()).includes(s)))return false;
 if([user.user_type,...(user.additional_roles||[])].some(v=>['visitor','client','student'].includes(String(v||'').toLowerCase())))return false;
 return user.is_service===true||user.role==='admin';
}
