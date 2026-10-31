import { createClientFromRequest } from 'npm:@base44/sdk';
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
  if(!['a','b'].includes(platoon)||n(officer.platoon)!==platoon)return false;
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
    const api=createClientFromRequest(req); const actor=await api.auth.me();
    const roles=new Set([actor?.role,...(actor?.additional_roles||[])].map(lower));
    if(!actor || !(roles.has('admin') || roles.has('supervisor') || roles.has('full_access') || actor.is_supervisor===true || supervisorRanks.has(lower(actor.rank)))) return Response.json({error:'Supervisor authorization required'},{status:403});
    const input=await req.json();const email=lower(input.officer_email);const date=String(input.call_out_date||'');
    if(!email || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({error:'Select an officer and shift date'},{status:400});
    const {matching,officer}=await callOutContext(api,email,date);
    if (!canOversee(actor,officer))return Response.json({error:'Officer is outside your assigned platoon and operating area'},{status:403});
    return Response.json({shifts:matching.sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time))).map(shift=>({id:shift.id,shift_date:shift.shift_date,start_time:shift.start_time,end_time:shift.end_time,location:shift.location,attendance_status:shift.attendance_status}))});
  } catch(error) {return Response.json({error:error?.message||'Unable to load shifts'},{status:500});}
});
