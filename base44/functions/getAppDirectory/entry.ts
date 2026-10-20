import { createClientFromRequest } from 'npm:@base44/sdk';

function lowerRoles(user: any) {
  return new Set((user?.additional_roles || []).map((r: string) => String(r).toLowerCase()));
}

const cleanEmail = (value: any) => String(value || '').trim().toLowerCase();
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function readSource(label: string, loader: () => Promise<any[]>, errors: Record<string,string>) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rows = await loader();
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(300);
    }
  }
  errors[label] = String(lastError?.message || lastError || 'Unavailable');
  console.warn(`getAppDirectory ${label} unavailable`, lastError);
  return [];
}

function addEmailAliases(entry: any, teamsByUser: Map<string, any>, outlookByUser: Map<string, any>) {
  const teams = teamsByUser.get(String(entry?.id || ''));
  const outlook = outlookByUser.get(String(entry?.id || ''));
  const workEmail = cleanEmail(entry?.work_email || entry?.email);
  const pathfinderEmail = cleanEmail(teams?.pathfinder_email || outlook?.pathfinder_email || entry?.pathfinder_email || workEmail);
  const microsoftEmail = cleanEmail(teams?.microsoft_email || outlook?.outlook_email || entry?.microsoft_email || entry?.outlook_email);
  const aliases = [...new Set([entry?.email, workEmail, pathfinderEmail, microsoftEmail, entry?.outlook_email, ...(Array.isArray(entry?.email_aliases) ? entry.email_aliases : [])].map(cleanEmail).filter(Boolean))];
  return {
    ...entry,
    email: workEmail || pathfinderEmail,
    work_email: workEmail || pathfinderEmail,
    pathfinder_email: pathfinderEmail || workEmail,
    microsoft_email: microsoftEmail,
    outlook_email: cleanEmail(outlook?.outlook_email || teams?.microsoft_email || entry?.outlook_email || entry?.microsoft_email),
    email_aliases: aliases,
  };
}

function safeUser(entry: any, full = false, includePrivateSelf = false) {
  if (full) return entry;
  return {
    id: entry.id,
    approved_leave_windows: entry.approved_leave_windows || [],
    out_of_office_source: entry.out_of_office_source || '',
    command_seniority_order: entry.command_seniority_order,
    out_of_office: entry.out_of_office === true,
    out_of_office_start: entry.out_of_office_start || '',
    out_of_office_return: entry.out_of_office_return || '',
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
    platoon: entry.platoon || '',
    oversight_platoon: entry.oversight_platoon || '',
    supervisor_id: entry.supervisor_id || '',
    supervisor_name: entry.supervisor_name || '',
    mobile_phone: entry.mobile_phone || '',
    unit_number: entry.unit_number || '',
    badge_number: entry.badge_number || '',
    division: entry.division || '',
    subdivision: entry.subdivision || '',
    profile_photo_url: entry.profile_photo_url || '',
    profile_photo_original_url: entry.profile_photo_original_url || '',
    additional_roles: entry.additional_roles || [],
    role: entry.role || 'user',
    is_supervisor: entry.is_supervisor === true,
    dispatch_role: entry.dispatch_role === true,
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
    ...(includePrivateSelf ? {
      address: entry.address || '',
      city: entry.city || '',
      state: entry.state || '',
      zip: entry.zip || '',
      current_call_id: entry.current_call_id || '',
      current_call_info: entry.current_call_info || '',
    } : {}),
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
    const clientOnly = !fullAccess && (roles.has('client') || [me.role, me.user_type, me.account_type, me.portal_type, rank].some(value => String(value || '').trim().toLowerCase() === 'client'));
    const studentOnly = !fullAccess && roles.has('student');

    // Keep the operational directory responsive even when an optional identity
    // source is slow. Two small read groups avoid the old 5-call serial chain that
    // could exceed the browser's 15-second request timeout and falsely appear down.
    // Individual source failures are returned as metadata instead of blanking the
    // entire directory with a 500 response.
    const sourceErrors: Record<string,string> = {};
    const [rawUsersRead, rawLocations] = await Promise.all([
      readSource('company employees', () => base44.asServiceRole.entities.User.list(undefined, 1000), sourceErrors),
      readSource('locations', () => base44.asServiceRole.entities.Location.list('site_name', 1000), sourceErrors),
    ]);
    const rawDivisions = await readSource(
      'divisions',
      () => base44.asServiceRole.entities.Division.list('division_name', 1000),
      sourceErrors,
    );
    const rawUsers = rawUsersRead.length ? rawUsersRead : [me];

    // Linked work/Microsoft aliases are now stored on the canonical User record.
    // Do not scan MicrosoftTeamsIdentity/OutlookMailboxLink for every directory
    // request; those reads were duplicated again during auth and performance loads.
    const directoryUsers = (rawUsers || []).map((entry: any) => addEmailAliases(entry, new Map(), new Map()));

    const internalRoles = new Set(['cad_access','officer','supervisor','hr','accounting','trainer','full_access','support_staff']);
    const isInternal = (entry: any) => {
      const rs = new Set((entry.additional_roles || []).map((r: string) => String(r).toLowerCase()));
      const r = String(entry.rank || '').toLowerCase();
      const t = String(entry.user_type || entry.account_type || entry.portal_type || '').toLowerCase();
      if (entry.termination_date) return false;
      if (rs.has('client') || rs.has('student') || ['client','student','pending'].includes(t) || ['client','student'].includes(r)) return false;
      return entry.role === 'admin' || [...rs].some((x: unknown) => internalRoles.has(String(x))) || Boolean(r && !['client','student'].includes(r)) || String(entry.employment_status || '').toLowerCase() === 'active';
    };

    directoryUsers.sort((a:any,b:any)=>(Date.parse(a.hire_date)||Infinity)-(Date.parse(b.hire_date)||Infinity)||String(a.id).localeCompare(String(b.id))).forEach((entry:any,index:number)=>entry.command_seniority_order=index);
    let users: any[] = [];
    if (fullAccess) {
      users = directoryUsers.map((u: any) => safeUser(u, true));
    } else if (hrAccess) {
      users = directoryUsers.filter(isInternal).map((u: any) => safeUser(u, true));
    } else if (clientOnly) {
      users = directoryUsers.filter(isInternal).map((u: any) => safeUser(u, false));
    } else if (studentOnly) {
      users = directoryUsers.filter((u: any) => u.email === cleanEmail(me.email) || lowerRoles(u).has('trainer') || u.role === 'admin').map((u: any) => safeUser(u, false));
    } else {
      users = directoryUsers.filter(isInternal).map((u: any) => safeUser(
        u,
        internalPrivileged,
        cleanEmail(u.email) === cleanEmail(me.email),
      ));
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
      meta: {
        user_count: users.length,
        location_count: locations.length,
        division_count: divisions.length,
        degraded_sources: Object.keys(sourceErrors),
        source_errors: sourceErrors,
        data_health: Object.keys(sourceErrors).length ? 'partial' : 'verified',
      },
    });
  } catch (error: any) {
    console.error('getAppDirectory failed', error);
    return Response.json({ error: error?.message || 'Unable to load app directory', users: [], locations: [], divisions: [] }, { status: 500 });
  }
});
