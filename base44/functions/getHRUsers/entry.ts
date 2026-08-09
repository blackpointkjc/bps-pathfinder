import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const supportRank = ['support staff', 'human resources'].includes(String(user?.rank || '').toLowerCase());
    const hrPrivileged = !!user && (user.role === 'admin' || roles.has('hr') || roles.has('full_access'));
    const privileged = hrPrivileged || (!!user && roles.has('trainer'));
    const authorized = privileged || (!!user && (supportRank || roles.has('support_staff')));
    if (!authorized) return Response.json({ error: 'Unauthorized', users: [] }, { status: 403 });

    const allUsers = await base44.asServiceRole.entities.User.list();
    const internalRoles = new Set(['cad_access', 'officer', 'supervisor', 'hr', 'accounting', 'trainer', 'full_access']);
    const users = (allUsers || [])
      .filter((entry: any) => {
        if (!privileged && entry.email !== user.email) return false;
        const entryRoles = entry.additional_roles || [];
        return !entry.termination_date && (entry.role === 'admin' || entryRoles.some((role: string) => internalRoles.has(String(role).toLowerCase())) || ['support staff', 'human resources'].includes(String(entry.rank || '').toLowerCase()));
      })
      .map((entry: any) => hrPrivileged ? {
        ...entry,
        role: entry.role || 'user',
        additional_roles: entry.additional_roles || [],
        pto_balance_hours: entry.pto_balance_hours || 0,
        sick_time_balance_hours: entry.sick_time_balance_hours || entry.sick_balance_hours || 0,
      } : ({
        id: entry.id,
        email: entry.email,
        role: entry.role || 'user',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || '',
        unit_number: entry.unit_number || '',
        profile_photo_url: entry.profile_photo_url || '',
        additional_roles: entry.additional_roles || [],
        pto_balance_hours: entry.pto_balance_hours || 0,
        sick_time_balance_hours: entry.sick_time_balance_hours || entry.sick_balance_hours || 0,
      }))
      .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json({ error: error.message, users: [] }, { status: 500 });
  }
});
