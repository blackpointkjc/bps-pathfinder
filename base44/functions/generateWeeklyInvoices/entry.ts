import { createClientFromRequest } from 'npm:@base44/sdk';

const MANAGEMENT_EMAIL = 'management@blackpointkjc.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const siteOf = (value:unknown) => String(value || '').split(/\s*(?::|\s-\s)\s*/)[0].trim();
const easternDate = (value:unknown) => {
  const raw=String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(raw)) return raw.slice(0,10);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};
const dateOffset = (key:string,day:number) => {const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+day);return d.toISOString().slice(0,10)};
const dollars=(n:number)=>Math.round(n*100)/100;
const eligibleClient = (user:any) => (user?.additional_roles || []).some((role:string)=>String(role).toLowerCase()==='client') || String(user?.user_type || '').toLowerCase()==='client' || String(user?.rank || '').toLowerCase()==='client';
const scheduleFor = (entry:any,schedules:any[]) => schedules.find((row:any)=>row.archived!==true && String(row.officer_email||'').toLowerCase()===String(entry.officer_email||'').toLowerCase() && siteOf(row.location)===siteOf(entry.location) && String(row.shift_date||'').slice(0,10)===easternDate(entry.clock_in));
const hourlyRate = (entry:any,location:any,schedules:any[]) => {
  const shift=scheduleFor(entry,schedules);
  const type=String(shift?.shift_type||'normal').toLowerCase();
  const unarmed=/\bunarmed\b/i.test(`${shift?.site_details||''} ${shift?.special_instructions||''}`);
  let field=unarmed?'site_bill_rate_unarmed':'site_bill_rate';
  if(type==='holiday_coverage') field=unarmed?'site_bill_rate_holiday_unarmed':'site_bill_rate_holiday_armed';
  if(type==='rush_coverage') field=unarmed?'site_bill_rate_rush_unarmed':'site_bill_rate_rush_armed';
  return Number(location[field]) || Number(location.site_bill_rate_unarmed && unarmed ? location.site_bill_rate_unarmed : location.site_bill_rate) || 0;
};
const hours = (entry:any) => {
  const start=Date.parse(entry.clock_in), end=Date.parse(entry.clock_out);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) return 0;
  const breaks=(Array.isArray(entry.break_periods)?entry.break_periods:[]).reduce((sum:number,row:any)=>{
    const a=Date.parse(row?.start),b=Date.parse(row?.end);
    return Number.isFinite(a)&&Number.isFinite(b)&&b>a ? sum+Math.max(0,Math.min(b,end)-Math.max(a,start)):sum;
  },0);
  return Math.max(0,(end-start-breaks)/3600000);
};
const encode=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isEmail=(email:any)=>EMAIL.test(String(email||'').trim());

Deno.serve(async(req)=>{
  try {
    const base44=createClientFromRequest(req);
    const body=req.method==='POST'? await req.json().catch(()=>({})) : {};
    const action=String(body?.action||'scheduled').toLowerCase();
    const manual=action!=='scheduled';
    if(manual) {
      const caller=await base44.auth.me().catch(()=>null);
      const roles=new Set((caller?.additional_roles||[]).map((role:string)=>String(role).toLowerCase()));
      if(!caller || (caller.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access'))) return Response.json({error:'Accounting access required'},{status:403});
    }
    const now=new Date();
    const eastern=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=(name:string)=>eastern.find(item=>item.type===name)?.value||'';
    if(!manual && (part('weekday')!=='Mon'||Number(part('hour'))!==8)) return Response.json({success:true,skipped:true,reason:'Automatic invoice generation runs Mondays at 8 AM Eastern'});
    const today=`${part('year')}-${part('month')}-${part('day')}`;
    const lastSaturday=dateOffset(today,-2);
    const startDefault=dateOffset(lastSaturday,-6);
    const periodStart=body.period_start || startDefault;
    const periodEnd=body.period_end || lastSaturday;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)|| !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)||periodEnd<periodStart || periodEnd>=today) return Response.json({error:'Invoice periods must be completed dates in YYYY-MM-DD format'},{status:400});
    const [entries,locations,users,invoices,schedules]=await Promise.all([
      base44.asServiceRole.entities.TimeEntry.list('-clock_in',10000),
      base44.asServiceRole.entities.Location.list('site_name',2000),
      base44.asServiceRole.entities.User.list(undefined,2000),
      base44.asServiceRole.entities.Invoice.list('-created_date',5000),
      base44.asServiceRole.entities.Schedule.list('-shift_date',10000),
    ]);
    const clients=(users||[]).filter(eligibleClient);
    const byEmail=new Map(clients.map((client:any)=>[String(client.email||'').toLowerCase(),client]));
    const byOfficer=new Map((users||[]).map((person:any)=>[String(person.email||'').toLowerCase(),person]));
    const existing=new Set((invoices||[]).map((invoice:any)=>`${siteOf(invoice.site_name).toLowerCase()}|${invoice.period_start}|${invoice.period_end}`));
    const prefix=today.slice(2,4);
    let sequence=Math.max(0,...(invoices||[]).map((invoice:any)=>String(invoice.invoice_number||'')).filter((number:string)=>number.startsWith(prefix)).map((number:string)=>Number(number.slice(2))||0));
    let created=0,sent=0,deliveryFailed=0,skipped=0;
    const results:any[]=[];
    const selected=body.location_id ? (locations||[]).filter((row:any)=>row.id===body.location_id) : (locations||[]);
    for(const location of selected){
      if (!location?.site_name || !(Number(location.site_bill_rate)>0)) {skipped++;continue;}
      const name=siteOf(location.site_name);
      const keys=action==='backfill_drafts' ? Array.from({length:16},(_,i)=>{const end=dateOffset(lastSaturday,-7*i);return [dateOffset(end,-6),end]}) : [[periodStart,periodEnd]];
      for(const [start,end] of keys){
        const key=`${name.toLowerCase()}|${start}|${end}`;
        if(existing.has(key)){skipped++;continue;}
        const rows=(entries||[]).filter((entry:any)=>entry.clock_in&&entry.clock_out&&entry.archived!==true&&siteOf(entry.location)===name&&easternDate(entry.clock_in)>=start&&easternDate(entry.clock_in)<=end);
        if(!rows.length){skipped++;continue;}
        let totalHours=0,total=0;
        const shifts=rows.map((entry:any)=>{
          const h=hours(entry);const rate=hourlyRate(entry,location,schedules||[]);
          totalHours+=h;total+=h*rate;
          const officer=byOfficer.get(String(entry.officer_email||'').toLowerCase()) as any;
          return {date:easternDate(entry.clock_in),officer:officer?`${officer.rank||''} ${officer.last_name||''}`.trim():'Officer',clockIn:entry.clock_in,clockOut:entry.clock_out,hours:h.toFixed(2),rate:rate.toFixed(2),amount:dollars(h*rate).toFixed(2)};
        });
        if(totalHours<=0||total<=0){skipped++;continue;}
        const assigned=String(location.assigned_client_email||'').toLowerCase();
        const client=byEmail.get(assigned) as any;
        const matchedClient=client || clients.find((item:any)=>(item.assigned_locations||[]).map(siteOf).includes(name)||(item.assigned_sites||[]).map(siteOf).includes(name)||siteOf(item.assigned_location)===name);
        // An internal/admin account mistakenly assigned as a client must not get invoices.
        const provided=String(body.contact_email || location.billing_contact_email || matchedClient?.email || '').trim().toLowerCase();
        const target=isEmail(provided)?provided:MANAGEMENT_EMAIL;
        const reason=target===MANAGEMENT_EMAIL?'Client billing email not configured. Routed to management for review.':'';
        sequence++;
        const number=`${prefix}${String(sequence).padStart(3,'0')}`;
        const invoiceData={invoice_number:number,client_email:target,delivery_email:target,site_name:name,period_start:start,period_end:end,total_hours:dollars(totalHours),bill_rate:Number(location.site_bill_rate),total_amount:dollars(total),shifts:JSON.stringify(shifts),due_date:dateOffset(today,15),status:'draft',delivery_status:'pending',notes:reason || 'Automatically generated weekly invoice.'};
        const invoice=await base44.asServiceRole.entities.Invoice.create(invoiceData);
        created++;existing.add(key);
        // Historical drafts require accounting review and are never silently emailed.
        if(action==='backfill_drafts'||action==='preview') {results.push({invoice_number:number,site:name,period_start:start,period_end:end,amount:dollars(total),status:'draft',recipient:target});continue;}
        const detail=shifts.map((shift:any)=>`<tr><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.date)}</td><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.hours)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.rate)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.amount)}</td></tr>`).join('');
        const emailBody=`<div style="font:14px Arial,sans-serif;max-width:640px;color:#18263a"><div style="background:#0d1b2c;color:#e3bf70;padding:20px;font-size:20px;font-weight:bold">BLACK POINT SECURITY — INVOICE ${encode(number)}</div><p><b>Service location:</b> ${encode(name)}<br/><b>Service period:</b> ${encode(start)} through ${encode(end)}<br/><b>Due:</b> ${encode(invoiceData.due_date)}</p><table width="100%" cellspacing="0"><thead><tr><th align="left">Date</th><th align="left">Hours</th><th align="left">Rate</th><th align="left">Amount</th></tr></thead><tbody>${detail}</tbody></table><h2>Total due: $${invoiceData.total_amount.toFixed(2)}</h2><p>${reason||'Thank you for your business.'}</p><p>Black Point Protection · management@blackpointkjc.com</p></div>`;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({to:target,subject:`Black Point Invoice ${number} — ${name} (${start}–${end})`,body:emailBody});
          await base44.asServiceRole.entities.Invoice.update(invoice.id,{status:'sent',delivery_status:'accepted',delivery_email:target,sent_at:new Date().toISOString()});
          sent++;results.push({invoice_number:number,site:name,status:'sent',recipient:target});
        } catch(error:any) {
          const message=String(error?.message||'Delivery provider error');
          await base44.asServiceRole.entities.Invoice.update(invoice.id,{status:'draft',delivery_status:'failed',delivery_error:message}).catch(()=>null);
          deliveryFailed++;results.push({invoice_number:number,site:name,status:'delivery_failed',recipient:target,error:message});
          console.error('Automated invoice email failed',number,message);
        }
      }
    }
    return Response.json({success:true,period_start:periodStart,period_end:periodEnd,created,sent,delivery_failed:deliveryFailed,skipped,results,recipient_fallback:MANAGEMENT_EMAIL});
  } catch(error:any){console.error('generateWeeklyInvoices failed',error);return Response.json({error:error?.message||'Unable to generate invoices'},{status:500});}
});
