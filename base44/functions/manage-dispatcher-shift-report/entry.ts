import { createClientFromRequest } from "npm:@base44/sdk";

const lower = (value: unknown) => String(value || '').trim().toLowerCase();
const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: unknown) => lower(role)));

function canDispatch(user: any) {
  const roles = rolesOf(user);
  return user?.role === 'admin' || lower(user?.role) === 'dispatch' || user?.dispatch_role === true || roles.has('dispatch') || roles.has('cad_access') || roles.has('full_access');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (!canDispatch(me)) return Response.json({ error: 'Dispatch role required' }, { status: 403 });

    const { reportId, data, isDraft = false } = await req.json();
    if (!data?.shift_date) return Response.json({ error: 'Shift date is required' }, { status: 400 });
    const payload = {
      dispatcher_email: me.email || '',
      dispatcher_name: me.full_name || [me.rank, me.first_name, me.last_name].filter(Boolean).join(' ') || me.email || 'Dispatcher',
      shift_date: data.shift_date,
      shift_start: data.shift_start || '',
      shift_end: data.shift_end || '',
      summary: data.summary || '',
      dispatch_log: Array.isArray(data.dispatch_log) ? data.dispatch_log : [],
      status: isDraft ? 'draft' : 'submitted',
      was_rejected: false,
      admin_notes: null,
    };

    let report;
    if (reportId) {
      const current = await base44.asServiceRole.entities.DispatcherShiftReport.get(reportId);
      if (!current) return Response.json({ error: 'Dispatcher shift log not found' }, { status: 404 });
      const owns = lower(current.dispatcher_email) === lower(me.email);
      if (!owns && me.role !== 'admin' && !rolesOf(me).has('full_access')) return Response.json({ error: 'You can only edit your own dispatcher shift log' }, { status: 403 });
      if (current.status === 'approved') return Response.json({ error: 'Approved dispatcher logs cannot be edited' }, { status: 409 });
      report = await base44.asServiceRole.entities.DispatcherShiftReport.update(reportId, payload);
    } else {
      report = await base44.asServiceRole.entities.DispatcherShiftReport.create(payload);
    }
    return Response.json({ success: true, report });
  } catch (error) {
    console.error('manage-dispatcher-shift-report failed', error);
    return Response.json({ error: error?.message || 'Unable to save dispatcher shift log' }, { status: 500 });
  }
});