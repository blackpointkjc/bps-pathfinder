const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { validateBatch } from './batchPolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';
import {sendCreditFreeEmail} from './creditFreeEmail.ts';
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
const __limitFullAccess = (user:any) => user && String(user.id)!=='6ae7d733d4b1a647cd3e6f38' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
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
const displayName = (user: any) => [user?.rank, user?.last_name].filter(Boolean).join(' ').trim() || user?.full_name || user?.email || 'Supervisor';

const escapeMail=(value:any)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const supervisorHtml=(row:any,kind:string)=>`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#090c14;font-family:Arial,sans-serif;color:#f2f5f9"><table role="presentation" width="100%" style="background:#090c14"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="100%" style="max-width:600px;background:#111d2d;border:1px solid #d4af37;border-radius:13px"><tr><td align="center" style="padding:22px;background:#080b13"><img src="https://bpspf.blackpointkjc.com/black-point-shield.webp" alt="BlackPoint" width="170" style="max-width:100%;height:auto"><p style="color:#d4af37;letter-spacing:3px;font-size:12px">DUTY SUPERVISOR SCHEDULING</p></td></tr><tr><td style="padding:28px"><h1 style="font-size:23px;color:#ffffff">Duty assignment ${escapeMail(kind)}</h1><p>Your duty supervisor coverage has been ${escapeMail(kind)}.</p><p style="color:#cbd5e1;line-height:1.8"><strong>Date:</strong> ${escapeMail(row.assignment_date)}<br><strong>Hours:</strong> ${escapeMail(row.start_time)} – ${escapeMail(row.end_time)}<br><strong>Location:</strong> ${escapeMail(row.location||'All Sites')}</p><a href="https://bpspf.blackpointkjc.com/DutySupervisorScheduling" style="display:inline-block;margin-top:14px;padding:13px 20px;background:#d4af37;color:#111;text-decoration:none;font-weight:bold;border-radius:8px">View Duty Schedule</a></td></tr><tr><td style="padding:18px 28px;border-top:1px solid #30445b;color:#a7b6ca;font-size:12px">BlackPoint Pathfinder · Automated scheduling notice</td></tr></table></td></tr></table></body></html>`;
async function notifyDutyAssignment(base44:any,row:any,kind:string){
 const recipient=lower(row?.supervisor_email);
 if(!recipient||recipient==='open')return {email_status:'skipped'};
 const title='Duty supervisor assignment '+kind;
 await base44.asServiceRole.entities.Notification.create({recipient_email:recipient,type:'schedule_changed',title,message:'Your duty coverage on '+row.assignment_date+' ('+row.start_time+' – '+row.end_time+') at '+(row.location||'All Sites')+' was '+kind+'. Review your duty schedule.',priority:'high',is_read:false,requires_acknowledgment:true,source_name:'Duty Supervisor Scheduling'}).catch(error=>console.warn('Duty supervisor in-app notice failed',String(error?.message||error)));
 const eventKey='duty:'+String(row.id||'')+':'+kind+':'+String(row.updated_date||new Date().toISOString());
 let status='failed',error='';
 try{await sendCreditFreeEmail(base44,{to:recipient,subject:'BlackPoint Pathfinder | '+title,body:supervisorHtml(row,kind)});status='accepted';}
 catch(reason){error=String(reason?.message||reason).slice(0,300);console.error('Duty supervisor email was not accepted',error);}
 try{await base44.asServiceRole.entities.ScheduleEmailDelivery.create({event_key:eventKey,recipient_email:recipient,status,subject:title,provider:'Microsoft 365',error,attempted_at:new Date().toISOString(),related_id:String(row.id||''),...(status==='accepted'?{accepted_at:new Date().toISOString()}: {})});}catch(reason){console.warn('Duty email receipt not saved',String(reason?.message||reason));}
 return {email_status:status,...(error?{email_error:error}:{})};
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const me = await base44.auth.me().then(__portalAppIdentity).then(__limitFullAccess);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map(lower));
    const rank = lower(me.rank).replace(/[.]/g, '').replace(/\s+/g, ' ');
    const supervisorRanks = ['corporal','sergeant','first sergeant','lieutenant','lt','captain','major','lt colonel','lieutenant colonel','lt col','colonel'];
    const allowed = me.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || me.is_supervisor === true || supervisorRanks.includes(rank);
    if (!allowed) return Response.json({ error: 'Duty supervisor scheduling requires administrator or supervisor access.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'list');
    if (action === 'list') {
      const assignments = await base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date', 1500);
      if(me.role==='admin'||roles.has('full_access'))return Response.json({success:true,assignments:assignments||[]});
      const users=await base44.asServiceRole.entities.User.list('last_name',1000);
      const allowed=new Set((users||[]).filter((person:any)=>canOversee(me,person)).map((person:any)=>lower(person.email)));
      allowed.add(lower(me.email));
      return Response.json({success:true,assignments:(assignments||[]).filter((row:any)=>allowed.has(lower(row.supervisor_email)))});
    }
    if(['batch','copy_week'].includes(action)){
      const users=await base44.asServiceRole.entities.User.list('id',2000);
      const existing=await base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date',5000);
      let rows=Array.isArray(body.assignments)?body.assignments:[];
      if(action==='copy_week'){
       if(!/^\d{4}-\d{2}-\d{2}$/.test(body.source_start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(body.target_start||''))return Response.json({error:'Source and target week dates are required.'},{status:400});
       const from=Date.parse(body.source_start+'T12:00:00Z'),to=Date.parse(body.target_start+'T12:00:00Z');
       rows=existing.filter(row=>row.status!=='cancelled'&&Date.parse(row.assignment_date+'T12:00:00Z')>=from&&Date.parse(row.assignment_date+'T12:00:00Z')<from+7*86400000&&(!body.supervisor_emails?.length||body.supervisor_emails.some(email=>lower(email)===lower(row.supervisor_email))))
        .map(row=>({assignment_date:new Date(Date.parse(row.assignment_date+'T12:00:00Z')+(to-from)).toISOString().slice(0,10),start_time:row.start_time,end_time:row.end_time,supervisor_email:row.supervisor_email,location:row.location,notes:row.notes}));
      }
      if(!rows.length||rows.length>200)return Response.json({error:'Select between 1 and 200 duty coverage blocks.'},{status:400});
      if(me.role!=='admin'&&!roles.has('full_access')&&rows.some((row:any)=>!users.some((person:any)=>lower(person.email)===lower(row.supervisor_email)&&canOversee(me,person))))
        return Response.json({error:'A selected duty supervisor is outside your platoon and operating area'},{status:403});
      const checked=validateBatch(rows,users,existing);
      if(checked.errors.length)return Response.json({error:checked.errors.join(' · '),validation_errors:checked.errors},{status:409});
      let created=0,email_failed=0,email_accepted=0;
      for(const row of checked.planned){const saved=await base44.asServiceRole.entities.DutySupervisorAssignment.create({...row,created_by_email:me.email,updated_by_email:me.email});created++;const result=await notifyDutyAssignment(base44,saved,'created');if(result.email_status==='accepted')email_accepted++;if(result.email_status==='failed')email_failed++;}
      return Response.json({success:true,created,skipped:checked.skipped,email_failed,email_accepted});
    }
    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'Assignment id is required.' }, { status: 400 });
      if(me.role!=='admin'&&!roles.has('full_access')){
        const existing=await base44.asServiceRole.entities.DutySupervisorAssignment.get(id);
        const users=await base44.asServiceRole.entities.User.filter({email:existing.supervisor_email},'-updated_date',1);
        if(!users[0]||!canOversee(me,users[0]))return Response.json({error:'Outside your assigned supervisor area'},{status:403});
      }
      const deletedAssignment=await base44.asServiceRole.entities.DutySupervisorAssignment.get(id);
      await base44.asServiceRole.entities.DutySupervisorAssignment.delete(id);
      const delivery=await notifyDutyAssignment(base44,deletedAssignment,'removed');
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'DutySupervisorAssignment', entity_id: id, action: 'delete', actor_id: String(me.id || me.email), actor_name: displayName(me), timestamp: new Date().toISOString(), description: 'Duty supervisor schedule assignment removed.'
      }).catch(() => null);
      return Response.json({ success: true, deleted: id, ...delivery });
    }

    const row = body.assignment || {};
    const required = ['assignment_date','start_time','end_time','supervisor_email'];
    for (const field of required) if (!String(row[field] || '').trim()) return Response.json({ error: `${field.replaceAll('_',' ')} is required.` }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 1000);
    const supervisor = (users || []).find((user: any) => lower(user.email) === lower(row.supervisor_email));
    if (!supervisor) return Response.json({ error: 'Selected duty supervisor was not found.' }, { status: 400 });
    const supervisorRoles = new Set((supervisor.additional_roles || []).map(lower));
    const supervisorEligible = supervisor.role === 'admin' || supervisor.is_supervisor === true || supervisorRoles.has('supervisor') || supervisorRoles.has('full_access') || supervisorRanks.includes(lower(supervisor.rank).replace(/[.]/g, '').replace(/\s+/g, ' '));
    if (!supervisorEligible) return Response.json({ error: 'Selected employee is not eligible to serve as duty supervisor.' }, { status: 400 });
    if(!canOversee(me,supervisor))return Response.json({error:'Duty supervisor is outside your platoon and operating area'},{status:403});

    if(!['save',''].includes(action))return Response.json({error:'Invalid action'},{status:400});
    const existing=await base44.asServiceRole.entities.DutySupervisorAssignment.list('-assignment_date',5000);
    const checked=validateBatch([row],users,existing);
    if(checked.errors.length)return Response.json({error:checked.errors.join(' · ')},{status:409});
    if(!checked.planned.length)return Response.json({success:true,skipped:1});
    const payload = {
      assignment_date: String(row.assignment_date).slice(0,10),
      start_time: String(row.start_time).slice(0,5),
      end_time: String(row.end_time).slice(0,5),
      location: String(row.location || 'ALL').trim() || 'ALL',
      supervisor_email: lower(supervisor.email),
      supervisor_name: displayName(supervisor),
      supervisor_rank: String(supervisor.rank || '').trim(),
      status: String(row.status || 'scheduled'),
      notes: String(row.notes || '').slice(0,1000),
      updated_by_email: me.email || '',
    };
    let saved;
    const original=row.id?await base44.asServiceRole.entities.DutySupervisorAssignment.get(String(row.id)):null;
    if (row.id) saved = await base44.asServiceRole.entities.DutySupervisorAssignment.update(String(row.id), payload);
    else saved = await base44.asServiceRole.entities.DutySupervisorAssignment.create({ ...payload, created_by_email: me.email || '' });

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DutySupervisorAssignment', entity_id: String(saved?.id || row.id || ''), action: row.id ? 'update' : 'create', actor_id: String(me.id || me.email), actor_name: displayName(me), timestamp: new Date().toISOString(), description: `Duty supervisor scheduled: ${payload.supervisor_name} · ${payload.assignment_date} ${payload.start_time}-${payload.end_time} · ${payload.location}`
    }).catch(() => null);

    const changes=[original?.supervisor_email,payload.supervisor_email].filter(Boolean);
    const unique=[...new Set(changes.map(lower))];
    const results=[];
    for(const email of unique){const moved=original&&lower(original.supervisor_email)!==lower(payload.supervisor_email);const notice={...(email===lower(original?.supervisor_email)?original||payload:saved||payload),supervisor_email:email};results.push(await notifyDutyAssignment(base44,notice,moved&&email===lower(original.supervisor_email)?'removed':moved?'created':original?'updated':'created'));}
    return Response.json({ success: true, assignment: saved || payload, email_failed:results.filter(item=>item.email_status==='failed').length,email_accepted:results.filter(item=>item.email_status==='accepted').length });
  } catch (error) {
    console.error('manageDutySupervisorSchedule failed', error);
    return Response.json({ error: error?.message || 'Unable to manage duty supervisor schedule.' }, { status: 500 });
  }
});
