import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Pending account identities cannot call operational service-role endpoints.
    const __portalCaller = await base44.auth.me().catch(()=>null);
    if (!__portalCaller || (__portalCaller.additional_roles||[]).includes('visitor') || __portalCaller.disabled || __portalCaller.termination_date || String(__portalCaller.employment_status||'').toLowerCase()==='terminated' || (!__portalCaller.is_service && __portalCaller.role!=='admin' && !(__portalCaller.additional_roles||[]).length && !['investigator','reviewer'].includes(__portalCaller.ps_role))) return Response.json({error:'Approved portal access required'},{status:403});
    base44.auth.me = async () => __portalCaller;

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (String(user.id) !== '6a72bbee2842d6338cbae513') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const configs = await base44.asServiceRole.entities.PayrollConfig.list();
    const config = configs[0];

    if (!config) {
      return Response.json({ error: 'No payroll config found' }, { status: 404 });
    }

    // Update locked fields only - can only be changed via backend
    const updated = await base44.asServiceRole.entities.PayrollConfig.update(config.id, {
      company_legal_name: 'KJC Security Solution Llc DBA Black Point',
      employer_ein: '41-3267629',
      company_address: '701 E Franklin Street, 105 1052, Richmond, VA 23219',
      payroll_email: 'admin@blackpointkjc.com',
    });

    return Response.json({ success: true, data: updated });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
