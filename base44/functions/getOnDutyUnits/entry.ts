import { createClientFromRequest } from 'npm:@base44/sdk';

function roleSet(user: any) {
  return new Set((user?.additional_roles || []).map((r: string) => String(r).toLowerCase()));
}

const lower = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = roleSet(me);
    const allowed = me.role === 'admin' || Boolean(me.dispatch_role) || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor') || roles.has('dispatch');
    if (!allowed) return Response.json({ error: 'Operational access required' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    if (input?.history_email) {
      if (me.role !== 'admin' && !roles.has('full_access') && !roles.has('supervisor')) {
        return Response.json({ error: 'Location history access required' }, { status: 403 });
      }
      const history = await base44.asServiceRole.entities.LocationHistory.filter(
        { officer_email: String(input.history_email) },
        'timestamp',
        5000,
      );
      return Response.json({ success: true, history: (history || []).filter((point: any) => Boolean(point.time_entry_id)) });
    }

    const [timeEntries, activeOfficers, users] = await Promise.all([
      base44.asServiceRole.entities.TimeEntry.list('-clock_in', 3000),
      base44.asServiceRole.entities.ActiveOfficer.list('-last_update', 1000),
      base44.asServiceRole.entities.User.list('-updated_date', 1000),
    ]);

    const openByEmail = new Map<string, any>();
    for (const entry of timeEntries || []) {
      if (!entry?.officer_email || !entry?.clock_in || entry?.clock_out || entry?.archived === true) continue;
      const email = String(entry.officer_email).toLowerCase();
      if (!openByEmail.has(email)) openByEmail.set(email, entry);
    }

    const userByEmail = new Map((users || []).filter((u: any) => u?.email).map((u: any) => [String(u.email).toLowerCase(), u]));
    const newestActiveByEmail = new Map<string, any>();
    for (const active of activeOfficers || []) {
      if (!active?.officer_email) continue;
      const email = String(active.officer_email).toLowerCase();
      const existing = newestActiveByEmail.get(email);
      const activeTs = new Date(active.last_update || active.updated_date || active.created_date || 0).getTime();
      const existingTs = new Date(existing?.last_update || existing?.updated_date || existing?.created_date || 0).getTime();
      if (!existing || activeTs > existingTs) newestActiveByEmail.set(email, active);
    }

    // ActiveOfficer is the signed-in live GPS source. TimeEntry is optional context;
    // it must never gate whether a logged-in officer appears on the live map.
    const freshCutoff = Date.now() - 2 * 60 * 1000;
    const units: any[] = [];
    for (const [email, active] of newestActiveByEmail.entries()) {
      const activeTs = new Date(active.last_update || active.updated_date || active.created_date || 0).getTime();
      if (active.session_active === false || !Number.isFinite(activeTs) || activeTs < freshCutoff) continue;
      const gpsTs = new Date(active.gps_updated_at || 0).getTime();
      const accuracy = Number(active.accuracy);
      const hasReliableGps = Number.isFinite(gpsTs)
        && gpsTs >= freshCutoff
        && Number.isFinite(Number(active.latitude))
        && Number.isFinite(Number(active.longitude))
        && Number.isFinite(accuracy)
        && accuracy <= 100;
      const entry = openByEmail.get(email) || null;
      const user = userByEmail.get(email) || {};
      units.push({
        id: active.id || entry?.id,
        officer_email: active.officer_email || entry?.officer_email,
        full_name: active.officer_name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
        officer_name: active.officer_name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        rank: user.rank || '',
        unit_number: active.unit_number || user.unit_number || '',
        status: active.status || user.status || 'Available',
        latitude: hasReliableGps ? active.latitude : null,
        longitude: hasReliableGps ? active.longitude : null,
        heading: hasReliableGps ? active.heading : null,
        speed: hasReliableGps ? active.speed : 0,
        accuracy: hasReliableGps ? active.accuracy : null,
        gps_updated_at: hasReliableGps ? active.gps_updated_at : null,
        last_gps_updated_at: active.gps_updated_at || null,
        gps_pending: !hasReliableGps,
        show_lights: active.show_lights,
        current_call_info: active.current_call_info || user.current_call_info || '',
        current_location: active.current_location || entry?.location || '',
        clock_in_time: entry?.clock_in || active.clock_in_time || '',
        last_update: active.last_update || active.updated_date || active.created_date || entry?.clock_in,
        last_updated: active.last_update || active.updated_date || active.created_date || entry?.clock_in,
        is_supervisor: roleSet(user).has('supervisor') || String(user.rank || '').toLowerCase().includes('sergeant') || String(user.rank || '').toLowerCase().includes('lieutenant') || String(user.rank || '').toLowerCase().includes('captain') || String(user.rank || '').toLowerCase().includes('major') || String(user.rank || '').toLowerCase().includes('colonel'),
        time_entry_id: entry?.id || '',
      });
    }

    // A TimeEntry can remain open after the person logs out. Keep those records
    // separate from live signed-in sessions so Admin Location Tracker can flag
    // "clocked in but logged out" instead of incorrectly reporting No Location = 0.
    const freshSessionEmails = new Set(units.map((row: any) => String(row.officer_email || '').toLowerCase()).filter(Boolean));
    const clockedInWithoutSession = [...openByEmail.entries()]
      .filter(([email]) => !freshSessionEmails.has(email))
      .map(([email, entry]) => {
        const user = userByEmail.get(email) || {};
        return {
          officer_email: entry.officer_email || user.email || email,
          officer_name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || entry.officer_email || email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          rank: user.rank || '',
          unit_number: user.unit_number || '',
          current_location: entry.location || user.assigned_location || '',
          clock_in_time: entry.clock_in || '',
          time_entry_id: entry.id || '',
          reason: 'Clocked in, but no fresh signed-in Pathfinder session heartbeat is active.',
        };
      });

    // Canonical Unit Status Board feed: a field officer may only appear Available,
    // Enroute, On Scene, Busy, or Distress while a fresh signed-in ActiveOfficer
    // session exists. A stale User/Unit status can never keep someone Available
    // after logout or loss of heartbeat. Signed-out officers resolve to OOS.
    const operational = (user:any) => {
      const roles = roleSet(user);
      const rank = lower(user?.rank);
      if (!user?.email || user?.termination_date) return false;
      if (roles.has('client') || roles.has('student') || roles.has('pending')) return false;
      return roles.has('officer') || roles.has('cad_access') || ['officer','corporal','sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel'].includes(rank);
    };
    const onDutyUsers = (users || [])
      .filter(operational)
      .map((user: any) => {
        const active = newestActiveByEmail.get(String(user.email).toLowerCase());
        const activeTs = new Date(active?.last_update || active?.updated_date || active?.created_date || 0).getTime();
        const userStatusTs = new Date(user.last_updated || user.status_since || user.updated_date || 0).getTime();
        const signedInFresh = Boolean(active && active.session_active !== false && Number.isFinite(activeTs) && activeTs >= freshCutoff);
        // A dedicated status change writes User and ActiveOfficer together. If a
        // duplicate/racing ActiveOfficer row is momentarily older than User, honor
        // the newer User status instead of showing OOS/stale status on the board.
        // Signed-out users still resolve OOS because logout writes OOS and closes the
        // live session.
        const newestLiveStatus = Number.isFinite(userStatusTs) && userStatusTs > activeTs
          ? (user.status || active?.status || 'Available')
          : (active?.status || user.status || 'Available');
        const resolvedStatus = signedInFresh ? newestLiveStatus : 'Out of Service';
        return {
          id: user.id,
          user_id: user.id,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          full_name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
          rank: user.rank || '',
          profile_photo_url: user.profile_photo_url || '',
          unit_number: active?.unit_number || user.unit_number || '',
          status: resolvedStatus,
          additional_roles: user.additional_roles || [],
          current_call_info: signedInFresh ? (active?.current_call_info || user.current_call_info || '') : '',
          current_location: signedInFresh ? (active?.current_location || openByEmail.get(String(user.email).toLowerCase())?.location || user.assigned_location || '') : (user.assigned_location || ''),
          assigned_location: user.assigned_location || '',
          last_updated: active?.last_update || user.last_updated || user.updated_date || '',
          session_active: signedInFresh,
        };
      });

    return Response.json({
      success: true,
      units,
      users: onDutyUsers,
      open_count: openByEmail.size,
      signed_in_count: units.length,
      clocked_in_without_session: clockedInWithoutSession,
      clocked_in_without_session_count: clockedInWithoutSession.length,
    });
  } catch (error) {
    console.error('getOnDutyUnits failed', error);
    return Response.json({ error: error?.message || 'Unable to load on-duty units', units: [], users: [] }, { status: 500 });
  }
});