import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required', officers: [] }, { status: 401 });

    const users = await base44.asServiceRole.entities.User.list('last_name', 1000);
    const officers = (users || [])
      .filter((entry: any) => {
        if (!entry?.email || entry.termination_date) return false;
        const roles = new Set((entry.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        return roles.has('officer');
      })
      .map((entry: any) => ({
        id: entry.id,
        email: entry.email || '',
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || 'Officer',
        unit_number: entry.unit_number || '',
        badge_number: entry.badge_number || '',
        division: entry.division || '',
        subdivision: entry.subdivision || '',
        profile_photo_url: entry.profile_photo_url || '',
        additional_roles: ['officer'],
        employment_status: entry.employment_status || '',
        status: entry.status || '',
        assigned_location: entry.assigned_location || '',
        assigned_locations: entry.assigned_locations || [],
        assigned_sites: entry.assigned_sites || [],
      }))
      .sort((a: any, b: any) => {
        const rankCompare = String(a.rank).localeCompare(String(b.rank));
        return rankCompare || String(a.last_name).localeCompare(String(b.last_name)) || String(a.first_name).localeCompare(String(b.first_name));
      });

    return Response.json({ success: true, officers, count: officers.length });
  } catch (error) {
    console.error('getOfficerDirectory failed', error);
    return Response.json({ error: error?.message || 'Unable to load officer directory', officers: [] }, { status: 500 });
  }
});
