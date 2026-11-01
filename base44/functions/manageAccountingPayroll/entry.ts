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
const lower=(v:any)=>String(v||'').trim().toLowerCase();
const money=(v:any)=>Math.round(Number(v||0)*100)/100;
Deno.serve(async req=>{
  try {
    const base44=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if(__portalCaller&&!__portalCaller.is_service&&!await __portalLoginIsCurrent(req,base44,__portalCaller))return Response.json({error:'Your Pathfinder session ended. Please sign in again.',code:'SESSION_REAUTH_REQUIRED'},{status:401});
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const actor=await base44.auth.me().catch(()=>null);
    if(!actor)return Response.json({error:'Sign in required'},{status:401});
    const roles=new Set((actor.additional_roles||[]).map(lower));
    if (String(actor.id) !== '6a72bbee2842d6338cbae513') return Response.json({error:'Accounting permission required'},{status:403});
    const body=await req.json().catch(()=>({}));
    const action=lower(body.action);
    if(!['approve','paid'].includes(action))return Response.json({error:'Select Approve Check or Mark Paid'},{status:400});
    const id=String(body.payroll_entry_id||'');
    if(!id)return Response.json({error:'Payroll check is required'},{status:400});
    const payroll=await base44.asServiceRole.entities.PayrollEntry.get(id).catch(()=>null);
    if(!payroll)return Response.json({error:'Payroll check not found'},{status:404});
    const state=lower(payroll.status);
    if(state==='paid' || (state==='approved'&&action==='approve'))return Response.json({success:true,unchanged:true,record:payroll});
    if(action==='approve'&&!['ready','draft','exported'].includes(state))return Response.json({error:'Only ready/draft payroll checks can be approved'},{status:409});
    if(action==='paid'&&state!=='approved')return Response.json({error:'Approve this paycheck before marking it paid'},{status:409});
    if(!payroll.officer_email||!payroll.pay_period_start||!payroll.pay_period_end||!(Number(payroll.gross_pay)>=0))return Response.json({error:'Payroll check has missing pay period/officer/amount'},{status:409});
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(action==='approve'&&payroll.pay_period_end>=today)return Response.json({error:'The payroll period must end before final approval'},{status:409});
    // A corrected punch must be reconciled by payroll generation before approval.
    if(action==='approve'){
      const entries=await base44.asServiceRole.entities.TimeEntry.filter({officer_email:lower(payroll.officer_email)},'-clock_in',500);
      const latest=Math.max(0,...(entries||[]).filter((e:any)=>{
        const date=easternDay(e.clock_in);
        return date>=payroll.pay_period_start&&date<=payroll.pay_period_end;
      }).map((e:any)=>Date.parse(e.updated_date||e.created_date||'')||0));
      const runDate=Date.parse(payroll.last_recalculated_at||payroll.updated_date||payroll.created_date||'')||0;
      if(latest>runDate+1000)return Response.json({error:'A time entry changed after this report was generated. Run Selected Payroll Report again, then approve the corrected check.'},{status:409});
    }
    const now=new Date().toISOString();
    const status=action==='approve'?'approved':'paid';
    const record=await base44.asServiceRole.entities.PayrollEntry.update(id,{
      status,
      ...(action==='approve'?{approved_by:actor.email,approved_date:now}:{pay_date:String(body.pay_date||today),payment_method:String(body.payment_method||payroll.payment_method||'').slice(0,100)}),
    });
    // A stable reference posts payroll exactly once to the company ledger;
    // approval books a payable expense, paid moves that expense to Paid.
    const reference=`PAYROLL-${id}`;
    const existing=await base44.asServiceRole.entities.CompanyExpense.filter({reference_number:reference},'-created_date',10);
    const gross=money(payroll.gross_pay);
    const ledger={expense_date:payroll.pay_period_end,vendor:payroll.officer_email,category:'payroll',description:`Approved payroll wages ${payroll.pay_period_start}–${payroll.pay_period_end}`,amount:gross,reference_number:reference,status:status==='paid'?'paid':'unpaid',paid_date:status==='paid'?String(body.pay_date||today):'',due_date:String(payroll.pay_date||''),notes:`PayrollEntry ${id}. Gross taxable wages only; tax-free reimbursements are tracked separately.`};
    const bill=existing?.[0]
      ? await base44.asServiceRole.entities.CompanyExpense.update(existing[0].id,ledger)
      : await base44.asServiceRole.entities.CompanyExpense.create(ledger);
    await base44.asServiceRole.entities.AuditLog.create({entity_type:'PayrollEntry',entity_id:id,action:'status_change',actor_id:String(actor.id),actor_name:String(actor.email||''),before_value:JSON.stringify({status:payroll.status}),after_value:JSON.stringify({status,expense_id:bill.id,amount:gross}),timestamp:now,description:`Payroll check ${status}; posted ${reference} as ${ledger.status}.`});
    return Response.json({success:true,record,expense:bill});
  }catch(error:any){console.error('manageAccountingPayroll failed',error?.message);return Response.json({error:error?.message||'Payroll approval failed'},{status:500})}
});
function easternDay(v:any){const date=new Date(v);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''}
