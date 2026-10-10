import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async req => {
  let release = async () => {};
  let published = false;
  try {
    const api = createClientFromRequest(req);
    const actor = await api.auth.me();
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
    let delivered = 0;
    const failed:string[] = [];
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
        failed.push(email);
        if (Number(error?.status || error?.response?.status) === 429 || /rate.?limit/i.test(String(error?.message))) {
          // Stop immediately; a retry will skip all already delivered notifications.
          break;
        }
      }
    }
    const pending = groups.size-delivered;
    await db.ScheduleWeekStatus.update(week.id,{delivery_status:pending?'pending':'complete',delivery_recipient_count:groups.size,delivery_sent_count:delivered,delivery_updated_at:new Date().toISOString()});
    return Response.json({success:true,is_ready:true,delivered,pending,announcement_posted:true});
  } catch(error) {
    console.error('Schedule publication failed',error?.message);
    return Response.json({error:published?'Schedule published; announcement delivery needs retry.':'Unable to publish schedule.',published},{status:500});
  } finally { await release().catch(error=>console.warn('Schedule lease cleanup failed',error?.message)); }
});
