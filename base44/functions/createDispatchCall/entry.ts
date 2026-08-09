import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const allowed = user.role === 'admin' || user.role === 'dispatch' || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access') || Boolean(user.dispatch_role);
    if (!allowed) return Response.json({ error: 'Dispatch access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const data = body.data || {};
    const selectedUnits = Array.isArray(body.selected_units) ? body.selected_units.filter(Boolean) : [];
    if (!String(data.incident || '').trim() || !String(data.location || '').trim()) {
      return Response.json({ error: 'Incident type and location are required' }, { status: 400 });
    }

    const allowedPriorities = new Set(['low', 'medium', 'high', 'critical']);
    const priority = allowedPriorities.has(data.priority) ? data.priority : 'medium';
    const now = new Date().toISOString();
    const createdCall = await base44.asServiceRole.entities.DispatchCall.create({
      ...data,
      priority,
      assigned_units: selectedUnits,
      status: selectedUnits.length ? 'Dispatched' : (data.status || 'New'),
      time_received: data.time_received || now,
      time_dispatched: selectedUnits.length ? (data.time_dispatched || now) : null,
    });

    for (const unitId of selectedUnits) {
      await base44.asServiceRole.entities.CallAssignment.create({
        call_id: createdCall.id,
        unit_id: unitId,
        role: selectedUnits.indexOf(unitId) === 0 ? 'primary' : 'backup',
        assigned_at: now,
        status: 'pending',
      });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      entity_type: 'DispatchCall',
      entity_id: createdCall.id,
      action: 'create',
      actor_id: user.id,
      actor_name: [user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email,
      after_value: JSON.stringify(createdCall),
      timestamp: now,
    }).catch(() => null);

    return Response.json({ success: true, call: createdCall });
  } catch (error) {
    console.error('createDispatchCall failed', error);
    return Response.json({ error: error?.message || 'Unable to create dispatch call' }, { status: 500 });
  }
});