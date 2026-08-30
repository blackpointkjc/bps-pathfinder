import { createClientFromRequest } from 'npm:@base44/sdk';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const roles = new Set((me.additional_roles || []).map((role: unknown) => String(role).toLowerCase()));
    let officer = me;
    if (body.preview_user_id) {
      if (me.role !== 'admin' && !roles.has('full_access')) return Response.json({ error: 'Preview access denied' }, { status: 403 });
      officer = await base44.asServiceRole.entities.User.get(String(body.preview_user_id)).catch(() => null);
      if (!officer?.id) return Response.json({ error: 'Officer not found' }, { status: 404 });
    }
    const officerEmail = String(officer.work_email || officer.pathfinder_email || officer.email || '').trim().toLowerCase();
    const entries = await base44.asServiceRole.entities.TimeEntry.filter(
      { officer_email: officerEmail },
      '-clock_in',
      2000,
    );
    return Response.json({ success: true, entries: (entries || []).filter((entry: any) => entry.archived !== true) });
  } catch (error) {
    console.error('getMyTimeEntries failed', error);
    return Response.json({ error: error?.message || 'Unable to load time entries', entries: [] }, { status: 500 });
  }
});