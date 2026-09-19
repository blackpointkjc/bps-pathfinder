import { createClientFromRequest } from 'npm:@base44/sdk';

async function listUsers(base44: any) {
  const rows = await base44.asServiceRole.entities.User.list('last_name', 1000);
  return Array.isArray(rows) ? rows : [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required', officers: [] }, { status: 401 });

    const users = await listUsers(base44);
    const email = (value: any) => String(value || '').trim().toLowerCase();

    const officers = (users || [])
      .filter((entry: any) => {
        if (!entry?.email || entry.termination_date) return false;
        const roles = new Set((entry.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        return roles.has('officer');
      })
      .map((entry: any) => {
        const workEmail = email(entry.work_email || entry.pathfinder_email || entry.email);
        const pathfinderEmail = email(entry.pathfinder_email || entry.work_email || entry.email);
        const microsoftEmail = email(entry.microsoft_email || entry.outlook_email);
        return ({
        id: entry.id,
        email: workEmail || pathfinderEmail,
        work_email: workEmail || pathfinderEmail,
        pathfinder_email: pathfinderEmail || workEmail,
        microsoft_email: microsoftEmail,
        outlook_email: email(entry.outlook_email || entry.microsoft_email),
        email_aliases: [...new Set([workEmail, pathfinderEmail, microsoftEmail, ...((entry.email_aliases || []).map(email))].filter(Boolean))],
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        full_name: entry.full_name || '',
        rank: entry.rank || 'Officer',
        unit_number: entry.unit_number || '',
        badge_number: entry.badge_number || '',
        division: entry.division || '',
        subdivision: entry.subdivision || '',
        profile_photo_url: entry.profile_photo_url || '',
        pto_balance_hours: Number(entry.pto_balance_hours || 0),
        pto_year_to_date_accrued: Number(entry.pto_year_to_date_accrued || 0),
        pto_year_to_date_used: Number(entry.pto_year_to_date_used || 0),
        sick_time_balance_hours: Number(entry.sick_time_balance_hours || 0),
        sick_time_year_to_date_used: Number(entry.sick_time_year_to_date_used || 0),
        additional_roles: entry.additional_roles || ['officer'],
        employment_status: entry.employment_status || '',
        status: entry.status || '',
        assigned_location: entry.assigned_location || '',
        assigned_locations: entry.assigned_locations || [],
        assigned_sites: entry.assigned_sites || [],
      });
      })
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
