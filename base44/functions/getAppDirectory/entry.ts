import { createClientFromRequest } from 'npm:@base44/sdk';

function lowerRoles(user: any) {
  return new Set((user?.additional_roles || []).map((r: string) => String(r).toLowerCase()));
}

const cleanEmail = (value: any) => String(value || '').trim().toLowerCase();

function addEmailAliases(entry: any, teamsByUser: Map<string, any>, outlookByUser: Map<string, any>) {
  const teams = teamsByUser.get(String(entry?.id || ''));
  const outlook = outlookByUser.get(String(entry?.id || ''));
  const workEmail = cleanEmail(entry?.email);
  const pathfinderEmail = cleanEmail(teams?.pathfinder_email || outlook?.pathfinder_email || workEmail);
  const microsoftEmail = cleanEmail(teams?.microsoft_email || outlook?.outlook_email);
  const aliases = [...new Set([workEmail, pathfinderEmail, microsoftEmail].filter(Boolean))];
  return {
    ...entry,
    email: workEmail || pathfinderEmail,
    work_email: workEmail || pathfinderEmail,
    pathfinder_email: pathfinderEmail || workEmail,
    microsoft_email: microsoftEmail,
    outlook_email: cleanEmail(outlook?.outlook_email || teams?.microsoft_email),
    email_aliases: aliases,
  };
}

function safeUser(entry: any, full = false) {
  if (full) return entry;
  return {
    id: entry.id,
    email: entry.email || '',
    work_email: entry.work_email || entry.email || '',
    pathfinder_email: entry.pathfinder_email || entry.email || '',
    microsoft_email: entry.microsoft_email || '',
    outlook_email: entry.outlook_email || entry.microsoft_email || '',
    email_aliases: entry.email_aliases || [entry.email].filter(Boolean),
    first_name: entry.first_name || '',
    last_name: entry.last_name || '',
    full_name: entry.full_name || '',
    rank: entry.rank || '',
    unit_number: entry.unit_number || '',
    badge_number: entry.badge_number || '',
    division: entry.division || '',
    subdivision: entry.subdivision || '',
    profile_photo_url: entry.profile_photo_url || '',
    additional_roles: entry.additional_roles || [],
    role: entry.role || 'user',
    user_type: entry.user_type || '',
    account_type: entry.account_type || '',
    portal_type: entry.portal_type || '',
    account_status: entry.account_status || '',
    employment_status: entry.employment_status || '',
    termination_date: entry.termination_date || '',
    assigned_sites: entry.assigned_sites || [],
    assigned_locations: entry.assigned_locations || [],
    assigned_location: entry.assigned_location || '',
    status: entry.status,
    last_updated: entry.last_updated || entry.updated_date || '',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = lowerRoles(me);
    const rank = String(me.rank || '').toLowerCase();
    const fullAccess = me.role === 'admin' || roles.has('full_access');
    const hrAccess = fullAccess || roles.has('hr') || rank === 'human resources';
    const trainerAccess = fullAccess || roles.has('trainer');
    const accountingAccess = fullAccess || roles.has('accounting');
    const supervisorAccess = fullAccess || roles.has('supervisor');
    // Trainers do not receive full employee records from the general app directory.
    // Training-specific pages must use getTrainingUsers, which returns only the
    // identity/certification fields necessary for training work.
    const internalPrivileged = hrAccess || accountingAccess || supervisorAccess;
    const clientOnly = !fullAccess && (roles.has('client') || me.user_type === 'client' || rank === 'client');
    const studentOnly = !fullAccess && roles.has('student');

    const [rawUsers, rawLocations, rawDivisions, rawTeamsLinks, rawOutlookLinks] = await Promise.all([
      base44.asServiceRole.entities.User.list(undefined, 1000),
      base44.asServiceRole.entities.Location.list('site_name', 1000),
      base44.asServiceRole.entities.Division.list('division_name', 1000).catch(() => []),
      base44.asServiceRole.entities.MicrosoftTeamsIdentity.list('-updated_at', 1000).catch(() => []),
      base44.asServiceRole.entities.OutlookMailboxLink.list('-last_verified_at', 1000).catch(() => []),
    ]);

    const teamsByUser = new Map<string, any>();
    for (const link of rawTeamsLinks || []) {
      if (link?.active === false || !link?.user_id || teamsByUser.has(String(link.user_id))) continue;
      teamsByUser.set(String(link.user_id), link);
    }
    const outlookByUser = new Map<string, any>();
    for (const link of rawOutlookLinks || []) {
      if (link?.connected === false || !link?.user_id || outlookByUser.has(String(link.user_id))) continue;
      outlookByUser.set(String(link.user_id), link);
    }
    const directoryUsers = (rawUsers || []).map((entry: any) => addEmailAliases(entry, teamsByUser, outlookByUser));

    const internalRoles = new Set(['cad_access','officer','supervisor','hr','accounting','trainer','full_access','support_staff']);
    const isInternal = (entry: any) => {
      const rs = new Set((entry.additional_roles || []).map((r: string) => String(r).toLowerCase()));
      const r = String(entry.rank || '').toLowerCase();
      const t = String(entry.user_type || entry.account_type || entry.portal_type || '').toLowerCase();
      if (entry.termination_date) return false;
      if (rs.has('client') || rs.has('student') || ['client','student','pending'].includes(t) || ['client','student'].includes(r)) return false;
      return entry.role === 'admin' || [...rs].some((x: string) => internalRoles.has(x)) || Boolean(r && !['client','student'].includes(r)) || String(entry.employment_status || '').toLowerCase() === 'active';
    };

    let users: any[] = [];
    if (fullAccess || hrAccess) {
      users = directoryUsers.map((u: any) => safeUser(u, true));
    } else if (clientOnly) {
      users = directoryUsers.filter(isInternal).map((u: any) => safeUser(u, false));
    } else if (studentOnly) {
      users = directoryUsers.filter((u: any) => u.email === cleanEmail(me.email) || lowerRoles(u).has('trainer') || u.role === 'admin').map((u: any) => safeUser(u, false));
    } else {
      users = (rawUsers || []).filter(isInternal).map((u: any) => safeUser(u, internalPrivileged));
    }

    let locations = rawLocations || [];
    if (clientOnly) {
      locations = locations.filter((l: any) => l.active !== false);
      const allowed = new Set([...(me.assigned_sites || []), ...(me.assigned_locations || []), me.assigned_location].filter(Boolean).map(String));
      locations = locations.filter((l: any) => allowed.has(String(l.site_name)) || String(l.assigned_client_email || '').toLowerCase() === String(me.email || '').toLowerCase());
    }

    const divisions = clientOnly
      ? (rawDivisions || []).filter((d: any) => d.active !== false)
      : (rawDivisions || []);

    users.sort((a: any, b: any) => `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(`${b.last_name || ''} ${b.first_name || ''}`));

    return Response.json({
      success: true,
      users,
      locations,
      divisions,
      meta: { user_count: users.length, location_count: locations.length, division_count: divisions.length },
    });
  } catch (error) {
    console.error('getAppDirectory failed', error);
    return Response.json({ error: error?.message || 'Unable to load app directory', users: [], locations: [], divisions: [] }, { status: 500 });
  }
});
