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
const rateAtDate = (location:any, day:string) => {
  const rateHistory=(Array.isArray(location?.site_rate_history)?location.site_rate_history:[])
    .filter((item:any)=>item.effective_date && Number(item.rate)>0)
    .sort((a:any,b:any)=>String(a.effective_date).localeCompare(String(b.effective_date)));
  const applicable=rateHistory.filter((item:any)=>String(item.effective_date)<=day).at(-1);
  return {rate:Number(applicable?.rate || location?.site_bill_rate || 0),
    needsReview:rateHistory.length>0 && !applicable,
    reason:rateHistory.length>0 && !applicable ? `Historical billing rate is not recorded before ${rateHistory[0].effective_date}` : ''};
};
const hourlyRate = (entry:any,location:any,schedules:any[]) => {
  const shift=scheduleFor(entry,schedules);
  const type=String(shift?.shift_type||'normal').toLowerCase();
  const unarmed=/\bunarmed\b/i.test(`${shift?.site_details||''} ${shift?.special_instructions||''}`);
  const base=rateAtDate(location,easternDate(entry.clock_in));
  // Rate history currently tracks standard bill rates only; never present an
  // unverified historical special rate as finalized billable revenue.
  if(type==='holiday_coverage' || type==='rush_coverage' || unarmed) {
    const suffix=type==='holiday_coverage'?'holiday':type==='rush_coverage'?'rush':'standard';
    const field=type==='holiday_coverage'||type==='rush_coverage' ? `site_bill_rate_${suffix}_${unarmed?'unarmed':'armed'}` : 'site_bill_rate_unarmed';
    const special=Number(location?.[field])||base.rate;
    const changed=(Array.isArray(location?.site_rate_history)?location.site_rate_history:[]).some((item:any)=>String(item.effective_date||'')>easternDate(entry.clock_in));
    return {rate:special,needsReview:base.needsReview||changed,reason:base.reason || (changed?'Historical special/unarmed rate needs verification':'')};
  }
  return base;
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
    if (!['scheduled','run_now','backfill_drafts','send_existing','approve_historical_rate','create_draft','create_invoice','send_ready_drafts'].includes(action)) return Response.json({error:'Unsupported invoice operation'},{status:400});
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
    if(action==='approve_historical_rate') {
      const invoice=await base44.asServiceRole.entities.Invoice.get(String(body.invoice_id || '')).catch(()=>null);
      if (!invoice) return Response.json({error:'Invoice not found'},{status:404});
      if(String(invoice.status || '').toLowerCase() !== 'draft') return Response.json({error:'Only unsent draft invoices can be repriced'},{status:409});
      const verifiedRate=Number(body.verified_rate);
      if (!Number.isFinite(verifiedRate) || verifiedRate<=0 || verifiedRate>10000) return Response.json({error:'A positive documented contract billing rate is required'},{status:400});
      let details:any[]=[];
      try {details=JSON.parse(invoice.shifts||'[]')} catch {}
      if(!Array.isArray(details)||!details.length) return Response.json({error:'Invoice has no itemized shifts to recalculate'},{status:409});
      let total=0;
      const revised=details.map((item:any)=>{
        const originalRate=Number(item.rate||0);
        const rawHours=originalRate>0 ? Number(item.amount||0)/originalRate : Number(item.hours||0);
        const amount=dollars(rawHours*verifiedRate);
        total+=amount;
        return {...item,rate:verifiedRate.toFixed(2),amount:amount.toFixed(2)};
      });
      const actor=await base44.auth.me();
      const locations=await base44.asServiceRole.entities.Location.list('site_name',2000);
      const location=(locations||[]).find((site:any)=>siteOf(site.site_name).toLowerCase()===siteOf(invoice.site_name).toLowerCase());
      if (!location) return Response.json({error:'Site missing: cannot apply approved rate to company billing records'},{status:409});
      const priorHistory=Array.isArray(location.site_rate_history)?location.site_rate_history:[];
      const effective=String(invoice.period_start);
      const conflicts=priorHistory.filter((row:any)=>row.effective_date>effective&&row.effective_date<=invoice.period_end);
      if(conflicts.length) return Response.json({error:'The invoice crosses a contract rate change. Verify rates by shift rather than applying one flat rate to the entire period.'},{status:409});
      const history=priorHistory.filter((row:any)=>row.effective_date!==effective);
      history.push({effective_date:effective,rate:verifiedRate,changed_by:String(actor?.email||actor?.id||'accounting')});
      history.sort((a:any,b:any)=>String(a.effective_date).localeCompare(String(b.effective_date)));
      await base44.asServiceRole.entities.Location.update(location.id,{site_rate_history:history});
      const record=await base44.asServiceRole.entities.Invoice.update(invoice.id,{
        shifts:JSON.stringify(revised),bill_rate:verifiedRate,total_amount:dollars(total),
        billing_review_required:false,billing_review_reason:'',delivery_status:'pending',
        billing_rate_verified_by:String(actor?.email||actor?.id||'accounting'),
        billing_rate_verified_at:new Date().toISOString(),billing_rate_verified_value:verifiedRate,
        notes:`Accounting verified the historical bill rate at $${verifiedRate.toFixed(2)} per service hour; ${new Date().toISOString()} by ${actor?.email||'accounting'}. Original invoice number preserved.`,
      });
      return Response.json({success:true,invoice_number:record.invoice_number,total_amount:record.total_amount,verified_rate:verifiedRate,invoice:record});
    }
    if(action==='send_existing') {
      const invoice=await base44.asServiceRole.entities.Invoice.get(String(body.invoice_id || '')).catch(()=>null);
      if(!invoice) return Response.json({error:'Invoice not found'},{status:404});
      if(invoice.status==='paid'||(invoice.status==='sent'&&invoice.delivery_status!=='failed')) return Response.json({error:'Invoice already sent or paid; duplicate email blocked.'},{status:409});
      if(invoice.billing_review_required === true) return Response.json({error:`Historical rate must be reviewed before this invoice can be sent: ${invoice.billing_review_reason || 'Unverified billing rate'}`},{status:409});
      const locations=await base44.asServiceRole.entities.Location.list('site_name',2000);
      const location=(locations||[]).find((row:any)=>siteOf(row.site_name)===siteOf(invoice.site_name));
      const recipient=String(body.contact_email || location?.billing_contact_email || '').trim().toLowerCase();
      const target=isEmail(recipient)?recipient:MANAGEMENT_EMAIL;
      const subject=`Black Point Invoice ${invoice.invoice_number} — ${invoice.site_name} (${invoice.period_start}–${invoice.period_end})`;
      let shifts:any[]=[];
      try {shifts=JSON.parse(invoice.shifts || '[]')}catch{}
      const rows=(Array.isArray(shifts)?shifts:[]).map((shift:any)=>`<tr><td>${encode(shift.date)}</td><td>${encode(shift.hours)}</td><td>$${encode(shift.rate)}</td><td>$${encode(shift.amount)}</td></tr>`).join('');
      const bodyHtml=`<div style="font:14px Arial,sans-serif"><h2 style="background:#101d32;color:#e7c16e;padding:18px">BLACK POINT SECURITY — INVOICE ${encode(invoice.invoice_number)}</h2><p>Service: ${encode(invoice.site_name)}<br>Dates: ${encode(invoice.period_start)} – ${encode(invoice.period_end)}<br>Due: ${encode(invoice.due_date)}</p><table cellspacing="6"><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>${rows}</table><h2>Amount due: $${Number(invoice.total_amount||0).toFixed(2)}</h2><p>Unpaid invoices may be assessed one one-time 10% late fee after the due date, subject to the applicable client agreement.</p><p>Black Point Protection · management@blackpointkjc.com</p></div>`;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({to:target,subject,body:bodyHtml});
        await base44.asServiceRole.entities.Invoice.update(invoice.id,{client_email:target,delivery_email:target,delivery_status:'accepted',delivery_error:'',sent_at:new Date().toISOString(),status:'sent'});
        const portalClients=await base44.asServiceRole.entities.User.list('last_name',1000).catch(()=>[]);
        const matched=(portalClients||[]).filter((u:any)=>eligibleClient(u)&&(
          String(u.email||'').toLowerCase()===target ||
          String(location?.assigned_client_email||'').toLowerCase()===String(u.email||'').toLowerCase() ||
          [u.assigned_location,...(u.assigned_locations||[]),...(u.assigned_sites||[])].some((value:any)=>siteOf(value).toLowerCase()===siteOf(invoice.site_name).toLowerCase())));
        for(const client of matched.slice(0,20))await base44.asServiceRole.entities.Notification.create({recipient_email:String(client.email).toLowerCase(),type:'invoice_due',title:`Invoice #${invoice.invoice_number} is due`,message:`${invoice.site_name} · $${Number(invoice.total_amount||0).toFixed(2)} · Due ${invoice.due_date}. View in Client Center.`,related_id:String(invoice.id),is_read:false,priority:'normal',action_link:'/ClientPayrollReport'}).catch(()=>null);
        return Response.json({success:true,invoice_number:invoice.invoice_number,sent:1,recipient:target});
      } catch(error:any) {
        await base44.asServiceRole.entities.Invoice.update(invoice.id,{delivery_email:target,delivery_status:'failed',delivery_error:String(error?.message||'Mail provider failed')}).catch(()=>null);
        return Response.json({error:`Invoice email was not accepted: ${String(error?.message||'Mail provider failed')}`},{status:502});
      }
    }

    const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
    const sinceLastSaturday=((weekday+1)%7)||7;
    const lastSaturday=dateOffset(today,-sinceLastSaturday);
    const startDefault=dateOffset(lastSaturday,-6);
    // One-button billing always targets the most recently completed service week.
    if(['create_draft','create_invoice'].includes(action)&&!body.location_id)return Response.json({error:'Choose a billing site before saving an invoice'},{status:400});
    const periodStart=action==='backfill_drafts'?startDefault:(body.period_start || startDefault);
    const periodEnd=action==='backfill_drafts'?lastSaturday:(body.period_end || lastSaturday);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)|| !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)||periodEnd<periodStart || periodEnd>=today) return Response.json({error:'Invoice periods must be completed dates in YYYY-MM-DD format'},{status:400});
    const [entries,locations,users,invoices,schedules]=await Promise.all([
      base44.asServiceRole.entities.TimeEntry.list('-clock_in',10000),
      base44.asServiceRole.entities.Location.list('site_name',2000),
      base44.asServiceRole.entities.User.list(undefined,2000),
      base44.asServiceRole.entities.Invoice.list('-created_date',5000),
      base44.asServiceRole.entities.Schedule.list('-shift_date',10000),
    ]);
    // Recover older verified drafts without silently duplicating overlapping
    // service periods or sending invoices whose historical rates need review.
    const issueVerifiedDrafts=async()=>{
      let sent=0,held=0,failed=0,updated=0;
      let providerCooldown=false;
      const results:any[]=[];
      const siteMap=new Map((locations||[]).map((row:any)=>[siteOf(row.site_name).toLowerCase(),row]));
      const active=(invoices||[]).filter((row:any)=>!['void','cancelled'].includes(String(row.status||'').toLowerCase()));
      for(const invoice of active.filter((row:any)=>String(row.status||'').toLowerCase()==='draft').sort((a:any,b:any)=>String(a.period_start).localeCompare(String(b.period_start)))){
        const fixedDue=/^\d{4}-\d{2}-\d{2}$/.test(String(invoice.period_end||'')) ? dateOffset(String(invoice.period_end),15) : '';
        if (!fixedDue) {held++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'invalid_period_end',error:'Invoice is missing a valid period end date'});continue;}
        if(invoice.due_date!==fixedDue){await base44.asServiceRole.entities.Invoice.update(invoice.id,{due_date:fixedDue});updated++;}
        if(providerCooldown){held++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'email_provider_cooldown',error:'Email provider limit reached earlier in this run; not attempted'});continue;}
        if(invoice.billing_review_required===true||String(invoice.delivery_status||'').toLowerCase()==='review_required'){
          held++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'rate_review_required',error:'Historical billing rate requires verification'});continue;
        }
        let items:any[]=[];try{items=JSON.parse(invoice.shifts||'[]')}catch{}
        if(!Array.isArray(items)||!items.length||items.some((row:any)=>!(Number(row.rate)>0))||!(Number(invoice.total_amount)>0)||String(invoice.period_end||'')>=today){
          held++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'invalid_lines_or_open_period',error:'Invalid invoice lines or service period not yet closed'});continue;
        }
        const duplicates=active.filter((other:any)=>other.id!==invoice.id&&siteOf(other.site_name).toLowerCase()===siteOf(invoice.site_name).toLowerCase()
          &&other.period_start<=invoice.period_end&&other.period_end>=invoice.period_start);
        if(duplicates.some((other:any)=>String(other.status||'').toLowerCase()!=='draft'||String(other.invoice_number||'')<String(invoice.invoice_number||''))){
          held++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'overlapping_invoice',error:'Overlapping invoice requires review',overlaps:duplicates.map((row:any)=>row.invoice_number)});continue;
        }
        const loc=siteMap.get(siteOf(invoice.site_name).toLowerCase()) as any;
        const recipient=String(loc?.billing_contact_email||'').toLowerCase().trim();
        const target=isEmail(recipient)?recipient:MANAGEMENT_EMAIL;
        const lines=items.map((row:any)=>`<tr><td>${encode(row.date)}</td><td>${encode(row.hours)}</td><td>$${encode(row.rate)}</td><td>$${encode(row.amount)}</td></tr>`).join('');
        const total=Number(invoice.total_amount||0);
        try{
          await base44.asServiceRole.integrations.Core.SendEmail({to:target,subject:`Black Point Invoice ${encode(invoice.invoice_number)} — ${encode(invoice.site_name)}`,
            body:`<div style="font:14px Arial,sans-serif"><h2>BLACK POINT — INVOICE ${encode(invoice.invoice_number)}</h2><p>Property: ${encode(invoice.site_name)}<br>Service: ${encode(invoice.period_start)} through ${encode(invoice.period_end)}<br><b>Due ${fixedDue}</b></p><table><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>${lines}</table><h2>$${total.toFixed(2)}</h2><p>One-time 10% late charge may apply after the due date under your service agreement.</p></div>`});
          await base44.asServiceRole.entities.Invoice.update(invoice.id,{status:'sent',delivery_email:target,client_email:target,delivery_status:'accepted',delivery_error:'',due_date:fixedDue,sent_at:new Date().toISOString()});
          sent++;results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'sent',recipient:target});
          const clientsForSite=(users||[]).filter((u:any)=>eligibleClient(u)&&(
            String(u.email||'').toLowerCase()===target||String(loc?.assigned_client_email||'').toLowerCase()===String(u.email||'').toLowerCase()||
            [u.assigned_location,...(u.assigned_locations||[]),...(u.assigned_sites||[])].some((x:any)=>siteOf(x).toLowerCase()===siteOf(invoice.site_name).toLowerCase())));
          for(const u of clientsForSite.slice(0,20))await base44.asServiceRole.entities.Notification.create({recipient_email:String(u.email).toLowerCase(),type:'invoice_due',title:`Invoice ${invoice.invoice_number} issued`,message:`${invoice.site_name}: $${total.toFixed(2)}, due ${fixedDue}. View in Client Center.`,related_id:String(invoice.id),is_read:false,priority:'normal',action_link:'/ClientPayrollReport'}).catch(()=>null);
        }catch(error:any){const message=String(error?.message||'Mail service failed');failed++;await base44.asServiceRole.entities.Invoice.update(invoice.id,{delivery_status:'failed',delivery_error:message}).catch(()=>null);results.push({invoice:invoice.invoice_number,site:invoice.site_name,status:'failed',error:message});if(/hourly limit|daily email limit|rate.limit|too many (requests|emails)|quota|cooldown/i.test(message)){providerCooldown=true;}}
      }
      return {success:failed===0,sent,held,failed,due_dates_updated:updated,email_provider_cooldown:providerCooldown,results};
    };
    if(action==='send_ready_drafts')return Response.json(await issueVerifiedDrafts());
    const clients=(users||[]).filter(eligibleClient);
    const byEmail=new Map(clients.map((client:any)=>[String(client.email||'').toLowerCase(),client]));
    const byOfficer=new Map((users||[]).map((person:any)=>[String(person.email||'').toLowerCase(),person]));
    const existingByKey=new Map<string,any>();
    for(const invoice of invoices||[]) {
      // Voided invoices are historical audit records; they must not prevent a
      // replacement invoice for the same service dates.
      if(['void','cancelled'].includes(String(invoice.status||'').toLowerCase()))continue;
      const key=`${siteOf(invoice.site_name).toLowerCase()}|${invoice.period_start}|${invoice.period_end}`;
      // Prefer payment/sending history to a duplicate draft, and the oldest
      // number when duplicate invoices were created for an identical period.
      const current=existingByKey.get(key);
      const priority=(row:any)=>String(row.status||'').toLowerCase()==='paid'?3:String(row.status||'').toLowerCase()==='sent'?2:1;
      if(!current || priority(invoice)>priority(current) || (priority(invoice)===priority(current) && String(invoice.invoice_number||'')<String(current.invoice_number||''))) existingByKey.set(key,invoice);
    }
    const prefix=today.slice(2,4);
    let sequence=Math.max(0,...(invoices||[]).map((invoice:any)=>String(invoice.invoice_number||'')).filter((number:string)=>number.startsWith(prefix)).map((number:string)=>Number(number.slice(2))||0));
    let created=0,updated=0,sent=0,deliveryFailed=0,skipped=0,held=0,processingFailed=0;
    const results:any[]=[];
    const selected=body.location_id ? (locations||[]).filter((row:any)=>row.id===body.location_id) : (locations||[]);
    for(const location of selected){
      try {
      if (!location?.site_name || !(Number(location.site_bill_rate)>0)) {skipped++;continue;}
      const name=siteOf(location.site_name);
      const keys=['backfill_drafts','scheduled','run_now'].includes(action)
        ? Array.from({length:16},(_,i)=>{const end=dateOffset(lastSaturday,-7*i);return [dateOffset(end,-6),end]})
        : [[periodStart,periodEnd]];
      for(const [start,end] of keys){
        const key=`${name.toLowerCase()}|${start}|${end}`;
        const existingInvoice=existingByKey.get(key);
        if (existingInvoice && (['paid','partial','pending','overdue','void','cancelled'].includes(String(existingInvoice.status||'').toLowerCase()) || (action==='backfill_drafts' && existingInvoice.status==='sent'))) {skipped++;continue;}
        // Never create another invoice for a service interval already billed
        // under a different date range (legacy monthly/multi-week records).
        const overlap=(invoices||[]).find((old:any)=>
          String(old.id)!==String(existingInvoice?.id||'') &&
          siteOf(old.site_name).toLowerCase()===name.toLowerCase() &&
          old.period_start<=end && old.period_end>=start &&
          !['void','cancelled'].includes(String(old.status||'').toLowerCase()));
        if(overlap){
          held++;
          results.push({site:name,status:'overlap_requires_review',invoice_number:overlap.invoice_number,
            existing_invoice_number:existingInvoice?.invoice_number||null,
            reason:'Another invoice covers some or all of these service dates. The charges and line items must be reconciled before another bill is sent.'});
          continue;
        }
        const rows=(entries||[]).filter((entry:any)=>entry.clock_in&&entry.clock_out&&entry.archived!==true&&siteOf(entry.location)===name&&easternDate(entry.clock_in)>=start&&easternDate(entry.clock_in)<=end);
        if(!rows.length){skipped++;continue;}
        let totalHours=0,total=0;
        const reviewReasons=new Set<string>();
        const shifts=rows.map((entry:any)=>{
          const h=hours(entry);
          // An audited rate approved for this existing invoice must survive
          // future automatic reruns; do not overwrite it with the site's newer rate.
          const approved=Number(existingInvoice?.billing_rate_verified_value||0);
          const rateResult=approved>0 && existingInvoice?.billing_rate_verified_at
            ? {rate:approved,needsReview:false,reason:''}
            : hourlyRate(entry,location,schedules||[]);
          const rate=rateResult.rate;
          if(rateResult.needsReview) reviewReasons.add(rateResult.reason || 'Review historical billing rate');
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
        if (!existingInvoice) sequence++;
        const number=existingInvoice?.invoice_number || `${prefix}${String(sequence).padStart(3,'0')}`;
        const needsReview=reviewReasons.size>0;
        const reviewReason=[...reviewReasons].join('; ');
        const invoiceData={invoice_number:number,client_email:target,delivery_email:target,site_name:name,period_start:start,period_end:end,total_hours:dollars(totalHours),bill_rate:totalHours>0?dollars(total/totalHours):Number(location.site_bill_rate),total_amount:dollars(total),base_amount:dollars(total),late_fee_amount:0,late_fee_rate:0.10,shifts:JSON.stringify(shifts),due_date:dateOffset(end,15),status:existingInvoice?.status==='sent'?'sent':'draft',delivery_status:needsReview?'review_required':existingInvoice?.delivery_status||'pending',billing_review_required:needsReview,billing_review_reason:reviewReason,notes:[reason,reviewReason,'Generated from recorded work hours and effective-date rates.'].filter(Boolean).join(' ')};
        const oldShifts=String(existingInvoice?.shifts||'');
        const unchanged=Boolean(existingInvoice && dollars(Number(existingInvoice.total_amount||0))===dollars(total) && Number(existingInvoice.total_hours||0).toFixed(2)===totalHours.toFixed(2) && oldShifts===invoiceData.shifts);
        if (unchanged && existingInvoice?.delivery_status==='accepted') {
          if(existingInvoice.due_date!==invoiceData.due_date)await base44.asServiceRole.entities.Invoice.update(existingInvoice.id,{due_date:invoiceData.due_date});
          skipped++;continue;
        }
        if (existingInvoice?.status==='sent' && !existingInvoice?.sent_at && !existingInvoice?.delivery_status) {
          held++;results.push({site:name,status:'legacy_delivery_unconfirmed',invoice_number:number});continue;
        }
        const before=existingInvoice?{total_amount:existingInvoice.total_amount,total_hours:existingInvoice.total_hours,shifts:existingInvoice.shifts,status:existingInvoice.status,updated_at:existingInvoice.updated_date}:null;
        const revision=Number(existingInvoice?.revision||1)+(existingInvoice&&!unchanged?1:0);
        let priorRevisions:any[]=[];
        try {
          const prior=typeof existingInvoice?.revision_history==='string'?JSON.parse(existingInvoice.revision_history):(existingInvoice?.revision_history||[]);
          priorRevisions=Array.isArray(prior)?prior:[];
        } catch { priorRevisions=[]; }
        const audit=existingInvoice&&!unchanged?JSON.stringify([...priorRevisions,{when:new Date().toISOString(),reason:'Recalculated using current service records and effective historical rates',prior:before}].slice(-50)):existingInvoice?.revision_history;
        const invoice=existingInvoice
          ? await base44.asServiceRole.entities.Invoice.update(existingInvoice.id,{...invoiceData,revision,revision_history:audit||''})
          : await base44.asServiceRole.entities.Invoice.create({...invoiceData,revision:1});
        if(existingInvoice) updated++; else created++;
        existingByKey.set(key,invoice);
        // Historical drafts and unverified rates must never be emailed silently.
        if(action==='backfill_drafts' || action==='create_draft' || needsReview) {results.push({invoice_number:number,site:name,period_start:start,period_end:end,amount:dollars(total),status:needsReview?'review_required':'draft',recipient:target});continue;}
        const detail=shifts.map((shift:any)=>`<tr><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.date)}</td><td style="padding:5px;border-bottom:1px solid #ddd">${encode(shift.hours)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.rate)}</td><td style="padding:5px;border-bottom:1px solid #ddd">$${encode(shift.amount)}</td></tr>`).join('');
        const emailBody=`<div style="font:14px Arial,sans-serif;max-width:640px;color:#18263a"><div style="background:#0d1b2c;color:#e3bf70;padding:20px;font-size:20px;font-weight:bold">BLACK POINT SECURITY — INVOICE ${encode(number)}</div><p><b>Service location:</b> ${encode(name)}<br/><b>Service period:</b> ${encode(start)} through ${encode(end)}<br/><b>Due:</b> ${encode(invoiceData.due_date)}</p><table width="100%" cellspacing="0"><thead><tr><th align="left">Date</th><th align="left">Hours</th><th align="left">Rate</th><th align="left">Amount</th></tr></thead><tbody>${detail}</tbody></table><h2>Total due: $${invoiceData.total_amount.toFixed(2)}</h2><p>${reason||'Thank you for your business.'}</p><p>Unpaid invoices may be assessed one one-time 10% late fee after the due date, subject to the applicable client agreement.</p><p>Black Point Protection · management@blackpointkjc.com</p></div>`;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({to:target,subject:`Black Point ${existingInvoice?'Revised ':''}Invoice ${number} — ${name} (${start}–${end})`,body:emailBody});
          await base44.asServiceRole.entities.Invoice.update(invoice.id,{status:'sent',delivery_status:'accepted',delivery_email:target,sent_at:new Date().toISOString()});
          sent++;results.push({invoice_number:number,site:name,status:'sent',recipient:target});
          const clientTargets=(users||[]).filter((row:any)=>eligibleClient(row) && (
            String(row.email||'').toLowerCase()===target ||
            String(location.assigned_client_email||'').toLowerCase()===String(row.email||'').toLowerCase() ||
            [row.assigned_location,...(row.assigned_locations||[]),...(row.assigned_sites||[])].some((place:any)=>siteOf(place).toLowerCase()===name.toLowerCase())));
          for(const clientUser of clientTargets.slice(0,20)){
            await base44.asServiceRole.entities.Notification.create({recipient_email:String(clientUser.email).toLowerCase(),type:'invoice_due',title:`Black Point Invoice #${number}`,message:`${name} · ${start}–${end} · $${dollars(total).toFixed(2)} due ${invoiceData.due_date}. Open Client Center > Billing & Invoices.`,related_id:String(invoice.id),priority:'normal',is_read:false,action_link:'/ClientPayrollReport'}).catch((error:any)=>console.error('Client invoice alert failed',error?.message));
          }
        } catch(error:any) {
          const message=String(error?.message||'Delivery provider error');
          await base44.asServiceRole.entities.Invoice.update(invoice.id,{status:existingInvoice?.status==='sent'?'sent':'draft',delivery_status:'failed',delivery_error:message}).catch(()=>null);
          deliveryFailed++;results.push({invoice_number:number,site:name,status:'delivery_failed',recipient:target,error:message});
          console.error('Automated invoice email failed',number,message);
        }
      }
      } catch(siteError:any) {
        processingFailed++;
        const detail=String(siteError?.message||'Unable to process site invoice');
        console.error('Invoice generator failed for site',String(location?.site_name||''),detail);
        results.push({site:String(location?.site_name||'Unknown'),status:'processing_failed',error:detail});
      }
    }
    const runSummary:any={period_start:periodStart,period_end:periodEnd,created,updated,sent,delivery_failed:deliveryFailed,processing_failed:processingFailed,skipped,held,results,recipient_fallback:MANAGEMENT_EMAIL};
    // Every scheduled Monday billing run also tries to issue older *verified*
    // unsent drafts. Overlaps and unresolved historical rates remain held.
    if(!manual)runSummary.historical_backlog=await issueVerifiedDrafts();
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type:'Invoice',entity_id:'weekly-billing',
        action:'create',
        actor_id:manual?'accounting':'automation',actor_name:manual?'Accounting':'Monday Billing Scheduler',
        before_value:'',after_value:JSON.stringify(runSummary),
        description:`${manual?'Manual':'Scheduled Monday'} invoice run: ${created} new, ${updated} revised, ${sent} email provider accepted, ${deliveryFailed} email failed, ${processingFailed} sites failed, ${held} overlap held`,
        timestamp:new Date().toISOString(),
      });
    } catch(error:any) {console.warn('Billing run audit could not be recorded',String(error?.message||error));}
    return Response.json({success:processingFailed===0 && deliveryFailed===0,...runSummary});
  } catch(error:any){console.error('generateWeeklyInvoices failed',error);return Response.json({error:error?.message||'Unable to generate invoices'},{status:500});}
});
