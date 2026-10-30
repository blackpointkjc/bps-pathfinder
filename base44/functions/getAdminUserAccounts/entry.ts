import { createClientFromRequest } from 'npm:@base44/sdk';
// Keep account lookup read-only. Historical client-account sanitization belongs
// in account-management mutations, never in an N-user browser page load.
const clean=value=>String(value||'').trim().toLowerCase();
const isClientIdentity=person=>[].concat(person?.additional_roles||[]).map(clean).includes('client')
  ||[person?.rank,person?.user_type,person?.account_type,person?.portal_type].some(value=>clean(value)==='client');

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
    // A list request is a single read. Do not perform hundreds of
    // client-account migration updates every time Manage Users opens.
    const staff=(users||[]).filter(person=>!isClientIdentity(person));
    return Response.json({success:true,users:staff,count:staff.length});
  } catch(error:any) {
    const message = String(error?.message || 'Account list unavailable');
    const rateLimited = Number(error?.status || error?.response?.status) === 429 || /rate limit|too many requests/i.test(message);
    return Response.json({error:message}, {status:rateLimited ? 429 : 500});
  }
});
