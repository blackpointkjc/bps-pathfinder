const lower = (value: unknown) => String(value || '').trim().toLowerCase();
export const isClosedCall = (call: any) => !call || call.manual_dismissed === true || ['cleared','cancelled','canceled','closed','resolved','completed'].includes(lower(call.status));

// Update every duty-status mirror without modifying presence, GPS or clock records.
// Re-running after a partial failure repairs the same terminal transition.
export async function releaseClosedCall(entities: any, call: any) {
  const callId = String(call.id);
  const assignments = await entities.CallAssignment.filter({ call_id: callId }, '-assigned_at', 1000);
  const refs = new Set([...(call.assigned_units || []), ...assignments.map((a: any) => a.unit_id)].filter(Boolean).map(String));
  const users = new Map<string, any>();
  const directUsers = await entities.User.filter({ current_call_id: callId }, '-updated_date', 1000);
  directUsers.forEach((u: any) => users.set(u.id, u));
  for (const ref of refs) {
    let user = await entities.User.get(ref).catch(() => null);
    if (!user) {
      const unit = await entities.Unit.get(ref).catch(() => null);
      if (unit?.user_id) user = await entities.User.get(unit.user_id);
      else {
        const active = await entities.ActiveOfficer.get(ref).catch(() => null);
        const email = active?.officer_email || (ref.includes('@') ? ref : '');
        if (email) user = (await entities.User.filter({ email }, '-updated_date', 1))[0];
      }
    }
    if (user) users.set(user.id, user);
  }
  const now = new Date().toISOString();
  for (const assignment of assignments) {
    if (lower(assignment.status) !== 'cleared') await entities.CallAssignment.update(assignment.id, { status: 'cleared', cleared_at: assignment.cleared_at || now });
  }
  for (const user of users.values()) {
    const units = await entities.Unit.filter({ user_id: user.id }, '-last_update_at', 100);
    const sessions = await entities.ActiveOfficer.filter({ officer_email: user.email }, '-last_update', 100);
    const aliases = [...new Set([user.id, user.email, ...units.map((u: any) => u.id), ...sessions.map((s: any) => s.id)].filter(Boolean).map(String))];
    const pending: any[] = [];
    for (const alias of aliases) pending.push(...await entities.CallAssignment.filter({ unit_id: alias }, '-assigned_at', 1000));
    const candidateIds = new Set<string>([
      ...pending.filter(a => !['cleared','cancelled','canceled'].includes(lower(a.status))).map(a => String(a.call_id)),
      user.current_call_id, ...sessions.map((s: any) => s.current_call_id),
      ...units.flatMap((u: any) => u.assigned_call_ids || []),
    ].filter(Boolean).map(String));
    // Also cover legacy calls that have assigned_units but no CallAssignment row.
    const legacy = await entities.DispatchCall.filter({ assigned_units: { $in: aliases } }, '-updated_date', 1000);
    legacy.forEach((c: any) => candidateIds.add(String(c.id)));
    candidateIds.delete(callId);
    const remaining: any[] = [];
    for (const id of candidateIds) {
      const other = await entities.DispatchCall.get(id);
      if (!isClosedCall(other)) remaining.push(other);
    }
    const next = remaining[0];
    const current = await entities.User.get(user.id);
    const protectedStatus = ['out of service','distress','emergency','dispatch'].includes(lower(current.status)) || current.distress_active === true || sessions.some((s: any) => s.distress_active === true || ['distress','emergency'].includes(lower(s.status)));
    const status = protectedStatus ? current.status : next ? (['dispatched','enroute','on scene','busy'].includes(lower(current.status)) ? current.status : 'Dispatched') : 'Available';
    const patch = {
      status, current_call_id: next ? String(next.id) : '',
      current_call_info: next ? [next.incident || 'Call for service', next.location].filter(Boolean).join(' · ').slice(0,500) : '',
      last_updated: now, status_since: status === current.status ? current.status_since || now : now,
    };
    await entities.User.update(user.id, patch);
    for (const unit of units) await entities.Unit.update(unit.id, { ...patch, assigned_call_ids: remaining.map(c => String(c.id)) });
    for (const session of sessions) await entities.ActiveOfficer.update(session.id, { ...patch, ...(!next ? { show_lights: false } : {}) });
  }
  return { released_officer_ids: [...users.keys()] };
}
