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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;
const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const supervisorRanks = new Set(['sergeant','first sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);

const canOversee = (actor:any,officer:any) => {
  const n=(value:any)=>String(value||'').trim().toLowerCase().replace(/[.]/g,'');
  const roles=new Set([actor.role,...(actor.additional_roles||[])].map(n));
  if(roles.has('admin')||roles.has('full_access'))return true;
const hierarchy=['colonel','lt colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'];
  const level=(value:any)=>{const raw=n(value);return hierarchy.indexOf(raw==='lieutenant colonel'||raw==='lt col'?'lt colonel':raw);};
  if(level(actor.rank)<0||level(officer.rank)<=level(actor.rank))return false;
  const platoon=n(actor.oversight_platoon||actor.platoon);
  if((!platoon || platoon==='command')||n(officer.platoon)!==platoon)return false;
  if(!n(actor.division)||!n(actor.subdivision)||n(officer.division)!==n(actor.division)||n(officer.subdivision)!==n(actor.subdivision))return false;
  return ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(n(actor.rank))
    || Boolean(n(actor.substation)&&n(officer.substation)===n(actor.substation));
};
const identityEmails = (person:any) => [...new Set([person.email, person.work_email, person.pathfinder_email, person.microsoft_email, person.outlook_email, ...(person.email_aliases || [])].map(lower).filter(Boolean))];
async function callOutContext(api:any, email:string, date:string) {
  const users:any[]=[];
  for(let skip=0;skip<20000;skip+=500) {
    const page=await api.asServiceRole.entities.User.list('-id',500,skip);
    users.push(...page);
    if(page.length<500)break;
    if(skip===19500)throw new Error('Officer directory is incomplete; retry with support.');
  }
  const matches=users.filter(person=>identityEmails(person).includes(email));
  if(matches.length!==1)throw new Error('Officer identity could not be uniquely verified. Refresh the officer list.');
  const officer=matches[0]; const aliases=new Set(identityEmails(officer));
  for(const address of [...aliases]) {
    const [mailbox,domain]=address.split('@');
    if(!['blackpointkjc.com','officer.blackpointkjc.com','employee.blackpointkjc.com'].includes(domain))continue;
    const owners=users.filter(person=>identityEmails(person).some(a=>a.split('@')[0]===mailbox));
    if(owners.length===1)for(const suffix of ['blackpointkjc.com','officer.blackpointkjc.com','employee.blackpointkjc.com'])aliases.add(mailbox+'@'+suffix);
  }
  const schedules:any[]=[];
  for(let skip=0;skip<10000;skip+=500) {
    const page=await api.asServiceRole.entities.Schedule.filter({shift_date:date},'-id',500,skip);
    schedules.push(...page);
    if(page.length<500)break;
    if(skip===9500)throw new Error('Shift list is incomplete. Retry with support.');
  }
  const matching=schedules.filter(shift=>aliases.has(lower(shift.officer_email)) && shift.archived!==true && shift.is_open!==true);
  return {officer, schedules, matching, aliases};
}

Deno.serve(async req => {
  try {
    const api=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;
 const actor=await api.auth.me().then(__limitFullAccess);
    const roles=new Set([actor?.role,...(actor?.additional_roles||[])].map(lower));
    if(!actor || !(roles.has('admin') || roles.has('supervisor') || roles.has('full_access') || actor.is_supervisor===true || supervisorRanks.has(lower(actor.rank)))) return Response.json({error:'Supervisor authorization required'},{status:403});
    const input=await req.json();const email=lower(input.officer_email);const date=String(input.call_out_date||'');
    if(!email || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({error:'Select an officer and shift date'},{status:400});
    const {matching,officer}=await callOutContext(api,email,date);
    if (!canOversee(actor,officer))return Response.json({error:'Officer is outside your assigned platoon and operating area'},{status:403});
    return Response.json({shifts:matching.sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time))).map(shift=>({id:shift.id,shift_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,location:shift.location,attendance_status:shift.attendance_status}))});
  } catch(error) {return Response.json({error:error?.message||'Unable to load shifts'},{status:500});}
});
