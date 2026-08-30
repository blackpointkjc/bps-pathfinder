import { createClientFromRequest } from 'npm:@base44/sdk';

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const displayName = (user: any) => [user?.rank, user?.last_name].filter(Boolean).join(' ').trim() || user?.full_name || user?.email || 'Supervisor';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((me.additional_roles || []).map(lower));
    const allowed = me.role === 'admin' || roles.has('full_access') || roles.has('supervisor') || me.is_supervisor === true;
    if (!allowed) return Response.json({ error: 'Duty supervisor scheduling requires administrator or supervisor access.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = lower(body.action || 'save');
    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'Assignment id is required.' }, { status: 400 });
      await base44.asServiceRole.entities.DutySupervisorAssignment.delete(id);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'DutySupervisorAssignment', entity_id: id, action: 'delete', actor_id: String(me.id || me.email), actor_name: displayName(me), timestamp: new Date().toISOString(), description: 'Duty supervisor schedule assignment removed.'
      }).catch(() => null);
      return Response.json({ success: true, deleted: id });
    }

    const row = body.assignment || {};
    const required = ['assignment_date','start_time','end_time','supervisor_email'];
    for (const field of required) if (!String(row[field] || '').trim()) return Response.json({ error: `${field.replaceAll('_',' ')} is required.` }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.list('-updated_date', 1000);
    const supervisor = (users || []).find((user: any) => lower(user.email) === lower(row.supervisor_email));
    if (!supervisor) return Response.json({ error: 'Selected duty supervisor was not found.' }, { status: 400 });
    const supervisorRoles = new Set((supervisor.additional_roles || []).map(lower));
    const supervisorEligible = supervisor.role === 'admin' || supervisor.is_supervisor === true || supervisorRoles.has('supervisor') || supervisorRoles.has('full_access') || ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal'].includes(lower(supervisor.rank));
    if (!supervisorEligible) return Response.json({ error: 'Selected employee is not eligible to serve as duty supervisor.' }, { status: 400 });

    const payload = {
      assignment_date: String(row.assignment_date).slice(0,10),
      start_time: String(row.start_time).slice(0,5),
      end_time: String(row.end_time).slice(0,5),
      location: String(row.location || 'ALL').trim() || 'ALL',
      supervisor_email: lower(supervisor.email),
      supervisor_name: displayName(supervisor),
      supervisor_rank: String(supervisor.rank || '').trim(),
      status: String(row.status || 'scheduled'),
      notes: String(row.notes || '').slice(0,1000),
      updated_by_email: me.email || '',
    };
    let saved;
    if (row.id) saved = await base44.asServiceRole.entities.DutySupervisorAssignment.update(String(row.id), payload);
    else saved = await base44.asServiceRole.entities.DutySupervisorAssignment.create({ ...payload, created_by_email: me.email || '' });

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DutySupervisorAssignment', entity_id: String(saved?.id || row.id || ''), action: row.id ? 'update' : 'create', actor_id: String(me.id || me.email), actor_name: displayName(me), timestamp: new Date().toISOString(), description: `Duty supervisor scheduled: ${payload.supervisor_name} · ${payload.assignment_date} ${payload.start_time}-${payload.end_time} · ${payload.location}`
    }).catch(() => null);

    return Response.json({ success: true, assignment: saved || payload });
  } catch (error) {
    console.error('manageDutySupervisorSchedule failed', error);
    return Response.json({ error: error?.message || 'Unable to manage duty supervisor schedule.' }, { status: 500 });
  }
});
