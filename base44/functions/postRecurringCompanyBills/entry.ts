import {createClientFromRequest} from 'npm:@base44/sdk';
import {postRecurringBills} from './recurring.ts';
Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if (!__portalCaller || (__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const caller=await base44.auth.me().catch(()=>null);
    if(!caller||(!caller.is_service&&caller.role!=='admin'))return Response.json({error:'Unauthorized'},{status:403});
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const now=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date());
    if(Number(now)!==8)return Response.json({success:true,skipped:true,reason:'Recurring bills post at 8 AM Eastern'});
    const result=await postRecurringBills(base44.asServiceRole.entities,today);
    return Response.json({...result,run_date:today});
  }catch(error:any){return Response.json({error:error?.message||'Monthly bill scheduler failed'},{status:500});}
});
