import { createClientFromRequest } from 'npm:@base44/sdk';
const __limitFullAccess = (user:any) => user && String(user.id)!=='6a72bbee2842d6338cbae513' ? {...user,additional_roles:(user.additional_roles||[]).filter((role:any)=>String(role).toLowerCase()!=='full_access')} : user;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().then(__limitFullAccess).catch(()=>null);
    let __portalService=false;
    if(!__portalCaller && req.headers.get('Authorization')){try{await base44.entities.SystemScanRun.list('-created_date',1);__portalService=true;}catch{}}
    if ((!__portalCaller && !__portalService) || (__portalCaller && ((__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().then(__limitFullAccess).catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    if (user.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Forbidden' }, { status: 403 });

    let deleted = 0;
    for (let pass = 0; pass < 500; pass++) {
      const rows = await base44.asServiceRole.entities.LocationLog.list('-created_date', 500);
      if (!rows?.length) break;
      for (const row of rows) {
        await base44.asServiceRole.entities.LocationLog.delete(row.id);
        deleted++;
      }
      if (rows.length < 500) break;
    }
    return Response.json({ success: true, deleted });
  } catch (error) {
    console.error('purgeLegacyLocationLogs failed', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
