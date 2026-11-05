const __portalAppIdentity=(user)=>user&&String(user.id)==='6a72bbee2842d6338cbae513'&&String(user.rank).toLowerCase()==='support staff'?{...user,role:'user',additional_roles:['support'],is_supervisor:false,dispatch_role:'',ps_role:'none'}:user;
import { createClientFromRequest } from 'npm:@base44/sdk';
import { sendCreditFreeEmail } from './creditFreeEmail.ts';
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

const esc=(v:any)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const mailHtml=(start:string,end:string,shifts:any[])=>`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#090b11;color:#f3f3f3;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#090b11"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="100%" style="max-width:620px;border:1px solid #bd9f43;background:#14171e;border-radius:12px"><tr><td style="padding:26px 24px;text-align:center;background:#080b11"><img src="https://bpspf.blackpointkjc.com/black-point-shield.webp" alt="BlackPoint" width="180" style="max-width:100%;height:auto"><div style="color:#ddc47a;font-size:12px;letter-spacing:3px;margin-top:14px">PATHFINDER SCHEDULING</div></td></tr><tr><td style="padding:28px"><h1 style="color:#fff;font-size:26px;margin:0 0 12px">Your schedule is published</h1><p style="color:#ced6e2;line-height:1.6">Your schedule for ${esc(start)} through ${esc(end)} includes ${shifts.length} shift(s). Review the details and acknowledge them in Pathfinder.</p><table role="presentation" width="100%" style="border-collapse:collapse">${shifts.sort((a:any,b:any)=>String(a.shift_date).localeCompare(String(b.shift_date))).map(shift=>`<tr><td style="color:#d9e5f2;padding:13px 8px;border-top:1px solid #39414e"><strong>${esc(shift.shift_date)}</strong><br>${esc(shift.start_time)} – ${esc(shift.end_time)}<br>${esc(shift.location||'Location to be confirmed')}</td></tr>`).join('')}</table><p style="margin:28px 0"><a href="https://bpspf.blackpointkjc.com/Schedule" style="display:inline-block;background:#d4af37;color:#121212;text-decoration:none;padding:13px 22px;border-radius:7px;font-weight:bold">Review My Schedule</a></p></td></tr><tr><td style="border-top:1px solid #39414e;padding:18px 28px;color:#9ca7b9;font-size:12px">BlackPoint · Pathfinder Scheduling<br>This is an automated schedule notification.</td></tr></table></td></tr></table></body></html>`;

Deno.serve(async req => {
  let release = async () => {};
  let published = false;
  try {
    const api = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().then(__portalAppIdentity).catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,api,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await api.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    api.auth.me = async () => __portalCaller;

    const actor = await api.auth.me().then(__portalAppIdentity);
    if (!actor || actor.role !== 'admin') return Response.json({error:'Administrator access required'},{status:403});
    const body = await req.json();
    const start = String(body.week_start_date || '');
    const date = new Date(start + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== start || date.getUTCDay() !== 0 || typeof body.is_ready !== 'boolean')
      return Response.json({error:'A Sunday week start and publication status are required'},{status:400});
    date.setUTCDate(date.getUTCDate()+6);
    const end = date.toISOString().slice(0,10);
    const db = api.asServiceRole.entities;
    const rows = await db.ScheduleWeekStatus.filter({week_start_date:start},'-created_date',10);
    if (rows.length > 1) return Response.json({error:'Multiple publication records exist for this week; contact an administrator'},{status:409});
    let week = rows[0] || await db.ScheduleWeekStatus.create({week_start_date:start,week_end_date:end,is_ready:false});
    const token = crypto.randomUUID();
    const claim = await db.ScheduleWeekStatus.updateMany({id:week.id,$or:[
      {delivery_locked_until:{$exists:false}},{delivery_locked_until:null},{delivery_locked_until:{$lte:new Date().toISOString()}}
    ]},{$set:{delivery_lock_token:token,delivery_locked_until:new Date(Date.now()+300000).toISOString()}});
    if (claim.updated !== 1) return Response.json({error:'Schedule publication is already running. Try again shortly.'},{status:409});
    release = async () => { await db.ScheduleWeekStatus.updateMany({id:week.id,delivery_lock_token:token},{$set:{delivery_lock_token:'',delivery_locked_until:new Date(0).toISOString()}}); };
    const renew = async () => {
      const result = await db.ScheduleWeekStatus.updateMany({id:week.id,delivery_lock_token:token,delivery_locked_until:{$gt:new Date().toISOString()}},{$set:{delivery_locked_until:new Date(Date.now()+300000).toISOString()}});
      if (result.updated !== 1) throw new Error('Publication lease expired; retry delivery');
    };
    // Re-read after claiming so concurrent attempts cannot use stale publication state.
    week = await db.ScheduleWeekStatus.get(week.id);
    if (!body.is_ready) {
      await db.ScheduleWeekStatus.update(week.id,{is_ready:false,marked_ready_by:actor.email,marked_ready_date:new Date().toISOString()});
      return Response.json({success:true,is_ready:false});
    }
    const publicationKey = week.publication_key || 'schedule:'+week.id;
    await db.ScheduleWeekStatus.update(week.id,{is_ready:true,week_end_date:end,publication_key:publicationKey,delivery_status:'pending',marked_ready_by:actor.email,marked_ready_date:new Date().toISOString()});
    published = true;
    // Read the saved schedule, never a partial or still-loading browser cache.
    const shifts = [];
    let offset = 0;
    while (true) {
      const page = await db.Schedule.filter({shift_date:{$gte:start,$lte:end},archived:{$ne:true}},'id',500,offset);
      shifts.push(...page);
      if (page.length < 500) break;
      offset += page.length;
    }
    const withheld = new Set((week.unpublished_officer_emails || []).map((email:string)=>String(email).trim().toLowerCase()));
    const groups = new Map<string,any[]>();
    for (const shift of shifts) {
      const email = String(shift.officer_email || '').trim().toLowerCase();
      if (!email || email === 'open' || shift.is_open || withheld.has(email)) continue;
      groups.set(email,[...(groups.get(email)||[]),shift]);
    }
    const announcements = await db.Announcement.filter({publication_key:publicationKey},'-created_date',1);
    await renew();
    if (!announcements.length) await db.Announcement.create({
      publication_key:publicationKey,title:'Schedule Published · '+start+' – '+end,
      message:'The schedule for '+start+' through '+end+' is available. Open My Schedule to review your published assignments. Individually withheld schedules remain pending supervisor release.',
      audience:'company',priority:'important'
    });
    let delivered = 0, emailAccepted = 0, emailFailed = 0;
    for (const [email, officerShifts] of groups) {
      await renew();
      const eventKey = publicationKey+':'+email;
      try {
        const existing = await db.Notification.filter({event_key:eventKey},'-created_date',1);
        if (!existing.length) await db.Notification.create({
          recipient_email:email,type:'shift_posted',title:'Your Schedule Has Been Published',
          message:'Your schedule for '+start+' through '+end+' is published with '+officerShifts.length+' shift(s). Please review My Schedule and acknowledge this update.',
          event_key:eventKey,related_id:week.id,priority:'high',requires_acknowledgment:true,is_read:false,source_name:'System Scheduling'
        });
        delivered++;
      } catch(error) {
        console.error('Schedule in-app notification failed',email,String(error?.message||error));
        if(Number(error?.status||error?.response?.status)===429||/rate.?limit/i.test(String(error?.message)))break;
      }
      // Retry email independently of Notification. Previously a repeat
      // publication skipped successful in-app alerts and never retried mail.
      const mailKey=eventKey+':email';
      const receipts=await db.ScheduleEmailDelivery.filter({event_key:mailKey},'-created_date',1).catch(()=>[]);
      if(receipts[0]?.status==='accepted'){emailAccepted++;continue;}
      let status='failed',errorMessage='';
      try{
        await sendCreditFreeEmail(api,{to:email,subject:'BlackPoint Pathfinder | Schedule Published · '+start+' – '+end,body:mailHtml(start,end,officerShifts)});
        status='accepted';emailAccepted++;
      }catch(error){emailFailed++;errorMessage=String(error?.message||'Microsoft 365 did not accept email').slice(0,350);console.error('Published schedule HTML email failed',email,errorMessage);}
      try{
        const receiptData={event_key:mailKey,recipient_email:email,status,subject:'Schedule Published · '+start+' – '+end,provider:'Microsoft 365',error:errorMessage,attempted_at:new Date().toISOString(),related_id:week.id,...(status==='accepted'?{accepted_at:new Date().toISOString()}:{})};
        if(receipts[0])await db.ScheduleEmailDelivery.update(receipts[0].id,receiptData);
        else await db.ScheduleEmailDelivery.create(receiptData);
      }catch(error){console.warn('Publication email receipt save failed',String(error?.message||error));}
    }
    const pending = groups.size-delivered;
    const outstandingEmails=groups.size-emailAccepted;
    await db.ScheduleWeekStatus.update(week.id,{delivery_status:pending||outstandingEmails?'pending':'complete',delivery_recipient_count:groups.size,delivery_sent_count:delivered,delivery_updated_at:new Date().toISOString()});
    return Response.json({success:true,is_ready:true,delivered,pending,email_accepted:emailAccepted,email_failed:emailFailed,email_pending:outstandingEmails,announcement_posted:true,week_start_date:start,week_end_date:end});
  } catch(error) {
    console.error('Schedule publication failed',error?.message);
    return Response.json({error:published?'Schedule published; announcement delivery needs retry.':'Unable to publish schedule.',published},{status:500});
  } finally { await release().catch(error=>console.warn('Schedule lease cleanup failed',error?.message)); }
});
