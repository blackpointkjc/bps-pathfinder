import { createClientFromRequest } from 'npm:@base44/sdk';

const rolesOf = (user: any) => new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const roles = rolesOf(user);
    const hasHR = user.role === 'admin' || roles.has('hr') || roles.has('full_access');
    if (!hasHR) return Response.json({ error: 'HR access required' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list';

    if (action === 'list') {
      const [entries, callOuts] = await Promise.all([
        base44.asServiceRole.entities.TimeEntry.list('-created_date', 5000),
        base44.asServiceRole.entities.CallOut.list('-call_out_date', 5000).catch(() => []),
      ]);
      return Response.json({ success: true, entries: entries || [], call_outs: callOuts || [] });
    }

    if (action === 'create') {
      const data = body.data || {};
      if (!data.officer_email || !data.clock_in) {
        return Response.json({ error: 'Officer and clock-in time are required' }, { status: 400 });
      }
      const entry = await base44.asServiceRole.entities.TimeEntry.create(data);
      return Response.json({ success: true, entry });
    }

    if (action === 'update') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      const entry = await base44.asServiceRole.entities.TimeEntry.update(body.id, body.data || {});
      return Response.json({ success: true, entry });
    }

    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'Time entry ID is required' }, { status: 400 });
      await base44.asServiceRole.entities.TimeEntry.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('manageHRTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to manage HR time entries' }, { status: 500 });
  }
});