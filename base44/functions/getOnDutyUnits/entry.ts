import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

function roleSet(user: any) {
  return new Set((user?.additional_roles || []).map((r: string) => String(r).toLowerCase()));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = roleSet(me);
    const allowed = me.role === 'admin' || roles.has('full_access') || roles.has('cad_access') || roles.has('officer') || roles.has('supervisor') || roles.has('dispatch');
    if (!allowed) return Response.json({ error: 'Operational access required' }, { status: 403 });

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
      if (!openByEmail.has(email)) continue;
      const existing = newestActiveByEmail.get(email);
      const activeTs = new Date(active.last_update || active.updated_date || active.created_date || 0).getTime();
      const existingTs = new Date(existing?.last_update || existing?.updated_date || existing?.created_date || 0).getTime();
      if (!existing || activeTs > existingTs) newestActiveByEmail.set(email, active);
    }

    const now = Date.now();
    const MAX_STALE_MS = 15 * 60 * 1000;
    const units: any[] = [];
    for (const [email, active] of newestActiveByEmail.entries()) {
      const last = new Date(active.last_update || active.updated_date || active.created_date || 0).getTime();
      if (!last || now - last > MAX_STALE_MS) continue;
      const user = userByEmail.get(email) || {};
      const entry = openByEmail.get(email);
      units.push({
        id: active.id,
        officer_email: active.officer_email,
        full_name: active.officer_name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
        officer_name: active.officer_name || user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        rank: user.rank || '',
        unit_number: active.unit_number || user.unit_number || '',
        status: active.status || user.status || 'Available',
        latitude: active.latitude,
        longitude: active.longitude,
        heading: active.heading,
        speed: active.speed,
        show_lights: active.show_lights,
        current_call_info: active.current_call_info || user.current_call_info || '',
        current_location: active.current_location || entry?.location || '',
        clock_in_time: entry?.clock_in || active.clock_in_time || '',
        last_update: active.last_update || active.updated_date || active.created_date,
        last_updated: active.last_update || active.updated_date || active.created_date,
        is_supervisor: roleSet(user).has('supervisor') || String(user.rank || '').toLowerCase().includes('sergeant') || String(user.rank || '').toLowerCase().includes('lieutenant') || String(user.rank || '').toLowerCase().includes('captain') || String(user.rank || '').toLowerCase().includes('major') || String(user.rank || '').toLowerCase().includes('colonel'),
        time_entry_id: entry?.id || '',
      });
    }

    const onDutyUsers = [...openByEmail.keys()].map(email => {
      const user = userByEmail.get(email);
      const unit = newestActiveByEmail.get(email);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        full_name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '),
        rank: user.rank || '',
        unit_number: user.unit_number || unit?.unit_number || '',
        status: unit?.status || user.status || 'Available',
        additional_roles: user.additional_roles || [],
        current_call_info: unit?.current_call_info || user.current_call_info || '',
        last_updated: unit?.last_update || user.last_updated || user.updated_date || '',
      };
    }).filter(Boolean);

    return Response.json({ success: true, units, users: onDutyUsers, open_count: openByEmail.size });
  } catch (error) {
    console.error('getOnDutyUnits failed', error);
    return Response.json({ error: error?.message || 'Unable to load on-duty units', units: [], users: [] }, { status: 500 });
  }
});