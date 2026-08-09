import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const id = String(body.id || '');
    if (!id) return Response.json({ error: 'Time entry is required' }, { status: 400 });

    const entry = await base44.asServiceRole.entities.TimeEntry.get(id);
    if (!entry) return Response.json({ success: true, already_removed: true });
    if (String(entry.officer_email || '').toLowerCase() !== String(user.email).toLowerCase()) {
      return Response.json({ error: 'You can only roll back your own time entry' }, { status: 403 });
    }
    const created = new Date(entry.created_date || entry.clock_in || 0).getTime();
    if (!created || Date.now() - created > 10 * 60 * 1000) {
      return Response.json({ error: 'This time entry is too old to roll back automatically' }, { status: 409 });
    }
    await base44.asServiceRole.entities.TimeEntry.delete(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('rollbackMyTimeEntry failed', error);
    return Response.json({ error: error?.message || 'Unable to roll back time entry' }, { status: 500 });
  }
});
