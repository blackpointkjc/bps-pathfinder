import { createClientFromRequest } from 'npm:@base44/sdk';

function roleSet(user: any) {
  return new Set((user?.additional_roles || []).map((r: string) => String(r).toLowerCase()));
}

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

    // The Unit Status Board is status-driven, NOT time-entry-driven. An officer
    // appears on the board when they have actively set a duty status; signing out
    // clears that status (logout sets it to "Out of Service"), which drops them
    // from the available roster. Open time entries no longer gate board visibility.
    const onDutyUsers = (users || [])
      .filter((u: any) => u?.email && u?.status)
      .map((user: any) => {
        const unit = newestActiveByEmail.get(String(user.email).toLowerCase());
        return {
          id: user.id,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          full_name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
          rank: user.rank || '',
          unit_number: user.unit_number || unit?.unit_number || '',
          status: unit?.status || user.status || '',
          additional_roles: user.additional_roles || [],
          current_call_info: unit?.current_call_info || user.current_call_info || '',
          last_updated: unit?.last_update || user.last_updated || user.updated_date || '',
        };
      });

    return Response.json({ success: true, units, users: onDutyUsers, open_count: openByEmail.size, signed_in_count: units.length });
  } catch (error) {
    console.error('getOnDutyUnits failed', error);
    return Response.json({ error: error?.message || 'Unable to load on-duty units', units: [], users: [] }, { status: 500 });
  }
});