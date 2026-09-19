import { createClientFromRequest } from 'npm:@base44/sdk';

const AVAILABLE_LIMIT_MS = 8 * 60 * 60 * 1000;
const STALE_SESSION_LIMIT_MS = 8 * 60 * 60 * 1000;

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

function isCadOfficer(user: any) {
  const roles = Array.isArray(user?.additional_roles) ? user.additional_roles.map(lower) : [];
  return roles.includes('cad_access') && roles.includes('officer');
}

function displayName(user: any) {
  const rank = String(user?.rank || 'Officer').trim();
  const last = String(user?.last_name || user?.full_name || user?.email || '').trim().split(/\s+/).pop();
  return [rank, last].filter(Boolean).join(' ');
}

async function retireLiveOfficer(base44: any, email: string) {
  const mine = await base44.asServiceRole.entities.ActiveOfficer.filter({ officer_email: email }, '-last_update', 100).catch(() => []);
  const now = new Date().toISOString();
  await Promise.all(mine.map((row: any) => base44.asServiceRole.entities.ActiveOfficer.update(row.id, {
    session_active: false,
    status: 'Out of Service',
    last_update: now,
    gps_updated_at: null,
    latitude: null,
    longitude: null,
    heading: null,
    speed: 0,
    accuracy: null,
    current_call_info: '',
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
      message: `AUTO STATUS ALERT: ${displayName(officer)}${officer.unit_number ? ` (#${officer.unit_number})` : ''} ${reason} Pathfinder automatically placed the officer Out of Service.`,
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
      const retired = await retireLiveOfficer(base44, caller.email);
      if (lower(caller.status) === 'out of service') {
        return Response.json({ success: true, changed: false, status: 'Out of Service', retired_live_records: retired });
      }
      const result = await setOutOfService(base44, caller, 'started or refreshed a Pathfinder session.', false);
      return Response.json({ success: true, changed: true, officer: result, retired_live_records: retired });
    }

    if (action === 'logout') {
      const retired = await retireLiveOfficer(base44, caller.email);
      if (caller.status === 'Out of Service') {
        return Response.json({ success: true, changed: false, status: 'Out of Service', retired_live_records: retired });
      }
      const alert = lower(caller.status) === 'available';
      const result = await setOutOfService(
        base44,
        caller,
        'logged out while still marked Available and did not manually go Out of Service.',
        alert,
      );
      return Response.json({ success: true, changed: true, officer: result, retired_live_records: retired });
    }

    if (action === 'clock_out') {
      const retired = await retireLiveOfficer(base44, caller.email);
      const result = caller.status === 'Out of Service'
        ? { id: caller.id, email: caller.email, status: 'Out of Service' }
        : await setOutOfService(base44, caller, 'clocked out of duty.', false);
      return Response.json({ success: true, changed: caller.status !== 'Out of Service', officer: result, retired_live_records: retired });
    }

    if (action === 'self_check') {
      if (!isCadOfficer(caller) || lower(caller.status) !== 'available') {
        return Response.json({ success: true, changed: false, status: caller.status || 'Out of Service' });
      }
      const sinceRaw = caller.status_since || caller.last_updated || caller.updated_date;
      const since = sinceRaw ? new Date(sinceRaw).getTime() : NaN;
      if (!caller.status_since) {
        const seeded = new Date().toISOString();
        await base44.asServiceRole.entities.User.update(caller.id, { status_since: seeded });
        return Response.json({ success: true, changed: false, seeded_status_since: seeded });
      }
      if (!Number.isFinite(since) || Date.now() - since < AVAILABLE_LIMIT_MS) {
        return Response.json({ success: true, changed: false, status: 'Available' });
      }
      const result = await setOutOfService(
        base44,
        caller,
        'remained Available for at least 8 hours without going Out of Service.',
        true,
      );
      return Response.json({ success: true, changed: true, officer: result });
    }

    // Fixed server-side sweep: callers cannot choose a target officer. Enforce
    // both the 8-hour Available ceiling and an 8-hour stale live-session cutoff.
    const [users, activeSessions, allUnits] = await Promise.all([
      base44.asServiceRole.entities.User.list(undefined, 2000),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 2000).catch(() => []),
      base44.asServiceRole.entities.Unit.list(undefined, 2000).catch(() => []),
    ]);
    const now = Date.now();
    const availableOfficers = (users || []).filter((officer: any) => isCadOfficer(officer) && lower(officer.status) === 'available');
    for (const officer of availableOfficers) {
      if (!officer.status_since) {
        await base44.asServiceRole.entities.User.update(officer.id, { status_since: new Date().toISOString() }).catch(() => null);
      }
    }
    const stale = availableOfficers.filter((officer: any) => {
      if (!officer.status_since) return false;
      const since = new Date(officer.status_since).getTime();
      return Number.isFinite(since) && now - since >= AVAILABLE_LIMIT_MS;
    });

    const changed = [];
    for (const officer of stale) {
      changed.push(await setOutOfService(
        base44,
        officer,
        'remained Available for at least 8 hours without going Out of Service.',
        true,
        allUnits,
      ));
    }

    const staleCutoff = now - STALE_SESSION_LIMIT_MS;
    const userByEmail = new Map((users || []).map((officer:any) => [lower(officer.email), officer]));
    const staleSessionEmails = new Set<string>();
    const stampNow = new Date().toISOString();
    for (const session of activeSessions || []) {
      if (session?.session_active === false) continue;
      const stamp = new Date(session?.last_update || session?.updated_date || session?.created_date || 0).getTime();
      if (!Number.isFinite(stamp) || stamp > staleCutoff) continue;
      const email = lower(session.officer_email);
      if (!email) continue;
      staleSessionEmails.add(email);
      await base44.asServiceRole.entities.ActiveOfficer.update(session.id, {
        session_active: false,
        status: 'Out of Service',
        last_update: stampNow,
        gps_updated_at: null,
        latitude: null,
        longitude: null,
        heading: null,
        speed: 0,
        accuracy: null,
        current_call_info: '',
      }).catch(() => null);
    }

    const staleSessionOfficers:any[] = [];
    for (const email of staleSessionEmails) {
      const officer = userByEmail.get(email);
      if (!officer) continue;
      staleSessionOfficers.push(await setOutOfService(
        base44,
        officer,
        'had no Pathfinder heartbeat for at least 8 hours and was automatically signed out of the live CAD roster.',
        true,
        allUnits,
      ));
    }

    return Response.json({
      success: true,
      checked: (users || []).length,
      forced_out_of_service: changed,
      stale_sessions_retired: staleSessionOfficers,
    });
  } catch (error) {
    console.error('enforceOfficerDutyStatus failed:', error);
    return Response.json({ error: error?.message || 'Unable to enforce officer duty status' }, { status: 500 });
  }
});