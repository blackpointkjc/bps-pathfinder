import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required', officers: [] }, { status: 401 });

    const [users, teamsLinks, outlookLinks] = await Promise.all([
      base44.asServiceRole.entities.User.list('last_name', 1000),
      base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 1000).catch(() => []),
      base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 1000).catch(() => []),
    ]);
    const teamsByUser = new Map<string, any>();
    for (const link of teamsLinks || []) {
      if (link?.active === false || !link?.user_id || teamsByUser.has(String(link.user_id))) continue;
      teamsByUser.set(String(link.user_id), link);
    }
    const outlookByUser = new Map<string, any>();
    for (const link of outlookLinks || []) {
      if (link?.connected === false || !link?.user_id || outlookByUser.has(String(link.user_id))) continue;
      outlookByUser.set(String(link.user_id), link);
    }
    const email = (value: any) => String(value || '').trim().toLowerCase();

    const officers = (users || [])
      .filter((entry: any) => {
        if (!entry?.email || entry.termination_date) return false;
        const roles = new Set((entry.additional_roles || []).map((role: string) => String(role).toLowerCase()));
        return roles.has('officer');
      })
      .map((entry: any) => {
        const teams = teamsByUser.get(String(entry.id));
        const outlook = outlookByUser.get(String(entry.id));
        const workEmail = email(entry.email);
        const pathfinderEmail = email(teams?.pathfinder_email || outlook?.pathfinder_email || workEmail);
        const microsoftEmail = email(teams?.microsoft_email || outlook?.outlook_email);
        return ({
        id: entry.id,
        email: workEmail || pathfinderEmail,
        work_email: workEmail || pathfinderEmail,
        pathfinder_email: pathfinderEmail || workEmail,
        microsoft_email: microsoftEmail,
        outlook_email: email(outlook?.outlook_email || teams?.microsoft_email),
        email_aliases: [...new Set([workEmail, pathfinderEmail, microsoftEmail].filter(Boolean))],
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
