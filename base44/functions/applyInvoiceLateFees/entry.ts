import {createClientFromRequest} from 'npm:@base44/sdk';
const money=(n:any)=>Math.round(Number(n||0)*100)/100;
const yes=(v:any)=>['sent','pending','partial','overdue'].includes(String(v||'').toLowerCase());
const emailOk=(v:any)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||''));
Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req);
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const manual=['run_now','preview'].includes(String(body.action||''));
    if(manual){const user=await base44.auth.me().catch(()=>null);const roles=new Set((user?.additional_roles||[]).map((v:string)=>v.toLowerCase()));if(!user||(user.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access')))return Response.json({error:'Accounting access required'},{status:403});}
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const value=(key:string)=>parts.find(x=>x.type===key)?.value||'';
    const today=`${value('year')}-${value('month')}-${value('day')}`;
    if(!manual&&Number(value('hour'))!==8)return Response.json({success:true,skipped:true,reason:'Invoice overdue processing runs at 8 AM Eastern'});
    const invoices=await base44.asServiceRole.entities.Invoice.list('-due_date',3000);
    // Report the real reasons no 10% assessment occurs. An unsent draft has
    // not been delivered, and a future due date is not legally past due.
    const summary={total:(invoices||[]).length,drafts:0,future_due:0,not_provider_accepted:0,under_review:0,already_paid:0,eligible:0,future_dated_overdue:0};
    for(const row of invoices||[]){
      const state=String(row.status||'').toLowerCase();
      if(state==='draft'){summary.drafts++;continue;}
      if(!yes(state))continue;
      if(row.due_date>=today){summary.future_due++;if(state==='overdue')summary.future_dated_overdue++;continue;}
      if(row.billing_review_required===true){summary.under_review++;continue;}
      if(String(row.delivery_status||'').toLowerCase()!=='accepted'){summary.not_provider_accepted++;continue;}
      if(Number(row.amount_paid||0)>=Number(row.total_amount||0)){summary.already_paid++;continue;}
      summary.eligible++;
    }
    if(body.action==='preview'){
      const actor=await base44.auth.me().catch(()=>null);
      const roles=new Set((actor?.additional_roles||[]).map((v:string)=>v.toLowerCase()));
      if(!actor||(actor.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access')))return Response.json({error:'Accounting access required'},{status:403});
      return Response.json({success:true,as_of:today,summary});
    }
    const locations=await base44.asServiceRole.entities.Location.list('site_name',1000);
    let overdue=0,assessed=0,notified=0,failed=0;
    const results:any[]=[];
    for(const original of invoices||[]){
      if(!yes(original.status)||!original.due_date||original.due_date>=today||original.billing_review_required===true||String(original.delivery_status||'').toLowerCase()!=='accepted')continue;
      const existingFee=money(original.late_fee_amount||0);
      const base=money(original.base_amount||money(original.total_amount)-existingFee);
      if(base<=0||Number(original.amount_paid||0)>=money(base+existingFee))continue;
      const fee=existingFee>0?existingFee:money(base*0.10);
      const total=money(base+fee);
      const now=new Date().toISOString();
      let saved:any;
      try{
        saved=await base44.asServiceRole.entities.Invoice.update(original.id,{
          status:'overdue',base_amount:base,total_amount:total,late_fee_amount:fee,late_fee_rate:0.10,
          late_fee_applied_at:original.late_fee_applied_at||now,
        });
        overdue++;if(existingFee<=0)assessed++;
      }catch(error:any){failed++;results.push({invoice:original.invoice_number,error:error?.message||'Unable to update'});continue;}
      // Only one notice per invoice fee. Retry failed notification next run.
      if(original.late_notice_status==='accepted')continue;
      const site=locations.find((row:any)=>String(row.site_name||'').trim()===String(original.site_name||'').trim());
      const recipient=String(site?.billing_contact_email||'').trim().toLowerCase();
      if(!emailOk(recipient)) {results.push({invoice:original.invoice_number,site:original.site_name,error:'Late fee posted, but notice held: verified client billing contact required'});continue;}
      const target=recipient;
      try{
        await base44.asServiceRole.integrations.Core.SendEmail({to:target,
          subject:`Black Point invoice ${original.invoice_number} — Overdue, 10% late fee assessed`,
          body:`<div style="font:15px Arial,sans-serif"><h2>Black Point Security — Overdue Invoice</h2><p>Invoice #${String(original.invoice_number||'').replace(/[<>]/g,'')} for ${String(original.site_name||'').replace(/[<>]/g,'')} was due ${original.due_date}.</p><p>Service charges: $${base.toFixed(2)}<br/>One-time late fee (10%): $${fee.toFixed(2)}<br/><b>Updated invoice total: $${total.toFixed(2)}</b><br/>Payments received: $${money(original.amount_paid).toFixed(2)}<br/><b>Outstanding: $${money(total-Number(original.amount_paid||0)).toFixed(2)}</b></p><p>Sign in to your Black Point client portal to view the updated invoice.</p></div>`});
        await base44.asServiceRole.entities.Invoice.update(original.id,{late_notice_status:'accepted',late_notice_sent_at:now});notified++;
      }catch(error:any){await base44.asServiceRole.entities.Invoice.update(original.id,{late_notice_status:'failed'}).catch(()=>null);failed++;results.push({invoice:original.invoice_number,error:'Late notice email failed: '+String(error?.message||error)});}
    }
    return Response.json({success:failed===0,overdue,fees_assessed:assessed,emails_accepted:notified,failed,summary,results,as_of:new Date().toISOString()});
  }catch(error:any){return Response.json({error:error?.message||'Overdue invoice job failed'},{status:500});}
});
