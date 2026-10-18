import {createClientFromRequest} from 'npm:@base44/sdk';
import {postRecurringBills} from './recurring.ts';
Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const now=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date());
    if(Number(now)!==8)return Response.json({success:true,skipped:true,reason:'Recurring bills post at 8 AM Eastern'});
    const result=await postRecurringBills(base44.asServiceRole.entities,today);
    return Response.json({...result,run_date:today});
  }catch(error:any){return Response.json({error:error?.message||'Monthly bill scheduler failed'},{status:500});}
});
