import { createClientFromRequest } from 'npm:@base44/sdk';

const STALE_SESSION_LIMIT_MS = 8 * 60 * 60 * 1000;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

async function hasOpenTimeEntry(base44: any, email: string) {
  const rows = await base44.asServiceRole.entities.TimeEntry.filter({
    officer_email: email,
    archived: { $ne: true },
    $or: [{ clock_out: null }, { clock_out: '' }, { clock_out: { $exists: false } }],
  }, '-clock_in', 1).catch(() => []);
  return Boolean(rows?.length);
}

async function retireLiveOfficer(base44: any, email: string, forceStatus: string | null = null) {
  const mine = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: email }, '-last_update', 100).catch(() => []);
  const now = new Date().toISOString();
  await Promise.all(mine.map((row: any) => base44.asServiceRole.entities.ActiveOfficer.update(row.id, {
    // App/browser presence is separate from duty status. Preserve status and last
    // known GPS unless Clock Out explicitly supplies a new status.
    session_active: false,
    ...(forceStatus ? { status: forceStatus } : {}),
    last_update: now,
    heading: null,
    speed: 0,
    ...(forceStatus === 'Out of Service' ? { current_call_info: '' } : {}),
  }).catch(() => null)));
  return mine.length;
}

async function setOutOfService(base44: any, officer: any, reason: string, alertSupervisors: boolean, prefetchedUnits: any[] | null = null) {
  const now = new Date().toISOString();
  const update = {
    status: 'Out of Service',
    status_since: now,
    last_updated: now,
    current_call_id: null,
    current_call_info: null,
  };

  await base44.asServiceRole.entities.User.update(officer.id, update);

  const units = prefetchedUnits || await base44.asServiceRole.entities.Unit.list(undefined, 1000).catch(() => []);
  const linked = (units || []).filter((unit: any) =>
    unit.user_id === officer.id || lower(unit.user_email) === lower(officer.email)
  );
  await Promise.all(linked.map((unit: any) => base44.asServiceRole.entities.Unit.update(unit.id, {
    status: 'Out of Service',
    last_update_at: now,
    last_updated: now,
    assigned_call_ids: [],
  }).catch(() => null)));

  if (alertSupervisors) {
    await base44.asServiceRole.entities.SupervisorChatMessage.create({
      message: `STATUS ALERT: ${officer.full_name || officer.email || 'Officer'} ${reason}`,
      sender_name: 'Pathfinder CAD System',
      sender_email: 'system@pathfinder.local',
    }).catch(() => null);
  }

  return { id: officer.id, email: officer.email, status: 'Out of Service' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'sweep');

    if (action === 'session_start') {
      // Refreshing/reopening Pathfinder is never a duty-status transition.
      return Response.json({ success: true, changed: false, status: caller.status || 'Out of Service' });
    }

    if (action === 'logout') {
      const clockedIn = await hasOpenTimeEntry(base44, caller.email);
      const retired = await retireLiveOfficer(base44, caller.email);
      if (clockedIn) {
        // Signing out of the app ends presence only. The open TimeEntry keeps the
        // officer's CAD status locked until they actually Clock Out.
        return Response.json({ success: true, changed: false, status: caller.status || 'Available', clocked_in: true, retired_live_records: retired });
      }
      if (lower(caller.status) === 'out of service') {
        return Response.json({ success: true, changed: false, status: 'Out of Service', retired_live_records: retired });
      }
      const result = await setOutOfService(base44, caller, 'signed out while not clocked in.', false);
      return Response.json({ success: true, changed: true, officer: result, retired_live_records: retired });
    }

    if (action === 'clock_out') {
      const result = lower(caller.status) === 'out of service'
        ? { id: caller.id, email: caller.email, status: 'Out of Service' }
        : await setOutOfService(base44, caller, 'clocked out of duty.', false);
      const retired = await retireLiveOfficer(base44, caller.email, 'Out of Service');
      return Response.json({ success: true, changed: lower(caller.status) !== 'out of service', officer: result, retired_live_records: retired });
    }

    if (action === 'self_check') {
      // Health checks may report connectivity, but never alter duty status.
      return Response.json({ success: true, changed: false, status: caller.status || 'Out of Service', clocked_in: await hasOpenTimeEntry(base44, caller.email) });
    }

    // Server health sweep retires only stale browser presence. It never changes
    // CAD duty status. Open TimeEntry remains authoritative until Clock Out.
    const activeSessions = await base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 2000).catch(() => []);
    const staleCutoff = Date.now() - STALE_SESSION_LIMIT_MS;
    const stampNow = new Date().toISOString();
    let retired = 0;
    for (const session of activeSessions || []) {
      if (session?.session_active === false) continue;
      const stamp = new Date(session?.last_update || session?.updated_date || session?.created_date || 0).getTime();
      if (!Number.isFinite(stamp) || stamp > staleCutoff) continue;
      const updated = await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
        session_active: false,
        last_update: stampNow,
        heading: null,
        speed: 0,
      }).catch(() => null);
      if (updated) retired += 1;
    }

    return Response.json({
      success: true,
      checked: (activeSessions || []).length,
      forced_out_of_service: [],
      stale_sessions_retired: retired,
    });
  } catch (error) {
    console.error('enforceOfficerDutyStatus failed:', error);
    return Response.json({ error: error?.message || 'Unable to enforce officer duty status' }, { status: 500 });
  }
});