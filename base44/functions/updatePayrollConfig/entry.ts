import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
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
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});