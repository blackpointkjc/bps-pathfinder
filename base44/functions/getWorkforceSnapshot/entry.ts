import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

function easternDateKey(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = new Set((me.additional_roles || []).map((role: unknown) => lower(role)));
    const blocked = roles.has('client') || roles.has('student') || roles.has('pending')
      || ['client','student','pending'].includes(lower(me.user_type))
      || ['client','student'].includes(lower(me.rank));
    if (blocked) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const [usersResult, entriesResult, activeResult] = await Promise.allSettled([
      base44.asServiceRole.entities.User.list('-updated_date', 1200),
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 2000),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 800),
    ]);

    const users = usersResult.status === 'fulfilled' && Array.isArray(usersResult.value) ? usersResult.value : [];
    const entries = entriesResult.status === 'fulfilled' && Array.isArray(entriesResult.value) ? entriesResult.value : [];
    const activeRows = activeResult.status === 'fulfilled' && Array.isArray(activeResult.value) ? activeResult.value : [];
    const errors: string[] = [];
    if (usersResult.status === 'rejected') errors.push('employee directory');
    if (entriesResult.status === 'rejected') errors.push('time entries');
    if (activeResult.status === 'rejected') errors.push('live officer sessions');

    const today = easternDateKey();
    const employees = users.filter((row: any) =>
      !row?.termination_date && lower(row?.employment_status) !== 'terminated'
    );
    const todayEntries = entries.filter((entry: any) =>
      entry?.clock_in && entry?.archived !== true && easternDateKey(entry.clock_in) === today
    );
    const activeEntries = entries.filter((entry: any) =>
      entry?.clock_in && !entry?.clock_out && entry?.archived !== true
    );

    const newestSessionByEmail = new Map<string, any>();
    for (const row of activeRows) {
      const email = lower(row?.officer_email);
      if (!email || newestSessionByEmail.has(email)) continue;
      newestSessionByEmail.set(email, row);
    }
    const signedIn = [...newestSessionByEmail.values()].filter((row: any) => row?.session_active === true);
    const online = signedIn.filter((row: any) => {
      const at = new Date(row?.last_update || 0).getTime();
      return Number.isFinite(at) && Date.now() - at <= 15 * 60 * 1000;
    });

    return Response.json({
      success: true,
      generated_at: new Date().toISOString(),
      today,
      users: employees,
      today_entries: todayEntries,
      active_entries: activeEntries,
      signed_in_units: signedIn,
      counts: {
        active_employees: employees.length,
        admins: employees.filter((row: any) => lower(row?.role) === 'admin').length,
        clocked_in: activeEntries.length,
        today_entries: todayEntries.length,
        signed_in: signedIn.length,
        online: online.length,
      },
      load_errors: errors,
    });
  } catch (error) {
    console.error('getWorkforceSnapshot failed', error);
    return Response.json({ error: error?.message || 'Unable to load workforce snapshot' }, { status: 500 });
  }
});