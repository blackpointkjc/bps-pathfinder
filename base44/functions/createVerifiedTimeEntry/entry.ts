import { createClientFromRequest } from 'npm:@base44/sdk';
const lower = (x: unknown) => String(x || '').trim().toLowerCase();
Deno.serve(async req => {
 try {
  const api = createClientFromRequest(req);
  const me = await api.auth.me();
  if (!me?.email) return Response.json({error:'Login required'}, {status:401});
  const data = await req.json();
  const email = lower(data.officer_email);
  if (!email || !data.clock_in || !data.location) return Response.json({error:'Officer, clock-in time and location required'}, {status:400});
  const privileged = me.role === 'admin' || (me.additional_roles || []).includes('full_access');
  if (!privileged && email !== lower(me.email)) return Response.json({error:'Cannot clock in another officer'}, {status:403});
  const recent = await api.asServiceRole.entities.CallOut.filter({officer_email:email}, '-created_date', 100);
  const restriction = (recent || []).filter((row:any) => row.call_out_type === 'sent_home' && row.voided !== true)
    .map((row:any) => new Date(row.created_date || 0).getTime()).filter((n:number)=>Number.isFinite(n)).sort((a:number,b:number)=>b-a)[0];
  const end = restriction ? restriction + 12*3600000 : 0;
  if (end > Date.now()) return Response.json({error:`Clock-in blocked until ${new Date(end).toISOString()} after sent-home event`,eligible_at:new Date(end).toISOString()}, {status:423});
  const existing = await api.asServiceRole.entities.TimeEntry.filter({officer_email:email}, '-clock_in', 40);
  const open=(existing||[]).find((row:any)=>row.clock_in&&!row.clock_out&&row.archived!==true);
  if(open){
    const oldSite=String(open.location||'').split(' - ')[0].trim().toLowerCase();
    const newSite=String(data.location||'').split(' - ')[0].trim().toLowerCase();
    if(oldSite===newSite)return Response.json({success:true,entry:open,already_clocked_in:true,message:'The existing active shift was recovered; no duplicate punch was created.'});
    return Response.json({error:`You already have an open shift at ${oldSite||'another site'}. Use Switch Site to transfer without losing hours.`,active_entry_id:open.id},{status:409});
  }
  const saved = await api.asServiceRole.entities.TimeEntry.create({...data,officer_email:email});
  return Response.json({success:true,entry:saved});
 } catch(error:any) { return Response.json({error:error?.message || 'Unable to clock in'}, {status:500}); }
});
