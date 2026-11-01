import { createClientFromRequest } from 'npm:@base44/sdk';
Deno.serve(async req => {
  try {
    const api=createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await api.auth.me().catch(()=>null);
    if (!__portalCaller || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});

    const me=await api.auth.me().catch(()=>null);
    const roles=new Set((me?.additional_roles||[]).map((s:string)=>String(s).toLowerCase()));
    if(!me || !(me.role==='admin'||me.role==='dispatch'||me.dispatch_role||me.is_supervisor||roles.has('full_access')||roles.has('cad_access')||roles.has('dispatch')||roles.has('supervisor')))return Response.json({error:'Dispatch access required'},{status:403});
    const rows=await api.asServiceRole.entities.User.filter({dispatch_hold_new_calls:true},'-dispatch_hold_at',200);
    return Response.json({success:true,officers:(rows||[]).map((u:any)=>({id:u.id,user_id:u.id,email:u.email,rank:u.rank,last_name:u.last_name,unit_number:u.unit_number,dispatch_hold_new_calls:true,status:u.status||'Unavailable'}))});
  }catch(error:any){return Response.json({error:error?.message||'Held officers unavailable'},{status:500});}
});
