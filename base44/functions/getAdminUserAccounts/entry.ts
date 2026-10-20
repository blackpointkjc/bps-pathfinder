import { isClientIdentity, clientOperationalPatch } from './clientAccountPolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async req => {
  try {
    const api = createClientFromRequest(req);
    const caller = await api.auth.me().catch(() => null);
    const roles = new Set((caller?.additional_roles || []).map((x:string) => String(x).toLowerCase()));
    if (!caller || (caller.role !== 'admin' && !roles.has('full_access'))) {
      return Response.json({error:'Administrator access required'}, {status:403});
    }
    // Account approvals must use the real identity records rather than the
    // 10-minute cached operational directory, which misses new registrants.
    const users = await api.asServiceRole.entities.User.list('-created_date', 1000);
    // Authorized migration: old client-only accounts retained officer defaults.
    // Clear those fields once; retain property permissions and account history.
    for(const person of users||[]){
      const patch:any=clientOperationalPatch(person);
      if(String(person.id)!=='6a72bbee2842d6338cbae513'&&(person.additional_roles||[]).some((role:any)=>String(role).toLowerCase()==='accounting'))patch.additional_roles=(person.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='accounting');
      if(Object.keys(patch).length){await api.asServiceRole.entities.User.update(person.id,patch);Object.assign(person,patch);}
    }
    const staff=(users||[]).filter(person=>!isClientIdentity(person));
    return Response.json({success:true,users:staff,count:staff.length});
  } catch(error:any) {
    const message = String(error?.message || 'Account list unavailable');
    const rateLimited = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(message);
    return Response.json({error:message}, {status:rateLimited ? 429 : 500});
  }
});
