import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = currentUser.role === 'admin' || roles.has('full_access') || roles.has('client');
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { officerEmails = [] } = await req.json();
    const requested = new Set((officerEmails || []).filter(Boolean));
    const users = await base44.asServiceRole.entities.User.list();
    const officers = (users || [])
      .filter((u: any) => {
        const roles = new Set((u.additional_roles || []).map((r: string) => String(r).toLowerCase()));
        const isOfficer = roles.has('officer') || u.role === 'admin';
        const active = !u.termination_date && u.employment_status !== 'terminated';
        return isOfficer && active && (requested.size === 0 || requested.has(u.email));
      })
      .map((u: any) => ({ email: u.email, rank: u.rank || 'Officer', last_name: u.last_name || '' }));

    return Response.json({ officers });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to load officer directory', officers: [] }, { status: 500 });
  }
});