import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = value => String(value || '').trim().toLowerCase();
const openShift = row => row.clock_in && !row.clock_out && row.archived !== true;
const activeOfficer = user => {
  const roles = new Set([user.role, ...(user.additional_roles || [])].map(lower));
  const type = lower(user.user_type || user.account_type || user.portal_type);
  return !user.termination_date && !['pending','disabled','inactive','suspended'].includes(lower(user.account_status))
    && !['client','student','pending'].includes(type)
    && !['client','student','pending'].some(role => roles.has(role))
    && !['out of service','off duty','off-duty','oos'].includes(lower(user.status));
};
async function allRows(entity, query, sort = 'created_date') {
  const rows = [];
  for (let skip = 0; ; skip += 500) {
    const page = await entity.filter(query, sort, 500, skip);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const user = await api.auth.me();
    if (!user?.email) return Response.json({error:'Authentication required'}, {status:401});
    const body = await req.json().catch(() => ({}));
    const db = api.asServiceRole.entities;
    if (body.action === 'send') {
      if (user.role !== 'admin') return Response.json({error:'Administrator access required'}, {status:403});
      const message = String(body.message || '').trim();
      const requestKey = String(body.request_key || '');
      if (!message || message.length > 1200 || !/^[a-zA-Z0-9-]{16,100}$/.test(requestKey))
        return Response.json({error:'A message of 1–1200 characters and request ID are required'}, {status:400});
      const key = user.id + ':' + requestKey;
      const previous = await db.CadVoiceBroadcast.filter({request_key:key}, 'created_date', 1);
      if (previous.length) return Response.json({success:true, broadcast:previous[0], recipients:previous[0].recipient_emails.length});
      const shifts = (await allRows(db.TimeEntry, {
        archived:{$ne:true}, $or:[{clock_out:null},{clock_out:''},{clock_out:{$exists:false}}]
      }, '-clock_in')).filter(openShift);
      const emails = [...new Set(shifts.map(row => row.officer_email).filter(Boolean))];
      const eligible = new Set();
      for (let index = 0; index < emails.length; index += 100) {
        const users = await db.User.filter({email:{$in:emails.slice(index,index+100)}}, 'created_date', 500);
        users.filter(activeOfficer).forEach(person => eligible.add(lower(person.email)));
      }
      const targets = shifts.filter(row => eligible.has(lower(row.officer_email)));
      if (!targets.length) return Response.json({error:'No active on-duty officers are available'}, {status:409});
      const broadcast = await db.CadVoiceBroadcast.create({
        request_key:key, message, sender_id:user.id,
        sender_name:[user.rank,user.first_name,user.last_name].filter(Boolean).join(' ') || user.full_name || 'Administrator',
        recipient_emails:[...new Set(targets.map(row => row.officer_email))],
        shift_ids:targets.map(row => row.id),
      });
      return Response.json({success:true,broadcast,recipients:broadcast.recipient_emails.length});
    }
    if (!['list','check','ack'].includes(body.action))
      return Response.json({error:'Unknown action'}, {status:400});
    if (!activeOfficer(user)) return Response.json({success:true,eligible:false, broadcasts:[]});
    const shifts = (await db.TimeEntry.filter({officer_email:user.email,
      archived:{$ne:true}, $or:[{clock_out:null},{clock_out:''},{clock_out:{$exists:false}}]
    }, '-clock_in', 100)).filter(openShift);
    if (!shifts.length) return Response.json({success:true,eligible:false,broadcasts:[]});
    const shiftIds = new Set(shifts.map(row => row.id));
    const eligibleEvent = event => (event.recipient_emails || []).some(email => lower(email) === lower(user.email))
      && (event.shift_ids || []).some(id => shiftIds.has(id));
    if (body.action === 'list') {
      const since = shifts.map(row => row.clock_in).sort()[0];
      const events = await allRows(db.CadVoiceBroadcast, {recipient_emails:{$in:[user.email]},created_date:{$gte:since}});
      const receipts = await allRows(db.CadVoiceReceipt, {user_email:user.email,created_date:{$gte:since}});
      const played = new Set(receipts.map(row => row.broadcast_id));
      return Response.json({success:true,eligible:true,broadcasts:events.filter(event => eligibleEvent(event) && !played.has(event.id))});
    }
    const event = await db.CadVoiceBroadcast.get(String(body.broadcast_id || ''));
    if (!event || !eligibleEvent(event)) return Response.json({success:true,eligible:false});
    const receipts = await db.CadVoiceReceipt.filter({broadcast_id:event.id,user_email:user.email}, 'created_date', 1);
    if (body.action === 'check') return Response.json({success:true,eligible:!receipts.length,broadcast:event});
    if (!receipts.length) await db.CadVoiceReceipt.create({broadcast_id:event.id,user_email:user.email,played_at:new Date().toISOString()});
    return Response.json({success:true});
  } catch (error) {
    const limited = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(String(error?.message));
    return Response.json({error:error?.message || 'CAD voice service unavailable'}, {
      status:limited ? 429 : 500, headers:limited ? {'Retry-After':'60'} : {}
    });
  }
});
