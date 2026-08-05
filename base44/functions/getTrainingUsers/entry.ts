import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const roles = new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
    const authorized = !!user && (user.role === 'admin' || roles.has('trainer') || roles.has('full_access'));
    if (!authorized) return Response.json({ error: 'Trainer access required', users: [] }, { status: 403 });

    const allUsers = await base44.asServiceRole.entities.User.list(undefined, 1000);
    const users = (allUsers || [])
      .filter((entry: any) => !entry.termination_date)
      .map((entry: any) => ({
        id: entry.id,
        email: entry.email || '',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || '',
        unit_number: entry.unit_number || '',
        division: entry.division || '',
        employment_status: entry.employment_status || '',
        profile_photo_url: entry.profile_photo_url || '',
        additional_roles: entry.additional_roles || [],
        officer_certifications: Array.isArray(entry.officer_certifications) ? entry.officer_certifications : [],
        dcjs_number: entry.dcjs_number || '',
        dcjs_expiration: entry.dcjs_expiration || '',
        firearm_expiration: entry.firearm_expiration || '',
      }))
      .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

    return Response.json({ success: true, users });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unable to load training users', users: [] }, { status: 500 });
  }
});