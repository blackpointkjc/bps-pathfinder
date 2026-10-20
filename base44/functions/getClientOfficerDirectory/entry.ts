import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    if (!currentUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((currentUser.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const client = [currentUser.role, currentUser.rank, currentUser.user_type, currentUser.account_type, currentUser.portal_type].some(value => String(value || '').trim().toLowerCase() === 'client') || roles.has('client');
    const allowed = currentUser.role === 'admin' || roles.has('full_access') || client;
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { officerEmails = [] } = await req.json();
    const requested = new Set((officerEmails || []).filter(Boolean).map((value: string) => value.trim().toLowerCase()));
    const users = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const officers = (users || [])
      .filter((u: any) => {
        const roles = new Set((u.additional_roles || []).map((r: string) => String(r).toLowerCase()));
        const isOfficer = roles.has('officer') || ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'].includes(String(u.rank || '').trim().toLowerCase());
        const active = !u.termination_date && u.employment_status !== 'terminated';
        return isOfficer && active && (requested.size === 0 || [u.email,u.work_email,u.pathfinder_email,u.microsoft_email,u.outlook_email,...(Array.isArray(u.email_aliases) ? u.email_aliases : [])].some(value => requested.has(String(value || '').trim().toLowerCase())));
      })
      .map((u: any) => ({ email: u.email, email_aliases: [u.email,u.work_email,u.pathfinder_email,u.microsoft_email,u.outlook_email,...(Array.isArray(u.email_aliases) ? u.email_aliases : [])].filter(Boolean), rank: u.rank || 'Officer', last_name: u.last_name || '', unit_number: u.unit_number || '' }));

    return Response.json({ officers });
  } catch (error) {
    return Response.json({ error: error.message || 'Unable to load officer directory', officers: [] }, { status: 500 });
  }
});